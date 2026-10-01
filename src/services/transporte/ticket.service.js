// Generacion de los tickets PDF de encomienda.
//
// Arma el payload que consume la API SUNAT y la invoca. No conoce req ni res:
// devuelve un descriptor { status, body } y el controller lo responde.
const fetch = require('node-fetch');

const { toIsoDate, toIsoTime, toIsoDateTimeLima, toNumber } = require('../../utils/formato');
const { leerRespuestaSunat } = require('../../utils/sunat');
const repository = require('../../repositories/transporte/ticket.repository');

const SUNAT_API_BASE_URL = 'https://expertcont-api-sunat.up.railway.app';
const TICKET_ENCOMIENDA_ENDPOINT = '/cpesunatticketencomienda/v2';
const TICKET_ENCOMIENDA_ADMIN_ENDPOINT = '/cpesunatticketencomienda';
const TICKET_ENCOMIENDA_ENDPOINTS_PERMITIDOS = [
  TICKET_ENCOMIENDA_ENDPOINT,
  TICKET_ENCOMIENDA_ADMIN_ENDPOINT,
];

const normalizarTexto = (valor) => (valor || '').toString().trim();

const resolverEndpointTicketEncomienda = (endpointSolicitado, endpointDefault = TICKET_ENCOMIENDA_ENDPOINT) => {
  const endpointNormalizado = normalizarTexto(endpointSolicitado);
  const endpointPath = endpointNormalizado.startsWith(SUNAT_API_BASE_URL)
    ? endpointNormalizado.slice(SUNAT_API_BASE_URL.length)
    : endpointNormalizado;

  return TICKET_ENCOMIENDA_ENDPOINTS_PERMITIDOS.includes(endpointPath)
    ? endpointPath
    : endpointDefault;
};

const formaPagoSunatEncomienda = () => 'Contado';

// Arma el JSON del ticket a partir de la encomienda y la contabilidad ADMIN.
const generaJsonTicketEncomiendaExpertcontTransporte = async (
  p_periodo,
  p_id_usuario,
  p_documento_id,
  p_r_cod,
  p_r_serie,
  p_r_numero,
  p_elemento,
  endpointPdf = TICKET_ENCOMIENDA_ENDPOINT
) => {
  const datos = await repository.obtenerContabilidadAdminQuery(p_id_usuario, p_documento_id);

  if (!datos) {
    throw new Error('CONTABILIDAD NO ENCONTRADA');
  }

  const venta = await repository.obtenerEncomiendaTicketQuery({
    periodo: p_periodo,
    idUsuario: p_id_usuario,
    documentoId: p_documento_id,
    rCod: p_r_cod,
    rSerie: p_r_serie,
    rNumero: p_r_numero,
    elemento: p_elemento,
  });

  if (!venta) {
    throw new Error('ENCOMIENDA NO ENCONTRADA');
  }

  if (String(venta.tipo_operacion || '').trim() !== 'E') {
    throw new Error('Solo se puede generar ticket para una operacion de encomienda');
  }

  const total = toNumber(venta.r_monto_total || venta.precio_neto);
  const fechaTicket = toIsoDate(venta.r_fecemi);
  const horaTicket = toIsoTime();
  const fechaHoraTicket = toIsoDateTimeLima(fechaTicket, horaTicket);

  return JSON.stringify({
    rubro: 'TRANS_ENCOMIENDA',
    endpoint_pdf: endpointPdf,
    empresa: {
      ruc: datos.documento_id,
      razon_social: datos.razon_social,
      nombre_comercial: datos.razon_social,
      domicilio_fiscal: datos.direccion,
      direccion: datos.direccion,
      ubigeo: datos.ubigeo,
      distrito: datos.distrito,
      provincia: datos.provincia,
      departamento: datos.departamento,
      modo: datos.modo,
    },
    cliente: {
      razon_social_nombres: venta.cliente,
      documento_identidad: venta.cliente_documento_id,
      tipo_identidad: venta.cliente_id_doc,
      cliente_direccion: venta.cliente_direccion_fact || venta.cliente_direccion || '',
    },
    venta: {
      codigo: venta.r_cod_ref || venta.r_cod,
      serie: venta.r_serie_ref || venta.r_serie,
      numero: venta.r_numero_ref || venta.r_numero,
      fecha_emision: fechaTicket,
      hora_emision: horaTicket,
      fecha_hora_emision: fechaHoraTicket,
      moneda_id: 'PEN',
      forma_pago_id: formaPagoSunatEncomienda(),
      medio_pago: 'EFECTIVO',
      total,
      r_monto_total: total,
      total_igv: toNumber(venta.r_igv),
      base_gravada: toNumber(venta.r_gravado),
      base_exonerada: toNumber(venta.r_exonerado),
      nota: venta.numero_rdi ? `RDI: ${venta.numero_rdi}` : '',
      r_vfirmado: venta.r_vfirmado || '',
    },
    encomienda: {
      periodo: venta.periodo,
      r_cod: venta.r_cod,
      r_serie: venta.r_serie,
      r_numero: venta.r_numero,
      elemento: venta.elemento,
      r_fecemi: fechaTicket,
      ctrl_crea: fechaHoraTicket,
      ctrl_crea_hora: horaTicket,
      ctrl_crea_us: venta.ctrl_crea_us || '',
      registrado_por_correo: venta.ctrl_crea_us || '',
      cliente: venta.cliente,
      cliente_documento_id: venta.cliente_documento_id,
      cliente_telefono: venta.cliente_telefono,
      cliente_direccion_fact: venta.cliente_direccion_fact || '',
      cliente_direccion: venta.cliente_direccion_fact || venta.cliente_direccion || '',
      remitente_zona: venta.cliente_zona,
      remitente_direccion: venta.cliente_direccion,
      destinatario: venta.destinatario,
      destinatario_documento_id: venta.destinatario_documento_id,
      destinatario_telefono: venta.destinatario_telefono,
      destinatario_zona: venta.destinatario_zona,
      destinatario_direccion: venta.destinatario_direccion,
      id_ruta: venta.id_ruta,
      nombre_ruta: venta.nombre_ruta,
      id_punto_venta: venta.id_punto_venta,
      punto_venta_nombre: venta.punto_venta_nombre,
      id_punto_venta_dest: venta.id_punto_venta_dest,
      punto_venta_dest_nombre: venta.punto_venta_dest_nombre,
      descripcion: venta.descripcion,
      placa: venta.placa,
      licencia: venta.licencia,
      condicion_pago: venta.condicion_pago,
      medio_pago: 'EFECTIVO',
      llegada_aprox: toIsoTime(venta.llegada_aprox),
      numero_rdi: venta.numero_rdi,
      observaciones: venta.numero_rdi ? `RDI: ${venta.numero_rdi}` : '-',
      precio_neto: total,
      r_monto_total: total,
    },
    ticket: {
      formato: 'ENCOMIENDA_BOARDING_PASS_80MM',
      titulo: 'ENCOMIENDA',
      mostrar_origen_destino: true,
      mostrar_qr: true,
      registrado_por_correo: venta.ctrl_crea_us || '',
      endpoint_pdf: endpointPdf,
      rubro: 'TRANS_ENCOMIENDA',
    },
    items: [
      {
        producto: venta.descripcion || 'SERVICIO DE TRANSPORTE DE ENCOMIENDA',
        cantidad: 1,
        precio_neto: total,
      }
    ],
  }, null, 2);
};

