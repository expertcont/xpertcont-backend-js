const {Router} = require('express');
const multer = require('multer');
//const pool = require('../db');
const router = Router();
const {generarTicketSireDescarga, generarTicketSireAdmin, generarTicketSireEstado, generarTicketSireConsulta} = require('../controllers/sire.controllers')

router.post('/sire/ticket', generarTicketSireAdmin);
router.post('/sire/ticket/consulta', generarTicketSireConsulta); //consulta interna, en bd
router.post('/sire/ticket/estado', generarTicketSireEstado);
router.post('/sire/ticket/descarga', generarTicketSireDescarga);

/*router.post('/asiento', crearAsiento);
router.post('/asientoexcelventas', upload.single('archivoExcel'), importarExcelRegVentas);
router.post('/asientoexcelcompras', upload.single('archivoExcel'), importarExcelRegCompras);

router.post('/asientosireventas', upload.single('archivoExcel'), importarSireRegVentas);//ahora es cvs o excel 97
router.post('/asientosirecompras', upload.single('archivoExcel'), importarSireRegCompras);//ahora es cvs o excel 97
*/

module.exports = router;