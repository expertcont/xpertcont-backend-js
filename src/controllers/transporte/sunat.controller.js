// Capa HTTP de SUNAT / Resumen Diario de transporte.
//
// Solo req/res, validacion de entrada, status y cuerpo de respuesta. Las reglas
// viven en el service y el SQL en el repository.
const service = require('../../services/transporte/sunat.service');
const { normalizarErrorSunatTransporte } = require('../../utils/sunat');
const { normalizarTexto } = require('../../utils/texto');
const { toIsoDate } = require('../../utils/formato');

const generarResumenCPEexpertcontTransporte = async (req, res) => {
  const {
    p_periodo,
    p_id_usuario,
    p_documento_id,
    p_fecha_documentos,
    p_correlativo,
    periodo,
    id_usuario,
    id_anfitrion,
    documento_id,
    fecha_documentos,
    correlativo,
    id_punto_venta,
    tipo_operacion,
    solo_payload,
    numero_rdi
  } = req.body;

  const periodoFinal = p_periodo || periodo;
  const idUsuarioFinal = p_id_usuario || id_usuario || id_anfitrion;
  const documentoIdFinal = p_documento_id || documento_id;
  const fechaDocumentosFinal = p_fecha_documentos || fecha_documentos;
  const correlativoFinal = p_correlativo || correlativo || 1;
  const tipoOperacionFinal = ['B', 'E'].includes(String(tipo_operacion || '').trim())
    ? String(tipo_operacion).trim()
    : 'E';
  const origenResumen = tipoOperacionFinal === 'B' ? 'TRANS_BOLETO' : 'TRANS_ENCOMIENDA';
  const numeroRdiSolicitado = normalizarTexto(numero_rdi);

  if (!periodoFinal || !idUsuarioFinal || !documentoIdFinal || !fechaDocumentosFinal) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para enviar resumen de boletas'
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaDocumentosFinal)) {
    return res.status(400).json({
      success: false,
      message: 'fecha_documentos debe tener formato YYYY-MM-DD',
      mensaje_usuario: 'La fecha del resumen debe tener formato YYYY-MM-DD.'
    });
  }

  try {
    if (solo_payload === true || solo_payload === '1') {
      const { payload, operaciones } = await service.generaJsonResumenCPEexpertcontTransporte({
        periodo: periodoFinal,
        id_usuario: idUsuarioFinal,
        documento_id: documentoIdFinal,
        fecha_documentos: fechaDocumentosFinal,
        correlativo: correlativoFinal,
        id_punto_venta,
        tipo_operacion: tipoOperacionFinal,
      });

      return res.status(200).json({
        success: true,
        payload,
        total_documentos: operaciones.length
      });
    }

    if (numeroRdiSolicitado) {
      const envio = await service.enviarRdiSunatTransporte({
        periodo: periodoFinal,
        idUsuario: idUsuarioFinal,
        documentoId: documentoIdFinal,
        numeroRdi: numeroRdiSolicitado,
        tipoOperacion: tipoOperacionFinal,
        ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
      });

      return res.status(200).json({
        ...envio,
        creado: false,
        cantidad: Number(envio.total_documentos || 0),
        origen: origenResumen,
        fecha: fechaDocumentosFinal,
        message: envio.mensaje_usuario,
        data: {
          ...envio,
          origen: origenResumen,
          fecha: fechaDocumentosFinal,
        }
      });
    }

    const pendiente = await service.obtenerRdiPendienteTransporte({
      idUsuario: idUsuarioFinal,
      documentoId: documentoIdFinal,
      fechaResumen: fechaDocumentosFinal,
      origenResumen,
    });

    if (pendiente) {
      const envioPendiente = await service.enviarRdiSunatTransporte({
        periodo: periodoFinal,
        idUsuario: idUsuarioFinal,
        documentoId: documentoIdFinal,
        numeroRdi: pendiente.numero_rdi,
        tipoOperacion: tipoOperacionFinal,
        ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
      });

      return res.status(200).json({
        ...envioPendiente,
        creado: false,
        rdi_pendiente_previo: true,
        cantidad: Number(envioPendiente.total_documentos || 0),
        origen: origenResumen,
        fecha: fechaDocumentosFinal,
        message: envioPendiente.mensaje_usuario,
        data: {
          ...pendiente,
          ...envioPendiente,
          origen: origenResumen,
          fecha: fechaDocumentosFinal,
        }
      });
    }

    const respuesta = await service.crearYEnviarResumenSunatTransporte({
      periodo: periodoFinal,
      idUsuario: idUsuarioFinal,
      documentoId: documentoIdFinal,
      fechaDocumentos: fechaDocumentosFinal,
      origenResumen,
      tipoOperacion: tipoOperacionFinal,
      idPuntoVenta: id_punto_venta,
      ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
    });

    return res.status(respuesta.status).json(respuesta.body);
  } catch (error) {
    console.error('Error procesando resumen SUNAT de transporte:', error);
    return res.status(500).json(service.normalizarErrorResumenSunatTransporte(
      { message: error.message },
      'Error interno procesando resumen SUNAT de transporte'
    ));
  }
};

