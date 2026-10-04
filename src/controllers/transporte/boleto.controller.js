// Capa HTTP de las operaciones propias de boleto de transporte.
//
// El boleto se GRABA por el nucleo comun (POST /mve_transventa), porque comparte
// tabla y contrato con la encomienda. Lo unico propio de boleto que queda aca es
// el listado acotado a boletos: el manifiesto tiene su propia capa
// (transmanifiesto.controller.js) y el alta sigue en el nucleo.
//
// No hay rutas de encomienda en este archivo.
const service = require('../../services/transporte/boleto.service');

// Lista los boletos de una empresa. Devuelve las mismas columnas que el listado
// general del nucleo, pero filtrando por tipo en la base y no en el navegador.
//
// dia acepta '*' para no acotar por fecha, igual que el listado del nucleo.
const listarBoletos = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || dia === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener boletos de transporte'
    });
  }

  const respuesta = await service.listarBoletos({
    periodo,
    id_anfitrion,
    documento_id,
    dia,
    idPuntoVentaCrudo: req.params.id_punto_venta || req.query?.id_punto_venta,
    estadoCrudo: req.query?.estado || req.query?.registrado,
  });

  return res.status(respuesta.status).json(respuesta.body);
};
// ---------------------------------------------------------------------------
// Lo del MANIFIESTO tiene su propia capa: controllers/transporte/transmanifiesto.controller.js
// ---------------------------------------------------------------------------

module.exports = {
  listarBoletos,
};