const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerHojaTrabajo, obtenerAnalisis} = require('../controllers/reporte.controllers')

router.get('/reporte/hojatrabajo/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:id_libro/:nivel', obtenerHojaTrabajo);
router.get('/reporte/analisis/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:id_libro/:id_cuenta/:ccosto', obtenerAnalisis);

module.exports = router;