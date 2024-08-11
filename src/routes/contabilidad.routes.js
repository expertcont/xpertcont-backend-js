const {Router} = require('express');
const pool = require('../db');
const router = Router();
const {obtenerTodasContabilidades,obtenerContabilidad, crearContabilidad, actualizarContabilidad, eliminarContabilidad} = require('../controllers/contabilidad.controllers')

router.get('/contabilidad/:id_anfitrion', obtenerTodasContabilidades);//aumentado id_usuario(correo anfitrion)
router.get('/contabilidad/:id_anfitrion/:documento_id/:tipo', obtenerContabilidad);
router.post('/contabilidad', crearContabilidad);
router.put('/contabilidad/:id_anfitrion/:documento_id', actualizarContabilidad);
router.delete('/contabilidad/:id_anfitrion/:documento_id/:tipo', eliminarContabilidad);

module.exports = router;