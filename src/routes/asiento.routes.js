const {Router} = require('express');
const multer = require('multer');
//const pool = require('../db');
const router = Router();
const upload = multer();

const {obtenerTodosAsientosCompra,obtenerTodosAsientosPlan,obtenerAsiento,crearAsiento,actualizarAsiento,anularAsiento,eliminarAsiento, crearAsientoExcel} = require('../controllers/asiento.controllers')


router.get('/asiento/compras/:id_anfitrion/:id_invitado/:periodo/:documento_id', obtenerTodosAsientosCompra);
router.get('/asiento/:fecha_ini/:fecha_proceso', obtenerTodosAsientosPlan);

router.get('/asiento/todos/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', obtenerAsiento);

router.post('/asiento', crearAsiento);
router.post('/asientoexcel', upload.single('archivoExcel'), crearAsientoExcel);

router.put('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', actualizarAsiento);
router.put('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', anularAsiento);
router.delete('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', eliminarAsiento);

module.exports = router;