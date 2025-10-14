const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerRegistroTodos,obtenerRegistro,crearRegistro,actualizarRegistro,anularRegistro,eliminarRegistro, generarRegistro, generarComprobante, clonarRegistro, obtenerMotivos} = require('../controllers/stock.controllers')

router.get('/ad_stock/:periodo/:id_anfitrion/:documento_id/:dia', obtenerRegistroTodos);//
router.get('/ad_stockmotivo/:cod', obtenerMotivos);//

router.get('/ad_stock/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num', obtenerRegistro);
router.post('/ad_stock/:periodo/:id_anfitrion/:documento_id', crearRegistro);
router.post('/ad_stock', generarRegistro);
router.post('/ad_stockcomp', generarComprobante);

router.post('/ad_stockclon', clonarRegistro);

router.put('/ad_stock', actualizarRegistro); //modifica datos cabecera
router.put('/ad_stock/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/anular', anularRegistro);
router.delete('/ad_stockdel', eliminarRegistro); //elimina ultimo registro de venta


module.exports = router;