const {Router} = require('express');
const multer = require('multer');
const router = Router();
const upload = multer();

const {obtenerTodosProductos,obtenerProducto,crearProducto, actualizarProducto, eliminarProducto, obtenerProductoIgv, importarExcelProductos, eliminarProductoMasivo, obtenerTodosProductosPopUp, importarExcelProductosPrecios, obtenerTodosProductosPrecios, obtenerParametrosVenta, obtenerPreciosProducto, actualizarProductoPrecio, obtenerProductoPrecio, obtenerTodosGruposPopUp, crearGrupo, importarExcelGrupos, actualizarGrupo, eliminarGrupoMasivo, eliminarGrupo, clonarProducto} = require('../controllers/producto.controllers')

router.get('/ad_producto/:id_anfitrion/:documento_id', obtenerTodosProductos);
router.get('/ad_productoprecio/:id_anfitrion/:documento_id', obtenerTodosProductosPrecios);
router.get('/ad_productopreciorango/:id_anfitrion/:documento_id/:id_producto', obtenerPreciosProducto);

router.get('/ad_productopopup/:id_anfitrion/:documento_id', obtenerTodosProductosPopUp);
router.get('/ad_grupopopup/:id_anfitrion/:documento_id', obtenerTodosGruposPopUp); //new

router.get('/ad_producto/:id_anfitrion/:documento_id/:id_producto', obtenerProducto);
router.get('/ad_productoigv/:id_anfitrion/:documento_id/:id_producto', obtenerProductoIgv);
router.get('/ad_productoparametros/:id_anfitrion/:documento_id', obtenerParametrosVenta);

router.post('/ad_productoclon', clonarProducto);

//version multiempresa multiusario
router.post('/ad_producto', crearProducto);
router.post('/ad_productoexcel', upload.single('archivoExcel'), importarExcelProductos);
router.post('/ad_productoprecioexcel', upload.single('archivoExcel'), importarExcelProductosPrecios);

router.put('/ad_producto/:id_anfitrion/:documento_id/:id_producto', actualizarProducto);
router.delete('/ad_producto/:id_anfitrion/:documento_id/:id_producto', eliminarProducto);
router.delete('/ad_productomasivo/:id_anfitrion/:documento_id/:origen', eliminarProductoMasivo);

//Seccion precios
router.get('/ad_productoprecio/:id_anfitrion/:documento_id/:id_producto/:unidades', obtenerProductoPrecio);
router.put('/ad_productoprecio/:id_anfitrion/:documento_id/:id_producto/:unidades', actualizarProductoPrecio);

//Seccion Grupos
router.post('/ad_grupo', crearGrupo);
router.delete('/ad_grupo/:id_anfitrion/:documento_id/:id_grupo', eliminarGrupo);
router.post('/ad_grupoexcel', upload.single('archivoExcel'), importarExcelGrupos);
router.put('/ad_grupo/:id_anfitrion/:documento_id/:id_grupo', actualizarGrupo);
router.delete('/ad_grupomasivo/:id_anfitrion/:documento_id/:origen', eliminarGrupoMasivo);

module.exports = router;