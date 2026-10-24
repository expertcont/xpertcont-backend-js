const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const { obtenerTokenSunat } = require('../sire/sireSunatClient.service');

// ------------------------------------------------------------------
// Servicio de consulta de comprobantes de pago (consultacpe).
// NO es SIRE: vive en otro host, otro scope, y no usa ticket ni periodo.
// Comparte unicamente las credenciales (sire_* en mad_usuariocontabilidad).
// ------------------------------------------------------------------

const SCOPE_CPE = 'https://api-cpe.sunat.gob.pe';
const CPE_BASE = 'https://api-cpe.sunat.gob.pe/v1/contribuyente/consultacpe/comprobantes';

// Sufijos de archivo (dos digitos, verificados contra el trafico del portal):
// 01=PDF, 02=XML, 03=CDR. El "-2" final de la llave es el origen/rol de la
// consulta (receptor) y tambien usa "-2" el portal en ambas llamadas.
const FORMATOS = {
  pdf: { sufijo: '01', extension: '.pdf' },
  xml: { sufijo: '02', extension: '.xml' },
  cdr: { sufijo: '03', extension: '.xml' },
};
// Origen de la consulta: 2 = receptor (compras). El portal lo usa constante.
const CODIGO_ORIGEN = '2';

const MENSAJES_HTTP = {
  400: 'SUNAT rechazo la consulta del comprobante.',
  401: 'El token CPE no tiene permiso sobre este recurso.',
  403: 'El cliente SUNAT no habilito el recurso consultacpe.',
  404: 'El comprobante no existe para la llave enviada.',
  429: 'SUNAT esta limitando la frecuencia. Reintentar mas tarde.',
};

const sinEspacios = (value = '') => String(value ?? '').trim();
const soloDigitos = (value = '') => sinEspacios(value).replace(/\D/g, '');

const obtenerTokenCpe = (args) =>
  obtenerTokenSunat({ ...args, scope: SCOPE_CPE, mensajeError: 'SUNAT no devolvio token CPE.' });

const construirLlaveCpe = ({ ruc, tipo, serie, numero, codigo = CODIGO_ORIGEN }) => {
  const rucLimpio = soloDigitos(ruc);
  const tipoLimpio = sinEspacios(tipo).padStart(2, '0');
  const serieLimpia = sinEspacios(serie).toUpperCase();
  const numeroLimpio = soloDigitos(numero);
  const codigoLimpio = sinEspacios(codigo) || CODIGO_ORIGEN;

  const faltan = [];
  if (!rucLimpio) faltan.push('ruc');
  if (!tipoLimpio) faltan.push('tipo');
  if (!serieLimpia) faltan.push('serie');
  if (!numeroLimpio) faltan.push('numero');
  if (!codigoLimpio) faltan.push('codigo');
  if (faltan.length) {
    throw Object.assign(new Error(`Faltan datos del comprobante: ${faltan.join(', ')}.`), { statusCode: 400 });
  }

  return `${rucLimpio}-${tipoLimpio}-${serieLimpia}-${numeroLimpio}-${codigoLimpio}`;
};

// El ZIP de SUNAT puede venir plano o con un .zip adentro (CDR anidado).
const extraerDesdeZip = (buffer, extensionPreferida) => {
  const zip = new AdmZip(buffer);
  const entradas = zip.getEntries().filter((item) => !item.isDirectory);
  if (!entradas.length) {
    throw Object.assign(new Error('El ZIP de SUNAT no contiene archivos.'), { statusCode: 502 });
  }

  const coinciden = entradas.filter((item) => item.entryName.toLowerCase().endsWith(extensionPreferida));
  const candidatas = coinciden.length ? coinciden : entradas;
  const elegida = candidatas.reduce((a, b) => ((b.header?.size || 0) > (a.header?.size || 0) ? b : a));
  const nombre = elegida.entryName;

  let contenido = zip.readFile(elegida);
  let anidado = false;

  if (nombre.toLowerCase().endsWith('.zip')) {
    const zipInterno = new AdmZip(contenido);
    const internas = zipInterno.getEntries().filter((item) => !item.isDirectory);
    if (internas.length) {
      const mejor = internas.reduce((a, b) => ((b.header?.size || 0) > (a.header?.size || 0) ? b : a));
      contenido = zipInterno.readFile(mejor);
      anidado = true;
    }
  }

  return { contenido, nombre, anidado };
};

const descargarComprobanteCpe = async ({
  ruc,
  tipo,
  serie,
  numero,
  formato = 'xml',
  codigo,
  idAnfitrion,
  documentoId,
  db,
  timeout = 30000,
}) => {
  const definicion = FORMATOS[sinEspacios(formato).toLowerCase()];
  if (!definicion) {
    throw Object.assign(new Error(`Formato no soportado: ${formato}. Usar pdf, xml o cdr.`), { statusCode: 400 });
  }

  const llave = construirLlaveCpe({ ruc, tipo, serie, numero, codigo });
  const token = await obtenerTokenCpe({ idAnfitrion, documentoId, db });
  // Igual que el portal e-factura: GET .../{llave}/{sufijo}, con el codigo de
  // archivo como segmento final separado (verificado contra el trafico real).
  const url = `${CPE_BASE}/${llave}/${definicion.sufijo}`;

  // Diagnostico: decodifica el JWT para verificar si el token incluye el
  // recurso consultacpe. NO muestra el token completo ni credenciales.
  const fragmentoJwt = token.split('.')[1];
  const jwt = (() => { try { return JSON.parse(Buffer.from(fragmentoJwt, 'base64').toString('utf8')); } catch { return null; } })();
  console.log('[SUNAT CPE] token aud:', JSON.stringify(jwt?.aud ?? null));

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      // El WAF de SUNAT corta la conexion (socket hang up) si el request no parece navegador.
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Origin: 'https://e-factura.sunat.gob.pe',
      Referer: 'https://e-factura.sunat.gob.pe/',
    },
    timeout,
  });

  const texto = await response.text();
  let data = null;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    console.error('[SUNAT CPE] HTTP', response.status, url, (texto || '').slice(0, 300));
    const mensaje =
      (data && (data.msg || data.message || data.error)) ||
      MENSAJES_HTTP[response.status] ||
      `SUNAT respondio HTTP ${response.status}.`;
    throw Object.assign(new Error(mensaje), { statusCode: response.status, respuestaSunat: data || texto.slice(0, 300) });
  }

  const base64Archivo = data?.valArchivo || '';
  if (!base64Archivo) {
    throw Object.assign(
      new Error(data?.msg || data?.message || 'SUNAT no devolvio archivo para el comprobante solicitado.'),
      { statusCode: 404, respuestaSunat: data }
    );
  }

  const bufferZip = Buffer.from(base64Archivo, 'base64');
  if (bufferZip.slice(0, 2).toString('utf8') !== 'PK') {
    throw Object.assign(new Error('La respuesta de SUNAT no contiene un ZIP valido.'), { statusCode: 502 });
  }

  const { contenido, nombre, anidado } = extraerDesdeZip(bufferZip, definicion.extension);

  return {
    contenido,
    nombre_archivo: nombre,
    formato: sinEspacios(formato).toLowerCase(),
    llave,
    url,
    zip_anidado: anidado,
    cod_ruc: data?.codRuc || null,
    nom_archivo: data?.nomArchivo || null,
  };
};

module.exports = {
  descargarComprobanteCpe,
  construirLlaveCpe,
  obtenerTokenCpe,
  SCOPE_CPE,
  CPE_BASE,
  FORMATOS,
};
