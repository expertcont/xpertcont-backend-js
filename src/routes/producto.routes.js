const {Router} = require('express');
const router = Router();
const {obtenerTodosProductos,obtenerProducto,crearProducto, actualizarProducto, eliminarProducto, obtenerProductoIgv} = require('../controllers/producto.controllers')

router.get('/producto/:id_usuario/:documento_id', obtenerTodosProductos);
router.get('/producto/:id_usuario/:documento_id/:id_producto', obtenerProducto);
router.get('/productoigv/:id_usuario/:documento_id/:id_producto', obtenerProductoIgv);
//version multiempresa multiusario
router.post('/producto', crearProducto);

router.put('/producto/:id_usuario/:documento_id/:id_producto', actualizarProducto);
router.delete('/producto/:id_usuario/:documento_id/:id_producto', eliminarProducto);

module.exports = router;