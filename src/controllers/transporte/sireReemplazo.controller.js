const service = require('../../services/transporte/sireReemplazo.service');
const parametros = (req) => {
  const body = req.body || {};
  const consulta = { ...(req.query || {}), ...(req.params || {}) };
  return {
    idAnfitrion: consulta.id_anfitrion || body.id_anfitrion || body.idAnfitrion,
    documentoId: consulta.documento_id || body.documento_id || body.documentoId,
    periodo: consulta.periodo || body.periodo,
    idLibro: consulta.id_libro || body.id_libro || '014',
    idReemplazo: consulta.id_reemplazo || body.id_reemplazo,
    hashArchivo: consulta.hash_archivo || body.hash_archivo,
    confirmar: body.confirmar, confirmarAlcance: body.confirmar_alcance, ticketReemplazo: body.ticket_reemplazo,
    solicitadoPor: req.user?.sub || body.id_invitado || null,
    buffer: req.file?.buffer, nombreArchivo: req.file?.originalname,
  };
};
const handler = (accion, status = 200) => async (req, res) => {
  try {
    const respuesta = await service[accion](parametros(req));
    if (accion === 'descargarArchivo') {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${respuesta.nombreArchivo}"`);
      return res.status(200).send(respuesta.buffer);
    }
    return res.status(respuesta.reutilizado ? 200 : status).json(respuesta);
  } catch (error) {
    const code = error.statusCode || 500;
    if (code >= 500) console.error('Error reemplazo SIRe transporte:', error.message);
    return res.status(code).json({ success: false, message: error.message,
      estado: error.estado, ticket_reemplazo: error.ticketReemplazo,
      errores_sunat: error.respuestaSunat?.errors,
    });
  }
};
module.exports = {
  conciliarReemplazoSireTransporte: handler('conciliarReemplazo'),
  prepararReemplazoSireTransporte: handler('prepararReemplazo', 201),
  enviarReemplazoSireTransporte: handler('enviarReemplazo', 202),
  obtenerReemplazoSireTransporte: handler('obtenerReemplazo'),
  consultarReemplazoSireTransporte: handler('consultarEstado'),
  descargarReemplazoSireTransporte: handler('descargarArchivo'),
};