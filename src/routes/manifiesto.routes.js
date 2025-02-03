const {Router} = require('express');
const router = Router();
const { obtenerTodosManifiestoDet, crearManifiestoDet, obtenerManifiestoCarga, obtenerManifiestoDet, obtenerManifiestoCabImpresion } = require('../controllers/manifiesto.controllers');

router.post('/manifiestodet', obtenerTodosManifiestoDet); //listado de boletos
router.post('/manifiestocarga', obtenerManifiestoCarga); //carga inicial
router.post('/manifiestodet_ins', crearManifiestoDet); //agregar boleto nuevo
router.post('/manifiestodet_bol', obtenerManifiestoDet); //consulta para impresion detalle
router.post('/manifiestocab', obtenerManifiestoCabImpresion); //consulta para impresion manifiesto
//router.put('/zona/:id', actualizarZona);
//router.delete('/zona/:id', eliminarZona);

module.exports = router;