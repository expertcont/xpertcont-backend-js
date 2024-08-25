const {Router} = require('express');
const router = Router();
const {obtenerTodosProductos,obtenerProducto,crearProducto, actualizarProducto, eliminarProducto, obtenerProductoIgv} = require('../controllers/producto.controllers')

router.get('/ad_producto/:id_usuario/:documento_id', obtenerTodosProductos);
router.get('/ad_producto/:id_usuario/:documento_id/:id_producto', obtenerProducto);
router.get('/ad_productoigv/:id_usuario/:documento_id/:id_producto', obtenerProductoIgv);
//version multiempresa multiusario
router.post('/ad_producto', crearProducto);

router.put('/ad_producto/:id_usuario/:documento_id/:id_producto', actualizarProducto);
router.delete('/ad_producto/:id_usuario/:documento_id/:id_producto', eliminarProducto);

module.exports = router;