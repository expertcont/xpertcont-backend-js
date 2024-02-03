const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodasCuentas,obtenerCuenta, crearCuenta, actualizarCuenta, eliminarCuenta} = require('../controllers/cuenta.controllers')

router.get('/cuentas/:id_usuario/:documento_id', obtenerTodasCuentas);//id_usuario(correo anfitrion) y documento_id(ruc contab)
router.get('/cuentassimple/:id_usuario/:documento_id/:id_maestro', obtenerTodasCuentas);//id_usuario(correo anfitrion) y documento_id(ruc contab) y maestro para filtrado
router.get('/cuenta/:id_usuario/:documento_id/:id_cuenta', obtenerCuenta);
router.post('/cuenta', crearCuenta);
router.put('/cuenta/:id_usuario/:documento_id/:id_cuenta', actualizarCuenta);
router.delete('/cuenta/:id_usuario/:documento_id/:id_cuenta', eliminarCuenta);

module.exports = router;