const {Router} = require('express');
const router = Router();
const {
    consultarEquipo,
    obtenerReto,
    verificarEquipo,
    registrarEquipo,
    listarEquipos,
    eliminarEquipo,
} = require('../controllers/dispositivo.controllers');

// Control de equipos autorizados: reto/respuesta con clave no exportable.
router.post('/seguridad/dispositivo/consulta', consultarEquipo); //json
router.post('/seguridad/dispositivo/reto', obtenerReto);         //json
router.post('/seguridad/dispositivo/verificar', verificarEquipo); //json
router.post('/seguridad/dispositivo/registrar', registrarEquipo); //json

router.get('/seguridad/dispositivo/:id_usuario', listarEquipos);
router.delete('/seguridad/dispositivo/:id_usuario/:huella', eliminarEquipo);

module.exports = router;
