const { Router } = require('express');
const router = Router();

const {
  crearVentaTrans,
  obtenerVentasTrans,
  obtenerVentaTrans,
  clonarEncomienda,
  listarEncomiendasPorEntregar,
  actualizarVentaTrans,
  eliminarVentaTrans,
  registrarEntregaEncomienda,
  obtenerResumenDashboardTransporte,
  obtenerProductividadDashboardTransporte,
  obtenerSunatDashboardTransporte,
  obtenerRutasDashboardTransporte,
  obtenerComparativoMensualEncomiendasDashboardTransporte,
  obtenerDashboardTransporte,
  generarCPEexpertcontTransporte,
  generarResumenCPEexpertcontTransporte,
  consultarResumenCPEexpertcontTransporte
} = require('../controllers/ventatrans.controllers');

router.post('/mve_transventa', crearVentaTrans);
router.post('/mve_transventa/cpe', generarCPEexpertcontTransporte);
router.post('/mve_transventa/cpe/resumen', generarResumenCPEexpertcontTransporte);
router.post('/mve_transventa/cpe/resumen/ticket', consultarResumenCPEexpertcontTransporte);

router.get(
  '/mve_transventa/encomienda/clonar/:periodo/:id_anfitrion/:documento_id',
  clonarEncomienda
);

router.get(
  '/mve_transventa/encomienda/por-entregar/:periodo/:id_anfitrion/:documento_id/:id_punto_venta_dest',
  listarEncomiendasPorEntregar
);

// Dashboard consolidado: una sola llamada para pintar todos los bloques.
router.get(
  '/mve_transventa/dashboard/:periodo/:id_anfitrion/:documento_id',
  obtenerDashboardTransporte
);

router.get(
  '/mve_transventa/dashboard/:periodo/:id_anfitrion/:documento_id/:dia',
  obtenerDashboardTransporte
);

// Endpoints por bloque: utiles para probar cada seccion del dashboard por separado.
router.get(
  '/mve_transventa/dashboard/resumen/:periodo/:id_anfitrion/:documento_id',
  obtenerResumenDashboardTransporte
);

router.get(
  '/mve_transventa/dashboard/productividad/:periodo/:id_anfitrion/:documento_id',
  obtenerProductividadDashboardTransporte
);

router.get(
  '/mve_transventa/dashboard/sunat/:periodo/:id_anfitrion/:documento_id',
  obtenerSunatDashboardTransporte
);

router.get(
  '/mve_transventa/dashboard/rutas/:periodo/:id_anfitrion/:documento_id',
  obtenerRutasDashboardTransporte
);

router.get(
  '/mve_transventa/dashboard/encomiendas-mensual/:periodo/:id_anfitrion/:documento_id',
  obtenerComparativoMensualEncomiendasDashboardTransporte
);

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
