const fetch = require('node-fetch');
const repository = require('../../repositories/sire/sire.repository');
const { resumirRespuesta, registrar } = require('../cpe/diagnosticoSunat');

const LIBRO_SIRE_MAP = {
  '014': '140000',
  '008': '080000',
};

const normalizarIdLibroSire = (idLibro = '014') => LIBRO_SIRE_MAP[idLibro] || idLibro;

const obtenerAliasLibroPropuesta = (idLibroSire) => (idLibroSire === '140000' ? 'rvie' : 'rce');

const normalizarPeriodoSire = (periodo = '') => periodo.replace(/-/g, '');

const limpiarTexto = (value = '') => String(value ?? '').trim();

const obtenerRucSire = (documentoId = '') => limpiarTexto(documentoId).replace(/\D/g, '');

const obtenerUsuarioSolSire = ({ documentoId, sol }) => {
  const ruc = obtenerRucSire(documentoId);
  const usuarioSol = limpiarTexto(sol);

  if (!ruc || !usuarioSol) return `${ruc}${usuarioSol}`;
  return usuarioSol.startsWith(ruc) ? usuarioSol : `${ruc}${usuarioSol}`;
};

const obtenerCredencialesSire = async ({ idAnfitrion, documentoId, db }) => {
  const credenciales = await repository.obtenerCredencialesSire({ idAnfitrion, documentoId }, db);

  if (!credenciales) {
    throw new Error('No se encontraron credenciales SIRe para la contabilidad indicada.');
  }

  return credenciales;
};

const SCOPE_SIRE = 'https://api-sire.sunat.gob.pe';

// Cache de tokens SUNAT: evita regenerar el token en cada consulta (SUNAT
// limita los logins repetidos en masa). Se guarda por empresa+scope y se
// reutiliza hasta ~5 min antes del exp del JWT (SUNAT emite 3600s de vigencia).
// Si se cambian credenciales en la BD, el token anterior sigue vigente hasta 1h.
const MARGEN_TOKEN_SEG = 300;
const tokensEnCache = new Map();
const decodificarJwt = (token = '') => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8')); } catch { return null; }
};

// Credenciales de usuario SOL para el API SUNAT. Importante (verificado
// empiricamente en produccion con descargas reales): SUNAT habilita el acceso
// al API con el usuario SOL SECUNDARIO (tipo MODDATOS/NASESTEE asociado al
// RUC), no con el usuario principal; parece politica actual de SUNAT.
// En la BD conviven dos pares: principal = sunat_sol/sunat_solpwd (historico,
// no siempre valido para API) y secundario = sire_sol/sire_solpwd (el que
// funciona). Reglas:
//   1) Se usa SIEMPRE una pareja completa; nunca se mezcla el usuario de una
//      con el password de la otra.
//   2) Si el par principal esta completo se intenta primero, y si la
//      autenticacion falla se prueba el secundario.
//   3) Si el principal esta incompleto o null, se usa directamente el
//      secundario.
const paresSol = (credenciales) => {
  const principal = [limpiarTexto(credenciales.sunat_sol), limpiarTexto(credenciales.sunat_solpwd)];
  const secundario = [limpiarTexto(credenciales.sire_sol), limpiarTexto(credenciales.sire_solpwd)];
  if (principal[0] && principal[1]) return [{ par: 'principal', sol: principal[0], password: principal[1] }];
  if (secundario[0] && secundario[1]) return [{ par: 'secundario', sol: secundario[0], password: secundario[1] }];
  if (principal[0] || principal[1] || secundario[0] || secundario[1]) {
    return [{ par: 'incompleto', sol: principal[0] || secundario[0], password: principal[1] || secundario[1] }];
  }
  return [];
};

