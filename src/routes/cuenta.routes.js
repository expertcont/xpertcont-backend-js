const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodasCuentas,obtenerCuenta, crearCuenta, actualizarCuenta, eliminarCuenta, obtenerTodasCuentasSimple, obtenerTodosAmarres6, obtenerTodosAmarres9} = require('../controllers/cuenta.controllers')

router.get('/cuentas/:id_usuario/:documento_id', obtenerTodasCuentas);//id_usuario(correo anfitrion) y documento_id(ruc contab)

//truco para recibir parametro en blanco, usar 2 rutas
router.get('/cuentassimple/:id_usuario/:documento_id', obtenerTodasCuentasSimple);//id_usuario(correo anfitrion) y documento_id(ruc contab) y maestro para filtrado
router.get('/cuentassimple/:id_usuario/:documento_id/:id_maestro', obtenerTodasCuentasSimple);//id_usuario(correo anfitrion) y documento_id(ruc contab) y maestro para filtrado
//fin truco

router.get('/cuentasamarre6/:id_usuario/:id_cuenta', obtenerTodosAmarres6);//id_usuario(correo anfitrion) maestro para filtrado
router.get('/cuentasamarre9/:id_usuario/:id_cuenta', obtenerTodosAmarres9);//id_usuario(correo anfitrion) maestro para filtrado

router.get('/cuenta/:id_usuario/:documento_id/:id_cuenta', obtenerCuenta);
router.post('/cuenta', crearCuenta);
router.put('/cuenta/:id_usuario/:documento_id/:id_cuenta', actualizarCuenta);
router.delete('/cuenta/:id_usuario/:documento_id/:id_cuenta', eliminarCuenta);

module.exports = router;