const { Router } = require('express');
const router = Router();

const {
  crearPresupuesto,
  obtenerServiciosPresupuesto,
  crearServicioPresupuesto,
  actualizarServiciosDatos,
  obtenerDetallesServicio,
  insertarDetalleServicio
} = require('../controllers/presupuesto.controllers');

router.post('/ad_presupuesto', crearPresupuesto);

router.get('/ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerServiciosPresupuesto);
router.post('/ad_presupuestoserv', crearServicioPresupuesto);
router.put('/ad_presupuestoserv', actualizarServiciosDatos);

router.get('/ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio', obtenerDetallesServicio);
router.post('/ad_presupuestoservdet', insertarDetalleServicio);

module.exports = router;
