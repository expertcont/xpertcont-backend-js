const { Router } = require('express');
module.exports = (controller) => {
  const router = Router();
  router.get('/propuesta/:periodo/:id_anfitrion/:documento_id', controller.recuperar);
  router.post('/propuesta/ticket', controller.generarTicket);
  router.post('/propuesta/consultar', controller.consultar);
  router.get('/propuesta/archivo/:periodo/:id_anfitrion/:documento_id', controller.descargar);
  return router;
};
