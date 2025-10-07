const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerMovimientoDet, obtenerMovimientoDetItem, crearMovimientoDet, actualizarMovimientoDet, eliminarMovimientoDet} = require('../controllers/stockdet.controllers')

router.get('/ad_stockdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num', obtenerMovimientoDet);
router.get('/ad_stockdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:item', obtenerMovimientoDetItem);

router.post('/ad_stockdet', crearMovimientoDet);

router.put('/ad_stockdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:item', actualizarMovimientoDet);
router.delete('/ad_stockdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:item', eliminarMovimientoDet);

module.exports = router;