const generarTokenSunat = async ({ idAnfitrion, documentoId, scope, mensajeError, db, diagnostico }) => {
  const credenciales = await obtenerCredencialesSire({ idAnfitrion, documentoId, db });
  const clientId = limpiarTexto(credenciales.sire_id);
  const clientSecret = limpiarTexto(credenciales.sire_secret);
  const url = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${clientId}/oauth2/token/`;
  const errores = [];
  const esCpe = scope === 'https://api-cpe.sunat.gob.pe';
  const contexto = { rucEmpresa: documentoId, scope };
  const secretos = [clientId, clientSecret, credenciales.sunat_sol, credenciales.sunat_solpwd,
    credenciales.sire_sol, credenciales.sire_solpwd].map(limpiarTexto);
  if (esCpe) registrar(contexto, 'configuracion', 'evaluada', {
    clienteIdPresente: Boolean(clientId), clienteSecretPresente: Boolean(clientSecret),
    principalCompleto: Boolean(limpiarTexto(credenciales.sunat_sol) && limpiarTexto(credenciales.sunat_solpwd)),
    secundarioCompleto: Boolean(limpiarTexto(credenciales.sire_sol) && limpiarTexto(credenciales.sire_solpwd)),
  });

  // Reintento: si auth falla con el par principal, prueba el secundario
  // (usuario tipo MODDATOS), que es el que SUNAT permite para el API actualmente.
  // El log deja rastro (sin credenciales) de que par se uso con exito; solo se
  // emite al generar el token, no en cada llamada cacheada.
  for (const { par, sol, password } of paresSol(credenciales)) {
    if (diagnostico) diagnostico.credencial = par;
    if (esCpe) registrar(contexto, 'token', 'solicitando', { credencial: par });
    const body = new URLSearchParams({
      grant_type: 'password',
      scope,
      client_id: clientId,
      client_secret: clientSecret,
      username: obtenerUsuarioSolSire({ documentoId, sol }),
      password,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      timeout: 30000,
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.access_token) {
      if (esCpe) registrar(contexto, 'token', 'generado', { credencial: par, httpSunat: response.status });
      console.log(`[SUNAT] token ${scope.includes('api-sire') ? 'SIRE' : 'CPE'} generado con credencial ${par} para ${documentoId}`);
      return data.access_token;
    }
    if (esCpe) {
      const resumen = resumirRespuesta(data, secretos);
      Object.assign(diagnostico || {}, resumen, { httpSunat: response.status });
      registrar(contexto, 'token', 'rechazado', { credencial: par, httpSunat: response.status, ...resumen });
    }
    errores.push(data.error_description || data.error || mensajeError);
  }

  throw new Error(errores.join(' | '));
};

// Devuelve el token del cache si existe; si no, lo genera una sola vez y lo
// comparte con las llamadas concurrentes hasta su vencimiento.
const obtenerTokenSunat = ({ idAnfitrion, documentoId, scope, mensajeError, db, diagnostico }) => {
  const clave = `${idAnfitrion}|${documentoId}|${scope}`;
  const cacheado = tokensEnCache.get(clave);
  const entregar = (promesa, cache) => promesa.then(token => {
    if (diagnostico) Object.assign(diagnostico, promesa.diagnostico, { tokenCache: cache });
    return token;
  }, error => {
    if (diagnostico) Object.assign(diagnostico, promesa.diagnostico, { tokenCache: cache });
    throw error;
  });
  if (cacheado) return entregar(cacheado, true);
  const detalleToken = {};
  const promesa = generarTokenSunat({ idAnfitrion, documentoId, scope, mensajeError, db, diagnostico: detalleToken }).then((token) => {
    const expiracion = decodificarJwt(token)?.exp;
    const msVigencia = expiracion ? Math.max(0, (expiracion - MARGEN_TOKEN_SEG) * 1000 - Date.now()) : 0;
    if (msVigencia > 0) setTimeout(() => tokensEnCache.delete(clave), msVigencia).unref();
    return token;
  });
  promesa.diagnostico = detalleToken;
  tokensEnCache.set(clave, promesa);
  promesa.catch(() => tokensEnCache.delete(clave));
  return entregar(promesa, false);
};

const obtenerTokenSire = (args) =>
  obtenerTokenSunat({ ...args, scope: SCOPE_SIRE, mensajeError: 'SUNAT no devolvio token SIRe.' });

const generarTicketPropuestaSire = async ({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro = '014',
  reutilizarExistente = true,
  db,
}) => {
  const idLibroSire = normalizarIdLibroSire(idLibro);

  if (reutilizarExistente) {
    const datosTicket = await repository.obtenerDatosTicketPropuestaSire({
      idAnfitrion,
      documentoId,
      periodo,
      idLibro: idLibroSire,
    }, db);

    if (datosTicket?.sire_tpropuesta) {
      return { ticket: datosTicket.sire_tpropuesta, fecha_generacion: datosTicket.sire_tpropuesta_fecha_generacion || null, reutilizado: true, id_libro_sire: idLibroSire };
    }
  }

  const token = await obtenerTokenSire({ idAnfitrion, documentoId, db });
  const periodoSire = normalizarPeriodoSire(periodo);
  const aliasLibro = obtenerAliasLibroPropuesta(idLibroSire);
  // RCE y RVIE tienen operaciones distintas para descargar la propuesta.
  const operacion = idLibroSire === '080000'
    ? 'exportacioncomprobantepropuesta?codTipoArchivo=0&codOrigenEnvio=2'
    : 'exportapropuesta?codTipoArchivo=0';
  const url = `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/${aliasLibro}/propuesta/web/propuesta/${periodoSire}/${operacion}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  let data;
  try {
    data = await response.json();
  } catch (_) {
    const libro = idLibroSire === '080000' ? 'Compras (RCE)' : 'Ventas (RVIE)';
    const mensaje = `SUNAT devolvio una respuesta no JSON al generar el ticket de ${libro} (HTTP ${response.status || 'desconocido'}). Intenta nuevamente o revisa la disponibilidad del servicio.`;
    throw Object.assign(new Error(mensaje), {
      statusCode: 502, codigo: 'SIRE_RESPUESTA_NO_JSON', mensajePublico: mensaje,
    });
  }

  if (!response.ok || !data?.numTicket) {
    throw new Error(data?.msg || data?.message || data?.error || 'SUNAT no devolvio ticket de propuesta SIRe.');
  }

  const fechaGeneracion = new Date().toISOString();
  const ticket = await repository.registrarTicketPropuestaSire({
    idAnfitrion,
    documentoId,
    periodo,
    idLibro: idLibroSire,
    ticket: data.numTicket,
    fechaGeneracion,
  }, db);

  return { ticket, fecha_generacion: fechaGeneracion, reutilizado: false, id_libro_sire: idLibroSire, respuesta_sunat: data };
};

