const {Router} = require('express');
const router = Router();
const {obtenerTodosPais,obtenerTodosBss,obtenerTodosAduana,obtenerTodosComprobante,obtenerTodosMedioPago} = require('../controllers/tsunat.controllers')

//Tablas sunat, no se editan, solo se administran en plataforma
router.get('/pais', obtenerTodosPais);
router.get('/bss', obtenerTodosBss);
router.get('/aduana', obtenerTodosAduana);
router.get('/comprobante', obtenerTodosComprobante);
router.get('/mediopago', obtenerTodosMedioPago);

module.exports = router;