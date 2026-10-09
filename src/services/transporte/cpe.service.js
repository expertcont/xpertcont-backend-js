// Reglas del envio individual de CPE de transporte.
//
// Arma el payload del CPE, lo manda a la API SUNAT, interpreta la respuesta y
// guarda el resultado en mve_transventa. El SQL esta en el repository y el HTTP
// en el controller.
//
const fetch = require('node-fetch');
const { toIsoDateColumna, toIsoTime, toNumber } = require('../../utils/formato');
const { leerRespuestaSunat, normalizarErrorSunatTransporte } = require('../../utils/sunat');
const { normalizarTexto } = require('../../utils/texto');
const repository = require('../../repositories/transporte/cpe.repository');

const API_CPE_URL = 'https://expertcont-api-sunat.up.railway.app/cpesunat';

// El CDR se guarda recortado a 100 caracteres en mve_transventa.cdr_descripcion.
// Este recorte es exclusivo de este modulo.
const limitarCdrDescripcionTransporte = (valor) => normalizarTexto(valor).substring(0, 100);

// Construye el JSON que se envia a la API SUNAT.
// Acumula los errores con statusCode y nivel para que el catch final los
// normalice igual que en el legacy.
// OJO: el nombre es "genera" + "Json" (39 chars), exactamente como en el legacy.
// No "corregirlo" a "generar": esto es una refactorizacion, no un renombrado.
const generaJsonPrevioCPEexpertcontTransporte = async ({
  periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento,
}) => {
  const datos = await repository.obtenerDatosContabilidad({ idUsuario, documentoId });

  if (!datos) {
    throw new Error('CONTABILIDAD NO ENCONTRADA');
  }

  const venta = await repository.obtenerEncomiendaParaCpe({
    periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento,
  });

  if (!venta) {
    throw new Error('OPERACION DE TRANSPORTE NO ENCONTRADA');
  }

  const tipoOperacion = String(venta.tipo_operacion || '').trim().toUpperCase();
  const esBoleto = tipoOperacion === 'B';
  const esEncomienda = tipoOperacion === 'E';

  if (!esEncomienda && !esBoleto) {
    throw new Error('Solo se puede enviar a SUNAT una operacion de transporte valida');
  }

  if (normalizarTexto(venta.numero_rdi)) {
    const error = new Error(`La operacion ya fue incluida en el RDI ${venta.numero_rdi}. No corresponde envio individual.`);
    error.statusCode = 409;
    error.nivel = 'PENDIENTE';
    throw error;
  }

  if (normalizarTexto(venta.r_vfirmado)) {
    const error = new Error('La operacion ya tiene firma SUNAT registrada. Use las descargas del comprobante.');
    error.statusCode = 409;
    error.nivel = 'ACEPTADO';
    throw error;
  }

  const baseGravada = toNumber(venta.r_gravado);
  const baseExonerada = toNumber(venta.r_exonerado);
  const totalIgv = toNumber(venta.r_igv);
  const total = toNumber(venta.r_monto_total || venta.precio_neto);
  const porcIgv = toNumber(venta.porc_igv, baseGravada > 0 ? 18 : 0);
  const tipoIgvCodigo = baseGravada > 0 ? '10' : '20';
  const precioBase = baseGravada > 0 ? baseGravada : baseExonerada || total;
  const fechaEmision = toIsoDateColumna(venta.r_fecemi);

  const descripcion = [
    venta.descripcion || (esBoleto ? 'SERVICIO DE TRANSPORTE DE PASAJEROS' : 'SERVICIO DE TRANSPORTE DE ENCOMIENDA'),
    venta.nombre_ruta ? `Ruta: ${venta.nombre_ruta}` : '',
    esBoleto && venta.asiento ? `Asiento: ${venta.asiento}` : '',
    esBoleto && venta.ref_pasajero_nombres ? `Pasajero: ${venta.ref_pasajero_nombres}` : '',
    !esBoleto && venta.destinatario ? `Destinatario: ${venta.destinatario}` : ''
  ].filter(Boolean).join(' | ');

  const jsonPayload = {
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
      cliente_direccion_fact: venta.cliente_direccion_fact || '',
      cliente_direccion: venta.cliente_direccion_fact || venta.cliente_direccion || '',
    },
    venta: {
      codigo: venta.r_cod_ref || venta.r_cod,
      serie: venta.r_serie_ref || venta.r_serie,
      numero: venta.r_numero_ref || venta.r_numero,
      fecha_emision: fechaEmision,
      hora_emision: toIsoTime(venta.ctrl_crea),
      moneda_id: 'PEN',
      forma_pago_id: 'Contado',
      efectivo2: 0,
      forma_pago2: '',
      base_gravada: baseGravada,
      base_exonerada: baseExonerada,
      base_inafecta: '',
      base_gratuita: 0,
      total_igv: totalIgv,
      vendedor: '',
      nota: venta.numero_rdi ? `RDI: ${venta.numero_rdi}` : '',
      ref_codigo: venta.r_cod_ref ? venta.r_cod : '',
      ref_serie: venta.r_serie_ref ? venta.r_serie : '',
      ref_numero: venta.r_numero_ref ? venta.r_numero : '',
      motivo_id: '01',
      motivo: 'Anulacion de la Operacion',
      r_vfirmado: ''
    },
    items: [
      {
        producto: descripcion,
        cantidad: 1,
        precio_base: precioBase,
        precio_neto: total,
        codigo_sunat: '-',
        codigo_producto: 'SERV-TRANS',
        codigo_unidad: 'ZZ',
        tipo_igv_codigo: tipoIgvCodigo,
        porc_igv: porcIgv,
      }
    ],
  };

  return JSON.stringify(jsonPayload, null, 2);
};

