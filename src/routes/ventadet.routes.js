const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodasVentasDet,obtenerTodasVentasDetPendientes,obtenerVentaDet,obtenerVentaDetItemTrans,obtenerVentaDetItem,crearVentaDet,actualizarVentaDet,actualizarVentaDetTrans,eliminarVentaDet} = require('../controllers/ventadet.controllers')

router.get('/ad_ventadet/:cod/:serie/:num/:elem', obtenerVentaDet);
router.get('/ad_ventadet/:cod/:serie/:num/:elem/:item', obtenerVentaDetItem);

router.post('/ad_ventadet', crearVentaDet);
router.put('/ad_ventadet/:cod/:serie/:num/:elem/:item', actualizarVentaDet);
router.delete('/ad_ventadet/:cod/:serie/:num/:elem/:item', eliminarVentaDet);

module.exports = router;