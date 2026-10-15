const { Router } = require('express');
const multer = require('multer');
const { MAX_BYTES } = require('../services/sire/sireReemplazoArchivo.service');
const controller = require('../controllers/transporte/sireReemplazo.controller');
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), preservePath: true,
  limits: { fileSize: MAX_BYTES, files: 1, fields: 10, fieldSize: 2048 } }).single('archivo');
router.post('/transporte/sire/propuesta/reemplazo/preparar', (req, res, next) => {
  upload(req, res, (error) => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ success: false, message: 'Adjunta un unico archivo TXT o ZIP RVIE de hasta 20 MiB.' });
    return next();
  });
}, controller.prepararReemplazoSireTransporte);
router.post('/transporte/sire/propuesta/reemplazo/generar', controller.prepararReemplazoSireTransporte);
router.post('/transporte/sire/propuesta/reemplazo/conciliar', controller.conciliarReemplazoSireTransporte);
router.post('/transporte/sire/propuesta/reemplazar', controller.enviarReemplazoSireTransporte);
router.post('/transporte/sire/propuesta/reemplazo/estado', controller.consultarReemplazoSireTransporte);
router.get('/transporte/sire/propuesta/reemplazo/:periodo/:id_anfitrion/:documento_id', controller.obtenerReemplazoSireTransporte);
router.get('/transporte/sire/propuesta/reemplazo/archivo/:periodo/:id_anfitrion/:documento_id', controller.descargarReemplazoSireTransporte);
module.exports = router;