const generarCPEexpertcontTransporte = async (datosEntrada) => {
  const { periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento, ctrlModUs } = datosEntrada;

  try {
    const jsonString = await generaJsonPrevioCPEexpertcontTransporte({
      periodo,
      idUsuario,
      documentoId,
      rCod,
      rSerie,
      rNumero,
      elemento
    });

    const strUrlApi = API_CPE_URL;
    const apiResponse = await fetch(strUrlApi, {
      method: 'POST',
      body: jsonString,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await leerRespuestaSunat(apiResponse);

    if (!apiResponse.ok) {
      const errorNormalizado = normalizarErrorSunatTransporte(responseData);
      await repository.actualizarCdrDescripcionSunat({
        periodo,
        idUsuario,
        documentoId,
        rCod,
        rSerie,
        rNumero,
        elemento,
        cdrDescripcion: limitarCdrDescripcionTransporte(errorNormalizado.respuesta_sunat_descripcion),
        ctrlModUs,
      });

      return {
        status: apiResponse.status,
        body: errorNormalizado,
      };
    }

    const dataSunat = responseData?.data || responseData;
    const {
      estado,
      codigo,
      nivel,
      consumioCorrelativo,
      permiteReintento,
      cdr_pendiente,
      respuesta_sunat_descripcion,
      ruta_xml,
      ruta_cdr,
      ruta_pdf,
      codigo_hash,
    } = dataSunat;

    const data = JSON.parse(jsonString);
    if (String(data.empresa.modo) === '1') {
      await repository.actualizarFirmaSunat({
        periodo,
        idUsuario,
        documentoId,
        rCod,
        rSerie,
        rNumero,
        elemento,
        // el service desestructura la respuesta como codigo_hash; el repository
        // lo llama codigoHash
        codigoHash: codigo_hash,
        cdrDescripcion: limitarCdrDescripcionTransporte(respuesta_sunat_descripcion),
        ctrlModUs,
      });
    }

    return {
      status: 200,
      body: {
      success: estado === true,
      estado,
      codigo,
      nivel,
      consumioCorrelativo,
      consumio_correlativo: consumioCorrelativo,
      permite_reintento: permiteReintento ?? true,
      cdr_pendiente,
      titulo_usuario: nivel === 'ACEPTADO' ? 'Comprobante aceptado' : undefined,
      mensaje_usuario: nivel === 'ACEPTADO' ? 'Comprobante aceptado por SUNAT.' : respuesta_sunat_descripcion,
      respuesta_sunat_descripcion,
      ruta_xml,
      ruta_cdr,
      ruta_pdf,
      codigo_hash
      }
    };
  } catch (error) {
    console.error('Error procesando envio SUNAT de transporte:', error);

    return {
      status: error.statusCode || 500,
      body: normalizarErrorSunatTransporte(
        { message: error.message, nivel: error.nivel || 'ERROR' },
        'Error interno procesando envio SUNAT de transporte'
      ),
    };
  }
};

module.exports = {
  generarCPEexpertcontTransporte,
  generaJsonPrevioCPEexpertcontTransporte,
};
