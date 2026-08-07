const { Router } = require('express');
const router = Router();

const {
  crearPresupuesto,
  obtenerPresupuestos,
  obtenerPresupuesto,
  obtenerPresupuestoFull,
  actualizarPresupuesto,
  obtenerServiciosPresupuesto,
  crearServicioPresupuesto,
  actualizarServiciosDatos,
  eliminarServicioPresupuesto,
  obtenerDetallesServicio,
  insertarDetalleServicio,
  actualizarDetalleServicio,
  eliminarDetalleServicio
} = require('../controllers/presupuesto.controllers');

router.post('/ad_presupuesto', crearPresupuesto);
router.get('/ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:dia', obtenerPresupuestos);
router.get('/ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerPresupuesto);
router.get('/ad_presupuesto/full/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerPresupuestoFull);
router.put('/ad_presupuesto', actualizarPresupuesto);

router.get('/ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerServiciosPresupuesto);
router.post('/ad_presupuestoserv', crearServicioPresupuesto);
router.put('/ad_presupuestoserv', actualizarServiciosDatos);
router.delete('/ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio', eliminarServicioPresupuesto);

router.get('/ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio', obtenerDetallesServicio);
router.post('/ad_presupuestoservdet', insertarDetalleServicio);
router.put('/ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio/:item', actualizarDetalleServicio);
router.delete('/ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio/:item', eliminarDetalleServicio);

module.exports = router;
