const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosAsientosDet,obtenerAsientoDet,obtenerAsientoDetItem,crearAsientoDet,actualizarAsientoDet,eliminarAsientoDet} = require('../controllers/asientodet.controllers')

router.get('/asientodet/:id_anfitrion/:documento_id/:periodo/:id_libro', obtenerTodosAsientosDet);
router.get('/asientodet/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', obtenerAsientoDet);
router.get('/asientodet/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento/:item', obtenerAsientoDetItem);

router.post('/asientodet', crearAsientoDet);
router.put('/asientodet/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento/:item', actualizarAsientoDet);
router.delete('/asientodet/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento/:item', eliminarAsientoDet);

module.exports = router;