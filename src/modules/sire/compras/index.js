// Punto unico de composicion del modulo SIRE Compras.
const pool = require('../../../db');
const propuestas = require('./infrastructure/propuestas.repository')(pool);
const comprasSistema = require('./infrastructure/comprasSistema.repository')(pool);
const tickets = require('../../../repositories/sire/sire.repository');
const sunat = require('../../../services/sire/sireSunatClient.service');
const { leerArchivoPropuesta } = require('./infrastructure/archivoPropuesta');
const servicio = require('./application/sireCompras.service')({ propuestas, comprasSistema, tickets, sunat, leerArchivo: leerArchivoPropuesta });
const personalizada = require('./application/personalizada.service')({
  repo: require('./infrastructure/personalizada.repository')(pool), propuestas, tickets, validar: servicio.validar, consultarPropuesta: servicio.consultar,
});
Object.assign(servicio, personalizada);
const controller = require('./http/controller')(servicio);
module.exports = require('./http/routes')(controller);
