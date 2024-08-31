const {Router} = require('express');
const multer = require('multer');
const router = Router();
const upload = multer();

const {obtenerTodosProductos,obtenerProducto,crearProducto, actualizarProducto, eliminarProducto, obtenerProductoIgv, importarExcelProductos, eliminarProductoMasivo} = require('../controllers/producto.controllers')

router.get('/ad_producto/:id_anfitrion/:documento_id', obtenerTodosProductos);
router.get('/ad_producto/:id_anfitrion/:documento_id/:id_producto', obtenerProducto);
router.get('/ad_productoigv/:id_anfitrion/:documento_id/:id_producto', obtenerProductoIgv);
//version multiempresa multiusario
router.post('/ad_producto', crearProducto);
router.post('/ad_productoexcel', upload.single('archivoExcel'), importarExcelProductos);

router.put('/ad_producto/:id_anfitrion/:documento_id/:id_producto', actualizarProducto);
router.delete('/ad_producto/:id_anfitrion/:documento_id/:id_producto', eliminarProducto);
router.delete('/ad_productomasivo/:id_anfitrion/:documento_id/:origen', eliminarProductoMasivo);

module.exports = router;