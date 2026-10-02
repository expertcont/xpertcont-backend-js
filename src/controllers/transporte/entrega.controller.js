// Capa HTTP del flujo de encomiendas en agencia destino.
//
// Solo req/res y el status de respuesta. Las reglas viven en el service y el SQL
// en el repository. El frontend sigue llamando exactamente las mismas URLs con
// los mismos parametros.
const service = require('../../services/transporte/entrega.service');

const listarEncomiendasPorEntregar = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, id_punto_venta_dest } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || !id_punto_venta_dest) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para listar encomiendas por entregar'
    });
  }

  const respuesta = await service.listarEncomiendasPorEntregar({
    params: { periodo, id_anfitrion, documento_id, id_punto_venta_dest },
    query: req.query,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const registrarEntregaEncomienda = async (req, res) => {
  const respuesta = await service.registrarEntregaEncomienda(req.body);
  return res.status(respuesta.status).json(respuesta.body);
};

const liberarContraEncomienda = async (req, res) => {
  const respuesta = await service.liberarContraEncomienda(req.body);
  return res.status(respuesta.status).json(respuesta.body);
};

const registrarLlegadaRealEncomienda = async (req, res) => {
  const respuesta = await service.registrarLlegadaRealEncomienda(req.body);
  return res.status(respuesta.status).json(respuesta.body);
};

module.exports = {
  listarEncomiendasPorEntregar,
  registrarEntregaEncomienda,
  liberarContraEncomienda,
  registrarLlegadaRealEncomienda,
};
