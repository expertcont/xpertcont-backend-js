const { Router } = require('express');
const router = Router();

const {
  crearVentaTrans,
  obtenerVentasTrans,
  obtenerVentaTrans,
  actualizarVentaTrans,
  eliminarVentaTrans,
  registrarEntregaEncomienda
} = require('../controllers/ventatrans.controllers');

router.post('/mve_transventa', crearVentaTrans);

router.get(
  '/mve_transventa/:periodo/:id_anfitrion/:documento_id/:dia',
  obtenerVentasTrans
);

router.get(
  '/mve_transventa/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem',
  obtenerVentaTrans
);

router.put('/mve_transventa', actualizarVentaTrans);

router.delete(
  '/mve_transventa/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem',
  eliminarVentaTrans
);

router.put('/mve_transventa/entrega', registrarEntregaEncomienda);

module.exports = router;