const consultarResumenCPEexpertcontTransporte = async (req, res) => {
  const {
    documento_id,
    id_usuario,
    id_anfitrion,
    numero_rdi,
    ticket,
    nombre_archivo,
    periodo,
    fecha_documentos,
    correlativo,
    empresa
  } = req.body;

  const idUsuarioFinal = normalizarTexto(id_usuario || id_anfitrion);
  const documentoIdFinal = normalizarTexto(documento_id);
  const numeroRdiFinal = normalizarTexto(numero_rdi);

  if (numeroRdiFinal) {
    if (!idUsuarioFinal || !documentoIdFinal) {
      return res.status(400).json({
        success: false,
        message: 'Faltan parametros requeridos: id_anfitrion, documento_id o numero_rdi',
        mensaje_usuario: 'Faltan datos para consultar el ticket del Resumen Diario SUNAT.'
      });
    }

    try {
      const resultado = await service.consultarTicketRdiSunatTransporte({
        idUsuario: idUsuarioFinal,
        documentoId: documentoIdFinal,
        numeroRdi: numeroRdiFinal,
        periodo,
        ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
      });

      return res.status(200).json(resultado);
    } catch (error) {
      console.error('Error consultando RDI transporte por numero:', error);
      return res.status(500).json(service.normalizarErrorResumenSunatTransporte(
        { message: error.message },
        'Error interno consultando el ticket del Resumen Diario SUNAT.'
      ));
    }
  }

  const respuesta = await service.consultarTicketResumenSunatTransporte({
    empresa,
    modo: req.body.modo,
    documentoId: documento_id,
    idUsuario: id_usuario,
    idAnfitrion: id_anfitrion,
    ticket,
    nombreArchivo: nombre_archivo,
    fechaDocumentos: fecha_documentos,
    correlativo,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const corregirRdiRechazadoTransporte = async (req, res) => {
  const {
    documento_id,
    id_usuario,
    id_anfitrion,
    numero_rdi,
    ctrl_mod_us,
    id_invitado,
  } = req.body;

  const idUsuarioFinal = normalizarTexto(id_usuario || id_anfitrion);
  const documentoIdFinal = normalizarTexto(documento_id);
  const numeroRdiFinal = normalizarTexto(numero_rdi);
  const ctrlModUsFinal = normalizarTexto(ctrl_mod_us || id_invitado) || null;

  if (!idUsuarioFinal || !documentoIdFinal || !numeroRdiFinal) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para corregir el RDI rechazado',
      mensaje_usuario: 'Faltan datos para preparar la correccion del RDI rechazado.',
    });
  }

  const respuesta = await service.corregirRdiRechazadoTransporte({
    idUsuario: idUsuarioFinal,
    documentoId: documentoIdFinal,
    numeroRdi: numeroRdiFinal,
    ctrlModUs: ctrlModUsFinal,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const obtenerResumenesCPEexpertcontTransporte = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const origenResumen = normalizarTexto(req.query?.origen || 'TRANS_ENCOMIENDA').toUpperCase();
  const tipoOperacionResumen = origenResumen === 'TRANS_BOLETO' ? 'B' : 'E';

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos: periodo, id_anfitrion o documento_id',
    });
  }

  if (!['TRANS_ENCOMIENDA', 'TRANS_BOLETO'].includes(origenResumen)) {
    return res.status(400).json({
      success: false,
      message: `Origen no reconocido: ${origenResumen}`,
    });
  }

  try {
    const resumenes = await service.obtenerResumenesRdiTransporte({
      idAnfitrion: id_anfitrion,
      documentoId: documento_id,
      periodo,
      origenResumen,
      tipoOperacionResumen,
    });

    return res.status(200).json({
      success: true,
      data: resumenes.data,
      pendientes: resumenes.pendientes,
    });
  } catch (error) {
    console.error('Error al obtener Resumenes Diario SUNAT de transporte:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno obteniendo Resumenes Diario SUNAT de transporte.',
    });
  }
};

module.exports = {
  generarResumenCPEexpertcontTransporte,
  consultarResumenCPEexpertcontTransporte,
  corregirRdiRechazadoTransporte,
  obtenerResumenesCPEexpertcontTransporte,
};
