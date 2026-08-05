const { Router } = require('express');
const router = Router();

const {
  obtenerServiciosPresupuesto,
  crearServicioPresupuesto,
  obtenerDetallesServicio,
  insertarDetalleServicio
} = require('../controllers/presupuesto.controllers');

router.get('/ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerServiciosPresupuesto);
router.post('/ad_presupuestoserv', crearServicioPresupuesto);

router.get('/ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio', obtenerDetallesServicio);
router.post('/ad_presupuestoservdet', insertarDetalleServicio);

module.exports = router;
