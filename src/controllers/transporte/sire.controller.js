const service = require('../../services/transporte/sire.service');

const obtenerParametrosSire = (body = {}) => ({
  idAnfitrion: body.id_anfitrion || body.idAnfitrion,
  documentoId: body.documento_id || body.documentoId,
  periodo: body.periodo,
  idLibro: body.id_libro || body.idLibro || '014',
  ticket: body.ticket,
  nombreArchivo: body.nombre_archivo_rep || body.nombreArchivo,
  reutilizarExistente: body.reutilizar_existente !== false && body.reutilizarExistente !== false,
});

const validarParametrosBase = ({ idAnfitrion, documentoId, periodo }) => {
  if (!idAnfitrion || !documentoId || !periodo) {
    return 'Faltan parametros requeridos: id_anfitrion, documento_id o periodo';
  }

  return '';
};

const obtenerRegistroSireTransporte = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos: periodo, id_anfitrion o documento_id',
    });
  }

  try {
    const registro = await service.obtenerRegistroSireTransporte({
      idAnfitrion: id_anfitrion,
      documentoId: documento_id,
      periodo,
    });

    return res.status(200).json({
      success: true,
      ...registro,
    });
  } catch (error) {
    console.error('Error al obtener Reporte SIRE de transporte:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno obteniendo Reporte SIRE de transporte.',
    });
  }
};

const obtenerComparacionSireTransporte = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const idLibro = req.query.id_libro || req.query.idLibro || '014';

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos: periodo, id_anfitrion o documento_id',
    });
  }

  try {
    const comparacion = await service.obtenerComparacionSireTransporte({
      idAnfitrion: id_anfitrion,
      documentoId: documento_id,
      periodo,
      idLibro,
    });

    return res.status(200).json({
      success: true,
      ...comparacion,
    });
  } catch (error) {
    console.error('Error al obtener comparacion SIRe transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno obteniendo comparacion SIRe transporte.',
    });
  }
};

const generarTicketPropuestaSireTransporte = async (req, res) => {
  const params = obtenerParametrosSire(req.body);
  const errorValidacion = validarParametrosBase(params);

  if (errorValidacion) {
    return res.status(400).json({ success: false, message: errorValidacion });
  }

  try {
    const ticket = await service.generarTicketPropuestaSireTransporte(params);
    return res.status(200).json({ success: true, ...ticket });
  } catch (error) {
    console.error('Error generando ticket propuesta SIRe transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno generando ticket propuesta SIRe transporte.',
    });
  }
};

const consultarEstadoPropuestaSireTransporte = async (req, res) => {
  const params = obtenerParametrosSire(req.body);
  const errorValidacion = validarParametrosBase(params);

  if (errorValidacion || !params.ticket) {
    return res.status(400).json({
      success: false,
      message: errorValidacion || 'Falta parametro requerido: ticket',
    });
  }

  try {
    const estado = await service.consultarEstadoPropuestaSireTransporte(params);
    return res.status(200).json({ success: true, ...estado });
  } catch (error) {
    console.error('Error consultando estado propuesta SIRe transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno consultando estado propuesta SIRe transporte.',
    });
  }
};

const descargarPropuestaSireTransporte = async (req, res) => {
  const params = obtenerParametrosSire(req.body);
  const errorValidacion = validarParametrosBase(params);

  if (errorValidacion || !params.ticket || !params.nombreArchivo) {
    return res.status(400).json({
      success: false,
      message: errorValidacion || 'Faltan parametros requeridos: ticket o nombre_archivo_rep',
    });
  }

  try {
    const descarga = await service.descargarPropuestaSireTransporte(params);
    res.setHeader('Content-Disposition', `attachment; filename=${descarga.nombre_archivo_rep}`);
    res.setHeader('Content-Type', descarga.content_type);
    res.setHeader('Content-Length', descarga.buffer.length);
    return res.send(descarga.buffer);
  } catch (error) {
    console.error('Error descargando propuesta SIRe transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno descargando propuesta SIRe transporte.',
    });
  }
};

module.exports = {
  obtenerRegistroSireTransporte,
  obtenerComparacionSireTransporte,
  generarTicketPropuestaSireTransporte,
  consultarEstadoPropuestaSireTransporte,
  descargarPropuestaSireTransporte,
};