const consultarEstadoTicketSire = async ({ idAnfitrion, documentoId, periodo, ticket, idLibro = '014', db }) => {
  const token = await obtenerTokenSire({ idAnfitrion, documentoId, db });
  const periodoSire = normalizarPeriodoSire(periodo);
  const url = `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?perIni=${periodoSire}&perFin=${periodoSire}&page=1&perPage=100&codLibro=${normalizarIdLibroSire(idLibro)}&codOrigenEnvio=2&numTicket=${encodeURIComponent(ticket)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.msg || data.message || data.error || 'SUNAT no devolvio estado de ticket SIRe.');
  }

  const archivoReporte = data.registros?.[0]?.archivoReporte?.[0]?.nomArchivoReporte || '';

  return {
    nombre_archivo_rep: archivoReporte,
    registros: data.registros || [],
    respuesta_sunat: data,
  };
};

const descargarPropuestaSire = async ({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro = '014',
  ticket,
  nombreArchivo,
  codTipoArchivoReporte = '01',
  db,
}) => {
  const idLibroSire = normalizarIdLibroSire(idLibro);
  const token = await obtenerTokenSire({ idAnfitrion, documentoId, db });
  const periodoSire = normalizarPeriodoSire(periodo);
  const url = `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?nomArchivoReporte=${encodeURIComponent(nombreArchivo)}&codTipoArchivoReporte=${encodeURIComponent(codTipoArchivoReporte)}&codLibro=${idLibroSire}&perTributario=${periodoSire}&codProceso=10&numTicket=${encodeURIComponent(ticket)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/zip,application/octet-stream,*/*',
    },
  });

  const buffer = await response.buffer();

  if (!response.ok) {
    throw new Error(buffer.toString('utf8') || 'SUNAT no permitio descargar la propuesta SIRe.');
  }

  return {
    buffer,
    nombre_archivo_rep: nombreArchivo,
    content_type: response.headers.get('content-type') || 'application/zip',
    id_libro_sire: idLibroSire,
  };
};


const aceptarPropuestaRvieSire = async ({ idAnfitrion, documentoId, periodo, idLibro = '014', db }) => {
  const libro = normalizarIdLibroSire(idLibro);
  const periodoSire = normalizarPeriodoSire(periodo);
  if (libro !== '140000' || !/^\d{4}(0[1-9]|1[0-2])$/.test(periodoSire)) {
    throw Object.assign(new Error('La aceptacion requiere RVIE y un periodo valido.'), { statusCode: 400 });
  }
  const token = await obtenerTokenSire({ idAnfitrion, documentoId, db });
  let response;
  let data;
  try {
    response = await fetch(
      `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvie/propuesta/web/propuesta/${periodoSire}/aceptapropuesta`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: 90000,
      }
    );
    const raw = await response.text();
    try { data = raw ? JSON.parse(raw) : null; } catch (error) { data = null; }
  } catch (error) {
    throw Object.assign(new Error('No se pudo confirmar la respuesta de SUNAT a la aceptacion.'), {
      statusCode: 503, resultadoIncierto: true,
    });
  }
  if (!response.ok) {
    throw Object.assign(new Error(data?.msg || data?.message || 'SUNAT rechazo la solicitud de aceptacion.'), {
      statusCode: response.status >= 400 && response.status < 500 ? response.status : 502,
      resultadoIncierto: response.status >= 500,
      respuestaSunat: data,
    });
  }
  const ticket = String(data?.numTicket || '').trim();
  if (!/^[A-Za-z0-9]{1,50}$/.test(ticket)) {
    throw Object.assign(new Error('SUNAT no devolvio un ticket de aceptacion valido.'), {
      statusCode: 502, resultadoIncierto: true, respuestaSunat: data,
    });
  }
  return { ticket, respuesta_sunat: data };
};

module.exports = {
  aceptarPropuestaRvieSire,
  normalizarIdLibroSire,
  obtenerCredencialesSire,
  obtenerTokenSire,
  obtenerTokenSunat,
  SCOPE_SIRE,
  generarTicketPropuestaSire,
  consultarEstadoTicketSire,
  descargarPropuestaSire,
};
