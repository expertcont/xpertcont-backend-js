const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosCorrentista,obtenerCorrentista,crearCorrentista,actualizarCorrentista,eliminarCorrentista, obtenerCorrentistaPopUp, obtenerCorrentistaHabitual, generarCorrentista} = require('../controllers/correntista.controllers')

router.get('/correntista', obtenerTodosCorrentista);
router.get('/correntistahabitual/:id_usuario', obtenerCorrentistaHabitual);
router.get('/correntista/:id_usuario/:id', obtenerCorrentista);//separado por usuario
router.get('/correntistapopup/:id_usuario/:documento_id', obtenerCorrentistaPopUp);//separado por usuario

router.post('/correntista', crearCorrentista);
router.put('/correntista/:id', actualizarCorrentista);
router.delete('/correntista/:id', eliminarCorrentista);

router.post('/correntistagenera', generarCorrentista);

module.exports = router;
