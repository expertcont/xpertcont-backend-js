const {Router} = require('express');
const multer = require('multer');
//const pool = require('../db');
const router = Router();
const upload = multer();

const {obtenerTodosAsientosCompra,obtenerTodosAsientosVenta,obtenerTodosAsientosCaja,obtenerTodosAsientosDiario,obtenerTodosAsientosPlan,obtenerAsiento,crearAsiento,actualizarAsiento,anularAsiento,eliminarAsiento,eliminarAsientoOrigen,crearAsientoExcelVentas,crearAsientoExcelCompras,obtenerSireCompras} = require('../controllers/asiento.controllers')


router.get('/asiento/compras/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosCompra);
router.get('/asiento/ventas/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosVenta);
router.get('/asiento/caja/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosCaja);
router.get('/asiento/diario/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosDiario);

router.get('/sire/compras/:id_anfitrion/:documento_id/:razon_social/:periodo', obtenerSireCompras);

router.get('/asiento/:fecha_ini/:fecha_proceso', obtenerTodosAsientosPlan);
router.get('/asiento/todos/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', obtenerAsiento);

router.post('/asiento', crearAsiento);
router.post('/asientoexcelventas', upload.single('archivoExcel'), crearAsientoExcelVentas);
router.post('/asientoexcelcompras', upload.single('archivoExcel'), crearAsientoExcelCompras);

router.put('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', actualizarAsiento);
router.put('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', anularAsiento);
router.delete('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', eliminarAsiento);
router.delete('/asientomasivo/:id_anfitrion/:documento_id/:periodo/:id_libro/:origen', eliminarAsientoOrigen);

module.exports = router;