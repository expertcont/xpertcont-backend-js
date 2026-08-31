const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosCorrentista,obtenerCorrentista,crearCorrentista,actualizarCorrentista,eliminarCorrentista, obtenerCorrentistaPopUp, obtenerCorrentistaHabitual, obtenerCorrentistaHabitualItem, crearCorrentistaHabitual, actualizarCorrentistaHabitual, eliminarCorrentistaHabitual, generarCorrentista} = require('../controllers/correntista.controllers')

router.get('/correntista', obtenerTodosCorrentista);
router.get('/correntistahabitual/:id_usuario/:documento_id/:hab_documento_id', obtenerCorrentistaHabitualItem);
router.get('/correntistahabitual/:id_usuario/:documento_id', obtenerCorrentistaHabitual);
router.get('/correntista/:id_usuario/:id', obtenerCorrentista);//separado por usuario
router.get('/correntistapopup/:id_usuario/:documento_id', obtenerCorrentistaPopUp);//separado por usuario

router.post('/correntista', crearCorrentista);
router.post('/correntistahabitual', crearCorrentistaHabitual);
router.put('/correntistahabitual/:id_usuario/:documento_id/:hab_documento_id', actualizarCorrentistaHabitual);
router.delete('/correntistahabitual/:id_usuario/:documento_id/:hab_documento_id', eliminarCorrentistaHabitual);
router.put('/correntista/:id', actualizarCorrentista);
router.delete('/correntista/:id', eliminarCorrentista);

router.post('/correntistagenera', generarCorrentista);

module.exports = router;
