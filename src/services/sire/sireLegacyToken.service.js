const pool = require('../../db');
const fetch = require('node-fetch');
const { registrar, resumirRespuesta } = require('../cpe/diagnosticoSunat');

// Bloque de autenticacion original de sire.controllers.js, anterior a c917545.
// Independiente de sireSunatClient: sin normalizar valores, cache ni otra pareja.
// Solo se agregan validacion de datos, timeout y diagnostico sin secretos.
const obtenerTokenSireLegacy = async ({ idAnfitrion, documentoId, db = pool }) => {
  const { rows } = await db.query(`
      SELECT sire_id,sire_secret,sire_sol,sire_solpwd FROM mad_usuariocontabilidad
      WHERE id_usuario = $1
      AND documento_id = $2
  `, [idAnfitrion, documentoId]);
  const credenciales = rows[0];
  if (!credenciales || ['sire_id', 'sire_secret', 'sire_sol', 'sire_solpwd'].some(campo =>
    credenciales[campo] === null || credenciales[campo] === undefined || credenciales[campo] === '')) {
    throw Object.assign(new Error('Legacy requiere sire_id, sire_secret, sire_sol y sire_solpwd completos en mad_usuariocontabilidad.'), { statusCode: 400 });
  }
  const contexto = { rucEmpresa: documentoId, scope: 'https://api-sire.sunat.gob.pe', servicio: 'SIRE', modo: 'legacy' };
  const sUrlSunatToken = `
      https://api-seguridad.sunat.gob.pe/v1/clientessol/${credenciales.sire_id}/oauth2/token/
      `;
  const data = new URLSearchParams({
    grant_type: 'password',
    scope: 'https://api-sire.sunat.gob.pe',
    client_id: credenciales.sire_id,
    client_secret: credenciales.sire_secret,
    username: documentoId + credenciales.sire_sol,
    password: credenciales.sire_solpwd,
  });
  const secretos = Object.values(credenciales).map(String);
  const diagnostico = { camposSol: 'sire_sol/sire_solpwd', tokenCache: false, modo: 'legacy' };
  registrar(contexto, 'token', 'solicitando', diagnostico);
  let response;
  try {
    response = await fetch(sUrlSunatToken, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data, timeout: 30000,
    });
  } catch {
    // Los errores de fetch pueden incluir la URL; publicar solo una causa segura.
    throw Object.assign(new Error('No se pudo completar la solicitud legacy a SUNAT (red o tiempo de espera).'), { statusCode: 502 });
  }
  const jsonResponse = await response.json().catch(() => null);
  if (!response.ok || !jsonResponse?.access_token) {
    const resumen = resumirRespuesta(jsonResponse, secretos);
    registrar(contexto, 'token', 'rechazado', { ...diagnostico, httpSunat: response.status, ...resumen });
    throw Object.assign(new Error(`Legacy sire_sol/sire_solpwd (HTTP ${response.status}${resumen.codigoSunat ? ', ' + resumen.codigoSunat : ''}): ${resumen.mensajeSunat || 'SUNAT no devolvio access_token.'}`), { statusCode: 502 });
  }
  registrar(contexto, 'token', 'generado', { ...diagnostico, httpSunat: response.status });
  return { token: jsonResponse.access_token, diagnostico: { ...diagnostico, httpSunat: response.status } };
};

module.exports = { obtenerTokenSireLegacy };
