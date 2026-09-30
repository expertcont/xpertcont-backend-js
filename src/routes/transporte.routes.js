const { Router } = require('express');
const router = Router();

const {
  listarPuntosVenta,
  listarPuntosVentaUsuario,
  listarPuntosVentaUsuarios,
  obtenerPuntoVentaUsuario,
  crearPuntoVentaUsuario,
  actualizarPuntoVentaUsuario,
  eliminarPuntoVentaUsuario,
  crearPuntoVenta,
  actualizarPuntoVenta,
  eliminarPuntoVenta
} = require('../controllers/puntoventa.controllers');

const {
  listarRutasTransporte,
  listarRutasEncomienda,
  crearRutaTransporte,
  actualizarRutaTransporte,
  eliminarRutaTransporte
} = require('../controllers/transruta.controllers');

const {
  listarPlacasTransporte,
  crearPlacaTransporte,
  actualizarPlacaTransporte,
  eliminarPlacaTransporte
} = require('../controllers/transplaca.controllers');

const {
  listarLicenciasTransporte,
  crearLicenciaTransporte,
  actualizarLicenciaTransporte,
  eliminarLicenciaTransporte
} = require('../controllers/translicencia.controllers');

const {
  listarZonasTransporte,
  crearZonaTransporte,
  actualizarZonaTransporte,
  eliminarZonaTransporte
} = require('../controllers/transzona.controllers');

const {
  listarMotivosCaja,
  crearMotivoCaja,
  actualizarMotivoCaja,
  actualizarEstadoMotivoCaja,
  listarFormasPagoCaja,
  listarMovimientosCaja,
  obtenerMovimientoCaja,
  crearMovimientoCaja,
  actualizarMovimientoCaja,
  anularMovimientoCaja,
  obtenerConsolidadoCaja,
  listarIngresosEncomiendasCaja
} = require('../controllers/transcaja.controllers');
const {
  listarMenuItems,
  guardarMenuItem,
  eliminarMenuItem,
  listarMenuAcciones,
  guardarMenuAccion,
  eliminarMenuAccion,
  listarUsuariosMenuPermisos,
  obtenerMenuPermisosUsuario,
  guardarMenuPermisosUsuario,
  obtenerMenuConfig,
  guardarMenuConfig,
} = require('../controllers/menuconfig.controllers');

router.get('/mad_punto_venta/:id_anfitrion/:documento_id', listarPuntosVenta);
router.get('/mad_punto_venta_usuario/:id_anfitrion/:documento_id', listarPuntosVentaUsuarios);
router.get('/mad_punto_venta_usuario/:id_anfitrion/:documento_id/:id_punto_venta/:id_invitado', obtenerPuntoVentaUsuario);
router.get('/mad_punto_venta_usuario/:id_anfitrion/:documento_id/:id_invitado', listarPuntosVentaUsuario);
router.post('/mad_punto_venta_usuario', crearPuntoVentaUsuario);
router.put('/mad_punto_venta_usuario', actualizarPuntoVentaUsuario);
router.delete('/mad_punto_venta_usuario/:id_anfitrion/:documento_id/:id_punto_venta/:id_invitado', eliminarPuntoVentaUsuario);
router.post('/mad_punto_venta', crearPuntoVenta);
router.put('/mad_punto_venta', actualizarPuntoVenta);
router.delete('/mad_punto_venta/:id_anfitrion/:documento_id/:id_punto_venta', eliminarPuntoVenta);

router.get('/mve_transruta/encomiendas/:id_anfitrion/:documento_id', listarRutasEncomienda);
router.get('/mve_transruta/:id_anfitrion/:documento_id', listarRutasTransporte);
router.post('/mve_transruta', crearRutaTransporte);
router.put('/mve_transruta', actualizarRutaTransporte);
router.delete('/mve_transruta/:id_anfitrion/:documento_id/:id_ruta', eliminarRutaTransporte);

router.get('/mve_transplaca/:id_anfitrion/:documento_id', listarPlacasTransporte);
router.post('/mve_transplaca', crearPlacaTransporte);
router.put('/mve_transplaca', actualizarPlacaTransporte);
router.delete('/mve_transplaca/:id_anfitrion/:documento_id/:placa', eliminarPlacaTransporte);

router.get('/mve_translicencia/:id_anfitrion/:documento_id', listarLicenciasTransporte);
router.post('/mve_translicencia', crearLicenciaTransporte);
router.put('/mve_translicencia', actualizarLicenciaTransporte);
router.delete('/mve_translicencia/:id_anfitrion/:documento_id/:licencia', eliminarLicenciaTransporte);

router.get('/mve_transzona/:id_anfitrion/:documento_id', listarZonasTransporte);
router.post('/mve_transzona', crearZonaTransporte);
router.put('/mve_transzona', actualizarZonaTransporte);
router.delete('/mve_transzona/:id_anfitrion/:documento_id/:id_punto_venta/:id_zona', eliminarZonaTransporte);

router.get('/mve_transmotivo/:id_anfitrion/:documento_id', listarMotivosCaja);
router.post('/mve_transmotivo', crearMotivoCaja);
router.put('/mve_transmotivo/:id_anfitrion/:documento_id/:id_motivo', actualizarMotivoCaja);
router.patch('/mve_transmotivo/:id_anfitrion/:documento_id/:id_motivo/estado', actualizarEstadoMotivoCaja);

router.get('/mve_transcaja/formas-pago', listarFormasPagoCaja);
router.get('/mve_transcaja/consolidado/:periodo/:id_anfitrion/:documento_id', obtenerConsolidadoCaja);
router.get('/mve_transcaja/ingresos/:periodo/:id_anfitrion/:documento_id', listarIngresosEncomiendasCaja);
router.get('/mve_transcaja/:periodo/:id_anfitrion/:documento_id', listarMovimientosCaja);
router.get('/mve_transcaja/:periodo/:id_anfitrion/:documento_id/:id_movimiento', obtenerMovimientoCaja);
router.post('/mve_transcaja', crearMovimientoCaja);
router.put('/mve_transcaja/:periodo/:id_anfitrion/:documento_id/:id_movimiento', actualizarMovimientoCaja);
router.patch('/mve_transcaja/:periodo/:id_anfitrion/:documento_id/:id_movimiento/anular', anularMovimientoCaja);

router.get('/mad_menu_item/:id_anfitrion/:id_invitado', listarMenuItems);
router.post('/mad_menu_item', guardarMenuItem);
router.put('/mad_menu_item', guardarMenuItem);
router.delete('/mad_menu_item/:id_anfitrion/:id_invitado/:id_item', eliminarMenuItem);

router.get('/mad_menu_config/:id_anfitrion/:id_invitado', obtenerMenuConfig);
router.put('/mad_menu_config', guardarMenuConfig);

router.get('/mad_menu_accion/:id_anfitrion/:id_invitado', listarMenuAcciones);
router.post('/mad_menu_accion', guardarMenuAccion);
router.put('/mad_menu_accion', guardarMenuAccion);
router.delete('/mad_menu_accion/:id_anfitrion/:id_invitado/:id_accion', eliminarMenuAccion);

router.get('/mad_menu_permiso/usuarios/:id_anfitrion/:id_invitado', listarUsuariosMenuPermisos);
router.get('/mad_menu_permiso/:id_anfitrion/:id_invitado/:id_invitado_permiso', obtenerMenuPermisosUsuario);
router.put('/mad_menu_permiso', guardarMenuPermisosUsuario);

module.exports = router;
