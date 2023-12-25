const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosUsuarios,obtenerTodosEstudios,obtenerTodosPeriodos,obtenerUsuario,crearUsuario,actualizarUsuario,eliminarUsuario, obtenerTodosContabilidades, obtenerAnfitrion,obtenerTodosContabilidadesVista} = require('../controllers/usuario.controllers')

router.get('/usuario', obtenerTodosUsuarios);
router.get('/usuario/estudios/:id_usuario', obtenerTodosEstudios);
router.get('/usuario/periodos/:id_usuario', obtenerTodosPeriodos);
router.get('/usuario/anfitrion/:id_usuario', obtenerAnfitrion);

//id_usuario = correo anfitrion, id_auxiliar = correo auxiliar
router.get('/usuario/contabilidades/:id_usuario/:id_invitado', obtenerTodosContabilidades);
router.get('/usuario/contabilidades/:id_usuario/:id_invitado/vista', obtenerTodosContabilidadesVista);

router.get('/usuario/:id', obtenerUsuario);
router.post('/usuario', crearUsuario);
router.put('/usuario/:id', actualizarUsuario);
router.delete('/usuario/:id', eliminarUsuario);

module.exports = router;