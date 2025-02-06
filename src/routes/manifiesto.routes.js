const {Router} = require('express');
const router = Router();
const { obtenerTodosManifiestoDet, crearManifiestoDet, obtenerManifiestoCarga, obtenerManifiestoDet, obtenerManifiestoCabImpresion, obtenerManifiestoDetImpresion, obtenerPlacasManifiesto, obtenerLicenciasManifiesto, obtenerDestinosManifiesto, obtenerConexionInicial } = require('../controllers/manifiesto.controllers');

router.post('/manifiestodet', obtenerTodosManifiestoDet); //listado de boletos
router.post('/manifiestocarga', obtenerManifiestoCarga); //carga inicial
router.post('/manifiestodet_ins', crearManifiestoDet); //agregar boleto nuevo
router.post('/manifiestodet_bol', obtenerManifiestoDet); //consulta para impresion detalle
router.post('/manifiestoimpresioncab', obtenerManifiestoCabImpresion); //consulta para impresion manifiesto
router.post('/manifiestoimpresiondet', obtenerManifiestoDetImpresion); //consulta para impresion manifiesto

router.post('/manifiestoplacas', obtenerPlacasManifiesto); //consulta 
router.post('/manifiestolicencias', obtenerLicenciasManifiesto); //consulta 
router.post('/manifiestodestinos', obtenerDestinosManifiesto); //consulta para impresion manifiesto

router.post('/manifiestoinicial', obtenerConexionInicial); //datos de conexion inicial
//router.put('/zona/:id', actualizarZona);
//router.delete('/zona/:id', eliminarZona);

module.exports = router;