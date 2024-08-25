const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerRegistroTodos,obtenerRegistro,crearRegistro,actualizarRegistro,anularRegistro,eliminarRegistro} = require('../controllers/venta.controllers')

router.get('/venta/:fecha_ini/:fecha_proceso', obtenerRegistroTodos);//aumentado fecha_ini new 

router.get('/venta/:cod/:serie/:num/:elem', obtenerRegistro);
router.post('/venta', crearRegistro);
router.put('/venta/:cod/:serie/:num/:elem', actualizarRegistro);
router.put('/venta/:cod/:serie/:num/:elem/anular', anularRegistro);
router.delete('/venta/:cod/:serie/:num/:elem', eliminarRegistro);

module.exports = router;