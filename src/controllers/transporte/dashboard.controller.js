// Capa HTTP del Dashboard de Transporte.
//
// Solo lee la entrada, llama al service y responde. Las reglas viven en el
// service y el SQL en el repository.
const service = require('../../services/transporte/dashboard.service');

// Lee los parametros comunes enviados por el frontend del dashboard.
const resolverFiltroDashboardTransporte = (req) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;
  const fecha = req.query.fecha || (dia && dia !== '*' ? `${periodo}-${String(dia).padStart(2, '0')}` : null);
  const idPuntoVenta = req.query.id_punto_venta || null;
  const idInvitado = req.query.id_invitado || null;
  const superUsuario = req.query.super_usuario || req.query.super || null;
  const idUsuarioTrabajo = req.query.id_usuario_trabajo || req.query.id_usuario_operacion || null;

  return {
    periodo,
    id_anfitrion,
    documento_id,
    fecha,
    id_punto_venta: idPuntoVenta,
    id_invitado: idInvitado,
    super_usuario: superUsuario,
    acceso_total: !idInvitado || id_anfitrion === idInvitado || String(superUsuario) === '1',
    id_usuario_trabajo: idUsuarioTrabajo,
    id_usuario_operacion: null,
    id_puntos_venta: null,
  };
};

// Endpoint para probar solo la lista de usuarios de trabajo.
const obtenerUsuariosDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!service.validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para usuarios del dashboard'
    });
  }

  try {
    const filtroFinal = await service.resolverAccesoDashboardTransporte({
      ...filtro,
      id_usuario_trabajo: null,
    });
    const data = await service.obtenerUsuariosDashboardTransporteData(filtroFinal);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener usuarios del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo la fila superior de KPI del dashboard.
const obtenerResumenDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!service.validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para el resumen del dashboard'
    });
  }

  try {
    const filtroFinal = await service.resolverAccesoDashboardTransporte(filtro);
    const data = await service.obtenerResumenDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener resumen del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo el bloque de productividad por hora.
const obtenerProductividadDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!service.validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para la productividad del dashboard'
    });
  }

  try {
    const filtroFinal = await service.resolverAccesoDashboardTransporte(filtro);
    const data = await service.obtenerProductividadDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener productividad del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo el bloque de resumen SUNAT.
const obtenerSunatDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!service.validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para SUNAT del dashboard'
    });
  }

  try {
    const filtroFinal = await service.resolverAccesoDashboardTransporte(filtro);
    const data = await service.obtenerSunatDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener SUNAT del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo el bloque de rendimiento por ruta.
const obtenerRutasDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!service.validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para rutas del dashboard'
    });
  }

  try {
    const filtroFinal = await service.resolverAccesoDashboardTransporte(filtro);
    const data = await service.obtenerRutasDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener rutas del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo el comparativo mensual de encomiendas.
const obtenerComparativoMensualEncomiendasDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!service.validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para el comparativo mensual del dashboard'
    });
  }

  try {
    const filtroFinal = await service.resolverAccesoDashboardTransporte(filtro);
    const data = await service.obtenerComparativoMensualEncomiendasDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener comparativo mensual del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint principal.
// Devuelve todos los bloques que necesita la pantalla en una sola llamada:
// filtros aplicados, resumen, productividad, SUNAT, rutas, comparativo,
// recaudacion y usuarios de trabajo.
const obtenerDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!service.validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para el dashboard de transporte'
    });
  }

  try {
    const filtroFinal = await service.resolverAccesoDashboardTransporte(filtro);
    const [resumen, productividad, sunat, rutas, comparativoMensual, recaudacionAgencias, usuariosTrabajo] = await Promise.all([
      service.obtenerResumenDashboardTransporteData(filtroFinal),
      service.obtenerProductividadDashboardTransporteData(filtroFinal),
      service.obtenerSunatDashboardTransporteData(filtroFinal),
      service.obtenerRutasDashboardTransporteData(filtroFinal),
      service.obtenerComparativoMensualEncomiendasDashboardTransporteData(filtroFinal),
      service.obtenerRecaudacionAgenciasDashboardTransporteData(filtroFinal),
      service.obtenerUsuariosDashboardTransporteData(filtroFinal),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        filtros: filtroFinal,
        resumen,
        productividad,
        sunat,
        rutas,
        comparativo_mensual_encomiendas: comparativoMensual,
        recaudacion_agencias: recaudacionAgencias,
        usuarios_trabajo: usuariosTrabajo,
      }
    });
  } catch (error) {
    console.error('Error al obtener dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

module.exports = {
  obtenerUsuariosDashboardTransporte,
  obtenerResumenDashboardTransporte,
  obtenerProductividadDashboardTransporte,
  obtenerSunatDashboardTransporte,
  obtenerRutasDashboardTransporte,
  obtenerComparativoMensualEncomiendasDashboardTransporte,
  obtenerDashboardTransporte,
};