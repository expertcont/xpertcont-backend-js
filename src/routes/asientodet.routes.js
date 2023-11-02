const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosAsientosDet,obtenerAsientoDet,obtenerAsientoDetItem,crearAsientoDet,actualizarAsientoDet,eliminarAsientoDet} = require('../controllers/asientodet.controllers')

router.get('/asientodet', obtenerTodosAsientosDet);
router.get('/asientodet/:cod/:serie/:num/:elem', obtenerAsientoDet);
router.get('/asientodet/:cod/:serie/:num/:elem/:item', obtenerAsientoDetItem);

router.post('/asientodet', crearAsientoDet);
router.put('/asientodet/:cod/:serie/:num/:elem/:item', actualizarAsientoDet);
router.delete('/asientodet/:cod/:serie/:num/:elem/:item', eliminarAsientoDet);

module.exports = router;