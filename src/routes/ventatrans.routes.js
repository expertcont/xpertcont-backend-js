const { Router } = require('express');
const router = Router();

// Nucleo comun de mve_transventa (encomienda 'E' y boleto 'B').
const {
  crearVentaTrans,
  obtenerVentasTrans,
  obtenerVentaTrans,
  actualizarVentaTrans,
  anularVentaTrans,
  eliminarVentaTrans
} = require('../controllers/transporte/transventa.controller');

// Dashboard de transporte: vive en controllers/transporte, separado del legacy.
const {
  obtenerResumenDashboardTransporte,
  obtenerProductividadDashboardTransporte,
  obtenerSunatDashboardTransporte,
  obtenerRutasDashboardTransporte,
  obtenerComparativoMensualEncomiendasDashboardTransporte,
  obtenerUsuariosDashboardTransporte,
  obtenerDashboardTransporte,
} = require('../controllers/transporte/dashboard.controller');

// Tickets PDF de encomienda: viven en controllers/transporte.
const {
  generarTicketPDFEncomiendaExpertcont,
  generarTicketAdminPDFEncomiendaExpertcont,
} = require('../controllers/transporte/ticket.controller');

// SUNAT / Resumen Diario: viven en controllers/transporte.
const {
  generarResumenCPEexpertcontTransporte,
  consultarResumenCPEexpertcontTransporte,
  corregirRdiRechazadoTransporte,
  obtenerResumenesCPEexpertcontTransporte,
} = require('../controllers/transporte/sunat.controller');

// Operacion de encomiendas en agencia destino: viven en controllers/transporte.
const {
  listarEncomiendasPorEntregar,
  registrarEntregaEncomienda,
  liberarContraEncomienda,
  registrarLlegadaRealEncomienda,
} = require('../controllers/transporte/entrega.controller');

// Clonacion de encomiendas historicas: vive en controllers/transporte.
const {
  clonarEncomienda,
} = require('../controllers/transporte/encomienda.controller');

// Envio individual de CPE: vive en controllers/transporte. Este modulo tambien
// recebera los boletos (tipo_operacion = 'B'); por ahora solo admite encomiendas.
const {
  generarCPEexpertcontTransporte,
} = require('../controllers/transporte/cpe.controller');

// Operaciones propias de boleto: listado acotado a boletos, que es el insumo de un
// manifiesto. El alta sigue en el nucleo comun (POST /mve_transventa) porque
// comparte contrato con la encomienda.
const {
  listarBoletos,
} = require('../controllers/transporte/boleto.controller');

// Manifiesto de pasajeros. Se llama transmanifiesto y no manifiesto para no
// confundirse con routes/manifiesto.routes.js, que es el manifiesto legado de
// otra base (/manifiestodet, /manifiestocarga, ...).
const {
  listarBoletosDisponibles,
  obtenerManifiestos,
  obtenerManifiesto,
  crearManifiesto,
  agregarPasajero,
  quitarPasajero,
  cerrarManifiesto,
  eliminarManifiesto,
} = require('../controllers/transporte/transmanifiesto.controller');

const {
  listarGremTransporte,
  obtenerUbigeosGremTransporte,
  grabarGremTransporte,
  responderPayloadGremTransporte,
  generarGremSunatTransporte,
  generarGremPdfTransporte,
} = require('../controllers/grem.controllers');

router.post('/mve_transventa', crearVentaTrans);
router.post('/mve_transventa/cpe', generarCPEexpertcontTransporte);
router.get('/mve_transventa/grem/:periodo/:id_anfitrion/:documento_id', listarGremTransporte);
router.get('/mve_transventa/grem/ubigeos/listado', obtenerUbigeosGremTransporte);

router.post('/mve_transventa/grem/grabar', grabarGremTransporte);
router.post('/mve_transventa/grem/payload', responderPayloadGremTransporte);
router.post('/mve_transventa/grem/pdf', generarGremPdfTransporte);
router.post('/mve_transventa/grem/sunat', generarGremSunatTransporte);

router.post('/mve_transventa/ticket/encomienda', generarTicketPDFEncomiendaExpertcont);
router.post('/mve_transventa/ticket/encomienda/admin', generarTicketAdminPDFEncomiendaExpertcont);
router.post('/mve_transventa/cpe/resumen', generarResumenCPEexpertcontTransporte);
router.post('/mve_transventa/cpe/resumen/ticket', consultarResumenCPEexpertcontTransporte);
router.post('/mve_transventa/cpe/resumen/corregir-rechazado', corregirRdiRechazadoTransporte);
router.get('/mve_transventa/cpe/resumen/:periodo/:id_anfitrion/:documento_id', obtenerResumenesCPEexpertcontTransporte);

router.get(
  '/mve_transventa/encomienda/clonar/:periodo/:id_anfitrion/:documento_id',
  clonarEncomienda
);

router.get(
  '/mve_transventa/encomienda/por-entregar/:periodo/:id_anfitrion/:documento_id/:id_punto_venta_dest',
  listarEncomiendasPorEntregar
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
  '/mve_transventa/dashboard/usuarios/:periodo/:id_anfitrion/:documento_id',
  obtenerUsuariosDashboardTransporte
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

// Listado propio de boletos. Va ANTES de los listados genericos de :periodo:
// Express compara en orden y "/mve_transventa/boletos/..." seria tomado como
// periodo = "boletos" por la ruta de abajo.
router.get(
  '/mve_transventa/boletos/:periodo/:id_anfitrion/:documento_id/:dia',
  listarBoletos
);

router.get(
  '/mve_transventa/boletos/:periodo/:id_anfitrion/:documento_id/:dia/:id_punto_venta',
  listarBoletos
);

// ---------------------------------------------------------------------------
// Manifiesto de pasajeros (transmanifiesto).
//
// Todas van antes de los listados genericos de :periodo. Ademas, la ruta
// estatica boletos-disponibles va antes que la parametrizada del manifiesto:
// si hiciera al reves, Express leeria "boletos-disponibles" como un id.
// ---------------------------------------------------------------------------
router.get(
  '/mve_transmanifiesto/boletos-disponibles',
  listarBoletosDisponibles
);

router.get('/mve_transmanifiesto', obtenerManifiestos);
router.post('/mve_transmanifiesto', crearManifiesto);

router.get('/mve_transmanifiesto/:id_manifiesto', obtenerManifiesto);

router.post('/mve_transmanifiesto/:id_manifiesto/pasajero', agregarPasajero);
router.delete('/mve_transmanifiesto/:id_manifiesto/pasajero', quitarPasajero);

router.put('/mve_transmanifiesto/:id_manifiesto/cerrar', cerrarManifiesto);
router.delete('/mve_transmanifiesto/:id_manifiesto', eliminarManifiesto);

router.get(
  '/mve_transventa/:periodo/:id_anfitrion/:documento_id/:dia/:id_punto_venta',
  obtenerVentasTrans
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

router.patch(
  '/mve_transventa/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/anular',
  anularVentaTrans
);

router.delete(
  '/mve_transventa/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem',
  eliminarVentaTrans
);

router.put('/mve_transventa/entrega', registrarEntregaEncomienda);
router.put('/mve_transventa/encomienda/liberar-contra', liberarContraEncomienda);
router.put('/mve_transventa/encomienda/llegada-real', registrarLlegadaRealEncomienda);

module.exports = router;
