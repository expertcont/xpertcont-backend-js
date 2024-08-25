const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodasVentasDet,obtenerTodasVentasDetPendientes,obtenerVentaDet,obtenerVentaDetItemTrans,obtenerVentaDetItem,crearVentaDet,actualizarVentaDet,actualizarVentaDetTrans,eliminarVentaDet} = require('../controllers/ventadet.controllers')

router.get('/ventadet/:cod/:serie/:num/:elem', obtenerVentaDet);
router.get('/ventadet/:cod/:serie/:num/:elem/:item', obtenerVentaDetItem);

router.post('/ventadet', crearVentaDet);
router.put('/ventadet/:cod/:serie/:num/:elem/:item', actualizarVentaDet);
router.delete('/ventadet/:cod/:serie/:num/:elem/:item', eliminarVentaDet);

module.exports = router;