const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerHojaTrabajo, obtenerAnalisis, obtenerCuentasCorrientes} = require('../controllers/reporte.controllers')

//Hoja de trabajo con parametro variable, id_libro para filtro
router.get('/reporte/hojatrabajo/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:nivel/:id_libro', obtenerHojaTrabajo);
router.get('/reporte/hojatrabajo/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:nivel', obtenerHojaTrabajo);
//Analisis de cuentas generico
router.get('/reporte/analisis01/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin', obtenerAnalisis);
router.get('/reporte/analisis02/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:id_libro', obtenerAnalisis);
router.get('/reporte/analisis03/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:id_libro/:id_cuenta', obtenerAnalisis);
router.get('/reporte/analisis04/:id_anfitrion/:documento_id/:periodo_ini/:periodo_fin/:id_cuenta', obtenerAnalisis);
//Cuentas corrientes general
router.get('/reporte/cuentascorrientes/:id_anfitrion/:documento_id/:periodo_fin', obtenerCuentasCorrientes);
module.exports = router;