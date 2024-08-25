const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerRegistroTodos,obtenerRegistro,crearRegistro,actualizarRegistro,anularRegistro,eliminarRegistro} = require('../controllers/venta.controllers')

router.get('/ad_venta/:fecha_ini/:fecha_proceso', obtenerRegistroTodos);//aumentado fecha_ini new

router.get('/ad_venta/:cod/:serie/:num/:elem', obtenerRegistro);
router.post('/ad_venta', crearRegistro);
router.put('/ad_venta/:cod/:serie/:num/:elem', actualizarRegistro);
router.put('/ad_venta/:cod/:serie/:num/:elem/anular', anularRegistro);
router.delete('/ad_venta/:cod/:serie/:num/:elem', eliminarRegistro);

module.exports = router;