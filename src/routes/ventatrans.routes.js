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

router.post('/mve_ventatrans', crearVentaTrans);

router.get(
  '/mve_ventatrans/:periodo/:id_anfitrion/:documento_id/:dia',
  obtenerVentasTrans
);

router.get(
  '/mve_ventatrans/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem',
  obtenerVentaTrans
);

router.put('/mve_ventatrans', actualizarVentaTrans);

router.delete(
  '/mve_ventatrans/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem',
  eliminarVentaTrans
);

router.put('/mve_ventatrans/entrega', registrarEntregaEncomienda);

module.exports = router;
