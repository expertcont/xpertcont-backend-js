// Capa HTTP del nucleo TransVenta.
//
// Solo req/res, extraccion de parametros y status. Las reglas viven en el
// service y el SQL en el repository. La URL, el metodo y el cuerpo de la
// respuesta no cambian: son los mismos que usaba el controller historico.
const service = require('../../services/transporte/transventa.service');

// Grabar encomienda. tipo_operacion = 'B' sigue devolviendo 501.
const crearVentaTrans = async (req, res) => {
  const respuesta = await service.crearVentaTrans(req.body);

  return res.status(respuesta.status).json(respuesta.body);
};

const obtenerVentasTrans = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || dia === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener operaciones de transporte'
    });
  }

  const respuesta = await service.obtenerVentasTrans({
    periodo,
    id_anfitrion,
    documento_id,
    dia,
    idPuntoVentaCrudo: req.params.id_punto_venta || req.query?.id_punto_venta,
    estadoCrudo: req.query?.estado || req.query?.registrado,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const obtenerVentaTrans = async (req, res) => {
  const {
    periodo, id_usuario, id_anfitrion, id_invitado, documento_id,
    cod, serie, num, elem
  } = req.params;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !cod || !serie || !num || elem === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener operacion de transporte'
    });
  }

  const respuesta = await service.obtenerVentaTrans({
    periodo,
    id_anfitrion,
    documento_id,
    cod,
    serie,
    num,
    elem,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const actualizarVentaTrans = async (req, res) => {
  const {
    periodo, id_usuario, id_anfitrion, documento_id,
    r_cod, r_serie, r_numero, elemento
  } = req.body;

  if (
    !periodo || !(id_usuario || id_anfitrion) || !documento_id ||
    !r_cod || !r_serie || !r_numero ||
    elemento === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar operacion de transporte'
    });
  }

  const respuesta = await service.actualizarVentaTrans(req.body);

  return res.status(respuesta.status).json(respuesta.body);
};

const eliminarVentaTrans = async (req, res) => {
  const {
    periodo, id_anfitrion, documento_id,
    cod, serie, num, elem
  } = req.params;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !cod || !serie || !num || elem === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar operacion de transporte'
    });
  }

  const respuesta = await service.eliminarVentaTrans({
    periodo,
    id_anfitrion,
    documento_id,
    cod,
    serie,
    num,
    elem,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const anularVentaTrans = async (req, res) => {
  const {
    periodo, id_anfitrion, documento_id,
    cod, serie, num, elem
  } = req.params;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !cod || !serie || !num || elem === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para anular operacion de transporte'
    });
  }

  const respuesta = await service.anularVentaTrans({
    periodo,
    id_anfitrion,
    documento_id,
    cod,
    serie,
    num,
    elem,
    ctrlModUsCrudo: req.body?.ctrl_mod_us || req.query?.id_invitado,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

module.exports = {
  crearVentaTrans,
  obtenerVentasTrans,
  obtenerVentaTrans,
  actualizarVentaTrans,
  anularVentaTrans,
  eliminarVentaTrans
};
