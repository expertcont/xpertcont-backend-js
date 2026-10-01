// Utilidad compartida de periodos.
//
// Se extrajo de controllers/ventatrans.controllers.js porque la usan tres
// lugares: el dashboard de transporte, clonarEncomienda y
// listarEncomiendasPorEntregar. Vive aparte para que el nuevo dashboard no
// dependa del controller legacy.
const obtenerUltimosPeriodos = (periodo, cantidad = 3) => {
  const match = String(periodo || '').match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return [periodo].filter(Boolean);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, 1));

  return Array.from({ length: cantidad }, (_, index) => {
    const periodoDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - index, 1));
    return [
      periodoDate.getUTCFullYear(),
      String(periodoDate.getUTCMonth() + 1).padStart(2, '0')
    ].join('-');
  });
};

module.exports = { obtenerUltimosPeriodos };