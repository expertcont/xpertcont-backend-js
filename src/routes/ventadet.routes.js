const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerVentaDet,obtenerVentaDetItem,crearVentaDet,actualizarVentaDet,eliminarVentaDet, obtenerVentaDetTodos} = require('../controllers/ventadet.controllers')

router.get('/ad_ventadettodos/:periodo/:id_anfitrion/:documento_id/:dia', obtenerVentaDetTodos);
router.get('/ad_ventadet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem', obtenerVentaDet);
router.get('/ad_ventadet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:item', obtenerVentaDetItem);

router.post('/ad_ventadet', crearVentaDet);

router.put('/ad_ventadet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:item', actualizarVentaDet);
router.delete('/ad_ventadet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:item', eliminarVentaDet);

module.exports = router;