const {Router} = require('express');
const multer = require('multer');
const router = Router();
const upload = multer();

const {obtenerTodosProductos,obtenerProducto,crearProducto, actualizarProducto, eliminarProducto, obtenerProductoIgv, importarExcelProductos} = require('../controllers/producto.controllers')

router.get('/ad_producto/:id_usuario/:documento_id', obtenerTodosProductos);
router.get('/ad_producto/:id_usuario/:documento_id/:id_producto', obtenerProducto);
router.get('/ad_productoigv/:id_usuario/:documento_id/:id_producto', obtenerProductoIgv);
//version multiempresa multiusario
router.post('/ad_producto', crearProducto);
router.post('/ad_productoexcel', upload.single('archivoExcel'), importarExcelProductos);

router.put('/ad_producto/:id_usuario/:documento_id/:id_producto', actualizarProducto);
router.delete('/ad_producto/:id_usuario/:documento_id/:id_producto', eliminarProducto);

module.exports = router;