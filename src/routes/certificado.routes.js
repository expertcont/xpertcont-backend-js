const {Router} = require('express');
const multer = require('multer');
//const pool = require('../db');
const router = Router();
const upload = multer();

const {obtenerAsiento,actualizarAsiento,eliminarAsiento,importarExcelRegVentas} = require('../controllers/asiento.controllers')

router.get('/asiento/todos/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', obtenerAsiento);

router.post('/asientoexcelventas', upload.single('archivoExcel'), importarExcelRegVentas);

router.put('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', actualizarAsiento);
router.delete('/asiento/:id_anfitrion/:documento_id/:periodo/:id_libro/:num_asiento', eliminarAsiento);

module.exports = router;