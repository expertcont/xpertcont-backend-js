const { Router } = require('express');
const router = Router();

const {
  listarPuntosVenta,
  crearPuntoVenta,
  actualizarPuntoVenta,
  eliminarPuntoVenta
} = require('../controllers/puntoventa.controllers');

const {
  listarRutasTransporte,
  listarRutasEncomienda,
  crearRutaTransporte,
  actualizarRutaTransporte,
  eliminarRutaTransporte
} = require('../controllers/transruta.controllers');

router.get('/mad_punto_venta/:id_anfitrion/:documento_id', listarPuntosVenta);
router.post('/mad_punto_venta', crearPuntoVenta);
router.put('/mad_punto_venta', actualizarPuntoVenta);
router.delete('/mad_punto_venta/:id_anfitrion/:documento_id/:id_punto_venta', eliminarPuntoVenta);

router.get('/mve_transruta/encomiendas/:id_anfitrion/:documento_id', listarRutasEncomienda);
router.get('/mve_transruta/:id_anfitrion/:documento_id', listarRutasTransporte);
router.post('/mve_transruta', crearRutaTransporte);
router.put('/mve_transruta', actualizarRutaTransporte);
router.delete('/mve_transruta/:id_anfitrion/:documento_id/:id_ruta', eliminarRutaTransporte);

module.exports = router;
