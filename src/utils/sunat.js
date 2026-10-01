// Lectura de respuestas de la API SUNAT.
//
// Se extrajo de controllers/ventatrans.controllers.js porque lo consumen tanto
// el flujo de tickets como el de resumen diario SUNAT. Se mantiene una sola
// implementacion para no cambiar el parseo en ninguno de los dos.
const leerRespuestaSunat = async (apiResponse) => {
  const raw = await apiResponse.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    return { message: raw };
  }
};

module.exports = { leerRespuestaSunat };