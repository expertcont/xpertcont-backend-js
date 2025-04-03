const {Router} = require('express');
const multer = require('multer');
const router = Router();
const upload = multer();

const {obtenerTodosEquipos,obtenerEquipo,crearEquipo, actualizarEquipo, eliminarEquipo, obtenerEquipoIgv, importarExcelEquipos, eliminarEquipoMasivo, obtenerTodosEquiposPopUp} = require('../controllers/equipo.controllers')

router.get('/ad_equipo/:id_anfitrion/:documento_id', obtenerTodosEquipos);
router.get('/ad_equipopopup/:id_anfitrion/:documento_id', obtenerTodosEquiposPopUp);
router.get('/ad_equipo/:id_anfitrion/:documento_id/:id_Equipo', obtenerEquipo);
router.get('/ad_equipoigv/:id_anfitrion/:documento_id/:id_Equipo', obtenerEquipoIgv);
//version multiempresa multiusario
router.post('/ad_equipo', crearEquipo);
router.post('/ad_equipoexcel', upload.single('archivoExcel'), importarExcelEquipos);

router.put('/ad_equipo/:id_anfitrion/:documento_id/:id_Equipo', actualizarEquipo);
router.delete('/ad_equipo/:id_anfitrion/:documento_id/:id_Equipo', eliminarEquipo);
router.delete('/ad_equipomasivo/:id_anfitrion/:documento_id/:origen', eliminarEquipoMasivo);

module.exports = router;