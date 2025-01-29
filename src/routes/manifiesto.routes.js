const {Router} = require('express');
const pool = require('../db');
const router = Router();
const { obtenerTodosManifiestoDet, crearManifiestoDet } = require('../controllers/manifiesto.controllers');

router.post('/manifiestodet', obtenerTodosManifiestoDet);
//router.get('/zona/:id', obtenerZona);
router.post('/manifiestodet_ins', crearManifiestoDet);
//router.put('/zona/:id', actualizarZona);
//router.delete('/zona/:id', eliminarZona);

module.exports = router;