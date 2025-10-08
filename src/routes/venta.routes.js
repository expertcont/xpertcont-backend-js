const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerRegistroTodos,obtenerRegistro,crearRegistro,actualizarRegistro,anularRegistro,eliminarRegistro, generarRegistro, generarComprobante, generarCPE, clonarRegistro, generarCPEexpertcont, obtenerTotalVentas, obtenerTotalRecaudacion, generarPDFexpertcont} = require('../controllers/venta.controllers')

router.get('/ad_venta/:periodo/:id_anfitrion/:documento_id/:dia', obtenerRegistroTodos);//

router.get('/ad_ventatotal/:periodo/:id_anfitrion/:id_invitado/:dia', obtenerTotalVentas);//
router.get('/ad_ventarecaudacion/:periodo/:id_anfitrion/:documento_id/:dia', obtenerTotalRecaudacion);//

router.get('/ad_venta/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerRegistro);
router.post('/ad_venta/:periodo/:id_anfitrion/:documento_id', crearRegistro);
router.post('/ad_venta', generarRegistro);
router.post('/ad_ventacomp', generarComprobante);
//router.post('/ad_ventacpe', generarCPE); //proveedor 01
router.post('/ad_ventacpe', generarCPEexpertcont); //proveedor 02 expercont now ;)
router.post('/ad_ventacpepdf', generarPDFexpertcont); //proveedor 02 solo PDF, api auxiliar

router.post('/ad_ventaclon', clonarRegistro);

router.put('/ad_venta', actualizarRegistro); //modifica datos cabecera
router.put('/ad_venta/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/anular', anularRegistro);
router.delete('/ad_ventadel', eliminarRegistro); //elimina ultimo registro de venta


module.exports = router;