// Genera el ticket. Devuelve { status, body } para que el controller lo
// responda sin cambiar ningun codigo de estado ni de cuerpo.
const generarTicketEncomienda = async ({
  periodo,
  id_usuario,
  documento_id,
  r_cod,
  r_serie,
  r_numero,
  elemento,
  endpoint_pdf,
  endpointTicket = TICKET_ENCOMIENDA_ENDPOINT,
}) => {
  const endpointPdfFinal = resolverEndpointTicketEncomienda(endpoint_pdf, endpointTicket);

  if (
    !periodo ||
    !id_usuario ||
    !documento_id ||
    !r_cod ||
    !r_serie ||
    !r_numero ||
    elemento === undefined
  ) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Faltan parametros requeridos para generar ticket de encomienda'
      }
    };
  }

  try {
    const jsonString = await generaJsonTicketEncomiendaExpertcontTransporte(
      periodo,
      id_usuario,
      documento_id,
      r_cod,
      r_serie,
      r_numero,
      elemento,
      endpointPdfFinal
    );

    const apiResponse = await fetch(`${SUNAT_API_BASE_URL}${endpointPdfFinal}`, {
      method: 'POST',
      body: jsonString,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await leerRespuestaSunat(apiResponse);

    if (!apiResponse.ok) {
      return {
        status: apiResponse.status,
        body: {
          success: false,
          message: responseData.respuesta_sunat_descripcion || responseData.message || 'No se pudo generar el ticket de encomienda',
          ruta_pdf: responseData.ruta_pdf || 'error'
        }
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        respuesta_sunat_descripcion: responseData.respuesta_sunat_descripcion,
        ruta_pdf: responseData.ruta_pdf
      }
    };
  } catch (error) {
    console.error('Error generando ticket PDF de encomienda:', error);
    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno generando ticket de encomienda',
        ruta_pdf: 'error'
      }
    };
  }
};

module.exports = {
  TICKET_ENCOMIENDA_ENDPOINT,
  TICKET_ENCOMIENDA_ADMIN_ENDPOINT,
  resolverEndpointTicketEncomienda,
  generaJsonTicketEncomiendaExpertcontTransporte,
  generarTicketEncomienda,
};