const {Router} = require('express');
const router = Router();
const {obtenerRegistroGreTodos,crearRegistro,actualizarRegistro,eliminarRegistro, generarGREexpertcont, obtenerRegistroGre, crearRegistroRef} = require('../controllers/gre.controllers')

router.get('/ad_ventagre/:periodo/:id_anfitrion/:documento_id/:dia', obtenerRegistroGreTodos);

router.get('/ad_ventagre/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/', obtenerRegistroGre);
router.post('/ad_ventagre/:periodo/:id_anfitrion/:documento_id', crearRegistro); //crea manual
router.post('/ad_ventagreref/:periodo/:id_anfitrion/:documento_id', crearRegistroRef); //crea desde ventas

router.post('/ad_ventagresunat', generarGREexpertcont); //proveedor 02 expercont now ;)

router.put('/ad_ventagre', actualizarRegistro); //modifica datos cabecera
router.delete('/ad_ventagre', eliminarRegistro); //elimina ultimo registro de venta

module.exports = router;