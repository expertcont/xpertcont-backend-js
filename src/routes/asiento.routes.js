const {Router} = require('express');
const multer = require('multer');
//const pool = require('../db');
const router = Router();
const upload = multer();

const {obtenerTodosAsientosCompra,obtenerTodosAsientosVenta,obtenerTodosAsientosCaja,obtenerTodosAsientosDiario,obtenerTodosAsientosPlan,obtenerAsiento,crearAsiento,actualizarAsiento,anularAsiento,eliminarAsiento,eliminarAsientoOrigen,importarExcelRegVentas,importarExcelRegCompras,generarSireCompras,generarSireVentas,importarSireRegVentas,importarSireRegCompras,obtenerTodosAsientosComparacion, obtenerTodosAsientosPrev, crearAsientoMasivoVentas, crearAsientoMasivoCompras, generarSireComprasNoDomic, crearAsientoMasivoVentasContado, crearAsientoMasivoDifCambio, crearAsientoMayorizado, crearAsientoMasivoCaja} = require('../controllers/asiento.controllers')

router.get('/asiento/compras/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosCompra);
router.get('/asiento/ventas/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosVenta);
router.get('/asientosirecompara/:id_anfitrion/:id_invitado/:periodo/:documento_id/:id_libro', obtenerTodosAsientosComparacion);
router.get('/asientoprev/:id_anfitrion/:periodo/:documento_id/:id_libro', obtenerTodosAsientosPrev); //new
router.get('/asiento/caja/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosCaja);
router.get('/asiento/diario/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosDiario);

router.get('/sire/compras/:id_anfitrion/:documento_id/:razon_social/:periodo', generarSireCompras); //new moneda PEN o USD
router.get('/sire/compras/nodomic/:id_anfitrion/:documento_id/:razon_social/:periodo', generarSireComprasNoDomic); //new moneda PEN o USD
router.get('/sire/ventas/:id_anfitrion/:documento_id/:razon_social/:periodo', generarSireVentas);//new moneda PEN o USD

router.get('/asiento/:fecha_ini/:fecha_proceso', obtenerTodosAsientosPlan);
router.get('/asiento/todos/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', obtenerAsiento);

router.post('/asiento', crearAsiento);
router.post('/asientoexcelventas', upload.single('archivoExcel'), importarExcelRegVentas);
router.post('/asientoexcelcompras', upload.single('archivoExcel'), importarExcelRegCompras);

router.post('/asientosireventas', upload.single('archivoExcel'), importarSireRegVentas);//ahora es cvs o excel 97
router.post('/asientosirecompras', upload.single('archivoExcel'), importarSireRegCompras);//ahora es cvs o excel 97

router.post('/asientomasivoventas/:id_anfitrion/:documento_id/:periodo/:id_cuenta/:glosa', crearAsientoMasivoVentas); //new para ejecutar proc almac con jsonb
router.post('/asientomasivocompras/:id_anfitrion/:documento_id/:periodo/:id_cuenta/:id_cuenta_cargo/:id_cuenta_abono/:glosa', crearAsientoMasivoCompras); //new para ejecutar proc almac con jsonb
router.post('/asientomasivocaja/:id_anfitrion/:documento_id/:periodo', crearAsientoMasivoCaja); //new con jsonb

router.post('/asientomasivoventascontado/:id_anfitrion/:documento_id/:periodo', crearAsientoMasivoVentasContado); //new 
router.post('/asientomasivodifcambio/:id_anfitrion/:documento_id/:periodo', crearAsientoMasivoDifCambio); //new 
router.post('/asientomayorizado/:id_anfitrion/:documento_id/:periodo/:id_libro', crearAsientoMayorizado); //new 

router.put('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', actualizarAsiento);
router.put('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', anularAsiento);
router.delete('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', eliminarAsiento);
router.delete('/asientomasivo/:id_anfitrion/:documento_id/:periodo/:id_libro/:origen', eliminarAsientoOrigen);

module.exports = router;