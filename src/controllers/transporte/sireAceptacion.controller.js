const service = require('../../services/transporte/sireAceptacion.service');

const parametros = (req) => {
  const body = req.body || {};
  const consulta = { ...(req.query || {}), ...(req.params || {}) };
  return {
    idAnfitrion: consulta.id_anfitrion || body.id_anfitrion || body.idAnfitrion,
    documentoId: consulta.documento_id || body.documento_id || body.documentoId,
    periodo: consulta.periodo || body.periodo,
    idLibro: consulta.id_libro || body.id_libro || body.idLibro || '014',
    idPropuesta: body.id_propuesta,
    ticketPropuesta: body.ticket_propuesta,
    confirmar: body.confirmar,
    solicitadoPor: req.user?.sub || body.id_invitado || null,
  };
};

const handler = (accion, status = 200) => async (req, res) => {
  try {
    const respuesta = await service[accion](parametros(req));
    return res.status(respuesta.reutilizado ? 200 : status).json(respuesta);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error('Error en aceptacion SIRe transporte:', error.message);
    return res.status(statusCode).json({
      success: false, message: error.message || 'No se pudo procesar la aceptacion SIRe.',
      estado: error.estado || undefined,
      ticket_aceptacion: error.ticketAceptacion || undefined,
      errores_sunat: error.respuestaSunat?.errors || undefined,
    });
  }
};

module.exports = {
  aceptarPropuestaSireTransporte: handler('aceptarPropuesta', 202),
  obtenerAceptacionSireTransporte: handler('obtenerAceptacion'),
  consultarAceptacionSireTransporte: handler('consultarEstado'),
};
