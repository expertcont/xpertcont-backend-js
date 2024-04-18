const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerHojaTrabajo, obtenerAnalisis} = require('../controllers/reporte.controllers')

//Hoja de trabajo con parametro variable, id_libro para filtro
router.get('/reporte/hojatrabajo/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:nivel/:id_libro', obtenerHojaTrabajo);
router.get('/reporte/hojatrabajo/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:nivel', obtenerHojaTrabajo);
//Analisis de cuentas generico
router.get('/reporte/analisis/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin', obtenerAnalisis);
router.get('/reporte/analisis/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:id_libro', obtenerAnalisis);
router.get('/reporte/analisis/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:id_libro/:id_cuenta', obtenerAnalisis);
router.get('/reporte/analisis/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:id_libro/:id_cuenta/:ccosto', obtenerAnalisis);

module.exports = router;