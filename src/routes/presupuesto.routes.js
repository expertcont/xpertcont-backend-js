const { Router } = require('express');
const router = Router();

const {
  crearPresupuesto,
  obtenerPresupuestos,
  obtenerPresupuesto,
  obtenerPresupuestoFull,
  actualizarPresupuesto,
  eliminarPresupuesto,
  obtenerServiciosPresupuesto,
  crearServicioPresupuesto,
  actualizarServiciosDatos,
  eliminarServicioPresupuesto,
  obtenerDetallesServicio,
  insertarDetalleServicio,
  actualizarDetalleServicio,
  eliminarDetalleServicio,
  clonarServicioPresupuesto,
  generarComprobantePresupuesto
} = require('../controllers/presupuesto.controllers');

router.post('/ad_presupuesto', crearPresupuesto);
router.post('/ad_presupuesto/comprobante', generarComprobantePresupuesto);
router.get('/ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:dia', obtenerPresupuestos);
router.get('/ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerPresupuesto);
router.get('/ad_presupuesto/full/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerPresupuestoFull);
router.put('/ad_presupuesto', actualizarPresupuesto);
router.delete('/ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', eliminarPresupuesto);

router.get('/ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerServiciosPresupuesto);
router.post('/ad_presupuestoserv', crearServicioPresupuesto);
router.post('/ad_presupuestoserv/clonar', clonarServicioPresupuesto);
router.put('/ad_presupuestoserv', actualizarServiciosDatos);
router.delete('/ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio', eliminarServicioPresupuesto);

router.get('/ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio', obtenerDetallesServicio);
router.post('/ad_presupuestoservdet', insertarDetalleServicio);
router.put('/ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio/:item', actualizarDetalleServicio);
router.delete('/ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio/:item', eliminarDetalleServicio);

module.exports = router;
