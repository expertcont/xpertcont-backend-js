// Normalizacion de texto compartida.
//
// Se extrajo de controllers/ventatrans.controllers.js porque la usan el legacy
// y los modulos nuevos de transporte. Una sola implementacion para que no
// cambien los recortes ni las comparaciones en ningun consumidor.
const normalizarTexto = (valor) => (valor || '').toString().trim();

module.exports = { normalizarTexto };
