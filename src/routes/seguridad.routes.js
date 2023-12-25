const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodosPermisoComandosVista,obtenerTodosPermisoComandos,obtenerTodosMenu,registrarPermisoComando,eliminarPermisoComando,registrarUsuario,clonarPermisoComando,eliminarPermisoUsuario,obtenerTodosEmail,obtenerTodosPermisosContabilidadesVista} = require('../controllers/seguridad.controllers')

router.get('/seguridad/:id_usuario/:id_invitado/vista', obtenerTodosPermisoComandosVista);
router.get('/seguridad/:id_usuario/:id_invitado/:id_menu', obtenerTodosPermisoComandos);
router.get('/seguridadmenu/:id_usuario/:id_invitado', obtenerTodosMenu);
router.get('/seguridademail/:id_usuario', obtenerTodosEmail);

router.get('/seguridad/contabilidades/:id_usuario/:id_invitado/vista', obtenerTodosPermisosContabilidadesVista);

router.post('/seguridad', registrarPermisoComando); //no parametros solo json
router.delete('/seguridadclonar', clonarPermisoComando); //new clonar todos de email -> otro email

router.post('/seguridad/:id_usuario/:nombre/nuevo', registrarUsuario); //pendiente

router.delete('/seguridad/:id_usuario/:id_invitado/:id_comando', eliminarPermisoComando);
router.delete('/seguridadeliminar/:id_usuario/:id_invitado', eliminarPermisoUsuario);

module.exports = router;