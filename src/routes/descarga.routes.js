const {Router} = require('express');
const router = Router();

router.get('/descargas/:ruc/:archivo', (req, res) => {
  const { ruc, archivo } = req.params;

  // URL real donde Nginx sirve el archivo
  const urlVps =
    `http://74.208.184.113:8080/descargas/${ruc}/${archivo}`;

  // Redirección directa (descarga inmediata)
  res.redirect(urlVps);
});
module.exports = router;

//export default router;
