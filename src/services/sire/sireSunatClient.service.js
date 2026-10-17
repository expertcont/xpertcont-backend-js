const fetch = require('node-fetch');
const repository = require('../../repositories/sire/sire.repository');

const LIBRO_SIRE_MAP = {
  '014': '140000',
  '008': '080000',
};

const normalizarIdLibroSire = (idLibro = '014') => LIBRO_SIRE_MAP[idLibro] || idLibro;

const obtenerAliasLibroPropuesta = (idLibroSire) => (idLibroSire === '140000' ? 'rvie' : 'rce');

const normalizarPeriodoSire = (periodo = '') => periodo.replace(/-/g, '');

const limpiarTexto = (value = '') => String(value ?? '').trim();

const obtenerRucSire = (documentoId = '') => limpiarTexto(documentoId).replace(/\D/g, '');

const obtenerUsuarioSolSire = ({ documentoId, sireSol }) => {
  const ruc = obtenerRucSire(documentoId);
  const usuarioSol = limpiarTexto(sireSol);

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

const obtenerTokenSunat = async ({ idAnfitrion, documentoId, scope, mensajeError, db }) => {
  const credenciales = await obtenerCredencialesSire({ idAnfitrion, documentoId, db });
  const clientId = limpiarTexto(credenciales.sire_id);
  const clientSecret = limpiarTexto(credenciales.sire_secret);
  const username = obtenerUsuarioSolSire({ documentoId, sireSol: credenciales.sire_sol });
  const password = limpiarTexto(credenciales.sire_solpwd);

  const url = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${clientId}/oauth2/token/`;
  const body = new URLSearchParams({
    grant_type: 'password',
    scope,
    client_id: clientId,
    client_secret: clientSecret,
    username,
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

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || mensajeError);
  }

  return data.access_token;
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
  db,
}) => {
  const idLibroSire = normalizarIdLibroSire(idLibro);
  const token = await obtenerTokenSire({ idAnfitrion, documentoId, db });
  const periodoSire = normalizarPeriodoSire(periodo);
  const url = `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?nomArchivoReporte=${encodeURIComponent(nombreArchivo)}&codTipoArchivoReporte=01&codLibro=${idLibroSire}&perTributario=${periodoSire}&codProceso=10&numTicket=${encodeURIComponent(ticket)}`;

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
