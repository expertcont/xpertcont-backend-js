// ===========================================================================
// Capa HTTP del MANIFIESTO DE PASAJEROS (transmanifiesto).
//
// No confundir con src/controllers/manifiesto.controllers.js: ese es el manifiesto
// legado, de otra base y de otra version del sistema. Este agrupa los boletos de
// un viaje, que viven en mve_transventa.
//
// Su detalle son los boletos que lo apuntan, asi que no hay tabla de detalle ni
// datos de pasajero duplicados.
//
// Estos handlers solo traducen HTTP; las reglas (manifiesto cerrado no se
// modifica, un boleto no se roba de otro manifiesto, no se cierra vacio) estan en
// transmanifiesto.service.
// ===========================================================================
const service = require('../../services/transporte/transmanifiesto.service');

// Boletos todavia no subiidos a ningun manifiesto: los que se pueden agregar.
const listarBoletosDisponibles = async (req, res) => {
  const respuesta = await service.listarBoletosDisponibles({
    ...req.query,
    ...req.body,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const obtenerManifiestos = async (req, res) => {
  const respuesta = await service.obtenerManifiestos({
    ...req.query,
    ...req.body,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const obtenerManifiesto = async (req, res) => {
  const respuesta = await service.obtenerManifiesto({
    id_manifiesto: req.params.id_manifiesto,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const crearManifiesto = async (req, res) => {
  const respuesta = await service.crearManifiesto({
    ...req.query,
    ...req.body,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const agregarPasajero = async (req, res) => {
  const respuesta = await service.agregarPasajero({
    ...req.query,
    ...req.body,
    id_manifiesto: req.params.id_manifiesto,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const quitarPasajero = async (req, res) => {
  const respuesta = await service.quitarPasajero({
    ...req.query,
    ...req.body,
    id_manifiesto: req.params.id_manifiesto,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

const cerrarManifiesto = async (req, res) => {
  const respuesta = await service.cerrarManifiesto({
    ...req.query,
    ...req.body,
    id_manifiesto: req.params.id_manifiesto,
  });

  return res.status(respuesta.status).json(respuesta.body);
};

module.exports = {
  listarBoletosDisponibles,
  obtenerManifiestos,
  obtenerManifiesto,
  crearManifiesto,
  agregarPasajero,
  quitarPasajero,
  cerrarManifiesto,
};
