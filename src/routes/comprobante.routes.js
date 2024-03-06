const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosComprobante,obtenerComprobante,crearComprobante,actualizarComprobante,eliminarComprobante, obtenerComprobantePopUp} = require('../controllers/comprobante.controllers')

router.get('/comprobante', obtenerTodosComprobante);
//router.get('/comprobante/:cod', obtenerComprobante);//esta ruta se repite en tsunat
router.get('/comprobantepopup', obtenerComprobantePopUp);//

router.post('/comprobante', crearComprobante);
router.put('/comprobante/:cod', actualizarComprobante);
router.delete('/comprobante/:cod', eliminarComprobante);

module.exports = router;