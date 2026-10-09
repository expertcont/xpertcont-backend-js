// Capa HTTP de la clonacion de encomiendas.
//
// Solo req/res y el status de respuesta. Las reglas viven en el service y el SQL
// en el repository. La URL y los parametros siguen siendo los mismos.
const service = require('../../services/transporte/encomienda.service');

const clonarEncomienda = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const { id_punto_venta, limit, periodos, cliente_documento } = req.query;

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para buscar encomiendas clonables'
    });
  }

  const respuesta = await service.clonarEncomienda({
    periodo,
    idAnfitrion: id_anfitrion,
    documentoId: documento_id,
    idPuntoVenta: id_punto_venta,
    limit,
    periodos,
    clienteDocumento: cliente_documento,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

module.exports = {
  clonarEncomienda,
};
