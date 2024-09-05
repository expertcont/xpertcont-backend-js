const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerRegistroTodos,obtenerRegistro,crearRegistro,actualizarRegistro,anularRegistro,eliminarRegistro, generarRegistro} = require('../controllers/venta.controllers')

router.get('/ad_venta/:id_anfitrion/:documento_id/:periodo', obtenerRegistroTodos);//

router.get('/ad_venta/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerRegistro);
router.post('/ad_venta/:id_anfitrion/:documento_id', crearRegistro);
router.post('/ad_venta', generarRegistro);

router.put('/ad_venta/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', actualizarRegistro);
router.put('/ad_venta/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/anular', anularRegistro);
router.delete('/ad_venta/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', eliminarRegistro);

module.exports = router;