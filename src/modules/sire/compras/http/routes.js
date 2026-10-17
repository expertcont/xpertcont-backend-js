const { Router } = require('express');
module.exports = (controller) => {
  const router = Router();
  router.get('/propuesta/:periodo/:id_anfitrion/:documento_id', controller.recuperar);
  router.post('/propuesta/ticket', controller.generarTicket);
  router.post('/propuesta/consultar', controller.consultar);
  router.get('/propuesta/archivo/:periodo/:id_anfitrion/:documento_id', controller.descargar);
  router.get('/personalizada/:periodo/:id_anfitrion/:documento_id', controller.listarPersonalizada);
  router.post('/personalizada/importar', controller.importarPersonalizada);
  router.post('/personalizada', controller.crearPersonalizada);
  router.put('/personalizada/:id_compra', controller.editarPersonalizada);
  router.delete('/personalizada/:id_compra', controller.eliminarPersonalizada);
  return router;
};
