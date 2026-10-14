const fetch = require('node-fetch');
const repository = require('../../repositories/sire/sire.repository');

const LIBRO_SIRE_MAP = {
  '014': '140000',
  '008': '080000',
};

const normalizarIdLibroSire = (idLibro = '014') => LIBRO_SIRE_MAP[idLibro] || idLibro;

const obtenerAliasLibroPropuesta = (idLibroSire) => (idLibroSire === '140000' ? 'rvie' : 'rce');

const normalizarPeriodoSire = (periodo = '') => periodo.replace(/-/g, '');

const obtenerCredencialesSire = async ({ idAnfitrion, documentoId }) => {
  const credenciales = await repository.obtenerCredencialesSire({ idAnfitrion, documentoId });

  if (!credenciales) {
    throw new Error('No se encontraron credenciales SIRe para la contabilidad indicada.');
  }

  return credenciales;
};

const obtenerTokenSire = async ({ idAnfitrion, documentoId }) => {
  const credenciales = await obtenerCredencialesSire({ idAnfitrion, documentoId });
  const url = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${credenciales.sire_id}/oauth2/token/`;
  const body = new URLSearchParams({
    grant_type: 'password',
    scope: 'https://api-sire.sunat.gob.pe',
    client_id: credenciales.sire_id,
    client_secret: credenciales.sire_secret,
    username: `${documentoId}${credenciales.sire_sol}`,
    password: credenciales.sire_solpwd,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'SUNAT no devolvio token SIRe.');
  }

  return data.access_token;
};

const generarTicketPropuestaSire = async ({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro = '014',
  reutilizarExistente = true,
}) => {
  const idLibroSire = normalizarIdLibroSire(idLibro);

  if (reutilizarExistente) {
    const ticketExistente = await repository.obtenerTicketPropuestaSire({
      idAnfitrion,
      documentoId,
      periodo,
      idLibro: idLibroSire,
    });

    if (ticketExistente) {
      return { ticket: ticketExistente, reutilizado: true, id_libro_sire: idLibroSire };
    }
  }

  const token = await obtenerTokenSire({ idAnfitrion, documentoId });
  const periodoSire = normalizarPeriodoSire(periodo);
  const aliasLibro = obtenerAliasLibroPropuesta(idLibroSire);
  const url = `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/${aliasLibro}/propuesta/web/propuesta/${periodoSire}/exportapropuesta?codTipoArchivo=0`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok || !data.numTicket) {
    throw new Error(data.msg || data.message || data.error || 'SUNAT no devolvio ticket de propuesta SIRe.');
  }

  const ticket = await repository.registrarTicketPropuestaSire({
    idAnfitrion,
    documentoId,
    periodo,
    idLibro: idLibroSire,
    ticket: data.numTicket,
  });

  return { ticket, reutilizado: false, id_libro_sire: idLibroSire, respuesta_sunat: data };
};

const consultarEstadoTicketSire = async ({ idAnfitrion, documentoId, periodo, ticket }) => {
  const token = await obtenerTokenSire({ idAnfitrion, documentoId });
  const periodoSire = normalizarPeriodoSire(periodo);
  const url = `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?perIni=${periodoSire}&perFin=${periodoSire}&page=1&perPage=100&numTicket=${ticket}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
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
}) => {
  const idLibroSire = normalizarIdLibroSire(idLibro);
  const token = await obtenerTokenSire({ idAnfitrion, documentoId });
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

module.exports = {
  normalizarIdLibroSire,
  obtenerCredencialesSire,
  obtenerTokenSire,
  generarTicketPropuestaSire,
  consultarEstadoTicketSire,
  descargarPropuestaSire,
};
