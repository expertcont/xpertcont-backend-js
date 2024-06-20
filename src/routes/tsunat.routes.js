const {Router} = require('express');
const router = Router();
const {obtenerTodosPais,obtenerTodosBss,obtenerTodosAduana,obtenerTodosComprobante,obtenerTodosMedioPago, obtenerTodosIdDoc, obtenerTodosCCostoPopUp, obtenerTodosLibros, obtenerTCSunat} = require('../controllers/tsunat.controllers')

//Tablas sunat, no se editan, solo se administran en plataforma
router.get('/pais', obtenerTodosPais);
router.get('/bss', obtenerTodosBss);
router.get('/aduana', obtenerTodosAduana);
router.get('/comprobante/:tipo', obtenerTodosComprobante);//tipo='c', 'v', 't'
router.get('/mediopago', obtenerTodosMedioPago);
router.get('/iddoc', obtenerTodosIdDoc);
router.get('/ccosto/:id_anfitrion/:documento_id', obtenerTodosCCostoPopUp);
router.get('/libros', obtenerTodosLibros);
router.get('/tipocambio/:fecha/:tipo', obtenerTCSunat);

module.exports = router;