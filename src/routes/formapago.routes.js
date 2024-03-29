const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodasFormasPago,obtenerFormaPago,crearFormaPago, actualizarFormaPago, eliminarFormaPago, obtenerTodasFormasPagoPopUp} = require('../controllers/formapago.controllers')

router.get('/formapago', obtenerTodasFormasPago);
router.get('/formapagopopup', obtenerTodasFormasPagoPopUp);
router.get('/formapago/:id', obtenerFormaPago);
router.post('/formapago', crearFormaPago);
router.put('/formapago/:id', actualizarFormaPago);
router.delete('/formapago/:id', eliminarFormaPago);

module.exports = router;