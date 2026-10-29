const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const { obtenerTokenSunat } = require('../sire/sireSunatClient.service');
const { obtenerTokenPortalCpe } = require('./loginPortalSunat.service');
const { randomUUID } = require('crypto');
const { resumirRespuesta, registrar, resumirToken } = require('./diagnosticoSunat');

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
  401: 'SUNAT rechazo la autorizacion de la consulta CPE.',
  403: 'SUNAT denego el acceso a la consulta CPE.',
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
  const contexto = { referencia: randomUUID(), rucEmpresa: documentoId, comprobante: llave, scope: SCOPE_CPE };
  const diagnostico = {};
  let etapa = 'token';
  registrar(contexto, etapa, 'inicio');
  try {
  const token = await obtenerTokenCpe({ idAnfitrion, documentoId, db, diagnostico });
  registrar(contexto, etapa, 'disponible', diagnostico);
  etapa = 'descarga';
  // El HTTP del token no describe la siguiente llamada al recurso CPE.
  delete diagnostico.httpSunat;
  // Igual que el portal e-factura: GET .../{llave}/{sufijo}, con el codigo de
  // archivo como segmento final separado (verificado contra el trafico real).
  const url = `${CPE_BASE}/${llave}/${definicion.sufijo}`;

  // Solo declaraciones seleccionadas para comparar emisiones; no valida la firma.
  let tokenUsado = token;
  let resumenToken = resumirToken(token, documentoId);
  // El permiso se otorga a la APLICACION (client_id), no al token: si el aud
  // no declara consultacpe con indicador activo, ninguna llamada pasa y SUNAT
  // responde 401 generico. Fallback: obtener el token como el PORTAL e-factura
  // lo hace (login por HTTP con la app interna de SUNAT que SI declara
  // consultacpe para cualquier usuario SOL), tal como hace el usuario al
  // consultar manualmente en el portal. Ver loginPortalSunat.service.js.
  if (resumenToken.consultacpeDeclarado === false) {
    registrar(contexto, etapa, 'permiso_faltante', resumenToken);
    Object.assign(diagnostico, { recursoFaltante: '/v1/contribuyente/consultacpe' });
    etapa = 'token_portal';
    try {
      tokenUsado = await obtenerTokenPortalCpe({ idAnfitrion, documentoId, db, diagnostico });
      const resumenPortal = resumirToken(tokenUsado, documentoId);
      if (resumenPortal.consultacpeDeclarado === false) {
        throw Object.assign(
          new Error('Ni la aplicacion propia ni el login portal entregaron el recurso consultacpe.'),
          { statusCode: 403 }
        );
      }
      resumenToken = resumenPortal;
      console.log(`[SUNAT CPE] recurso consultacpe ausente en la app propia: usando LOGIN PORTAL para ${documentoId}`);
      registrar(contexto, etapa, 'disponible', diagnostico);
      etapa = 'descarga';
      delete diagnostico.httpSunat;
    } catch (portalError) {
      const aviso = [
        'La aplicacion SUNAT de esta empresa no tiene habilitado el recurso /v1/contribuyente/consultacpe (el token no lo declara).',
        'El intento por login del portal tambien fallo:',
        portalError.message,
      ].join(' ');
      registrar(contexto, etapa, 'fallback_portal_fallo', { mensajePortal: portalError.message });
      Object.assign(diagnostico, { mensajeSunat: aviso });
      throw Object.assign(new Error(aviso), { statusCode: portalError.statusCode || 502 });
    }
  }
  registrar(contexto, etapa, 'solicitando', {
    ...diagnostico, ...resumenToken,
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tokenUsado}`,
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
    Object.assign(diagnostico, { httpSunat: response.status }, resumirRespuesta(data, [token, tokenUsado]));
    const detalles = Array.isArray(data?.errors) && data.errors.length
      ? data.errors.map((e) => e.desError || e.msg).filter(Boolean).join(' ') : '';
    const mensaje =
      detalles ||
      (data && (data.msg || data.message || data.error)) ||
      MENSAJES_HTTP[response.status] ||
      `SUNAT respondio HTTP ${response.status}.`;
    throw Object.assign(new Error(mensaje), { statusCode: response.status });
  }

  const base64Archivo = data?.valArchivo || '';
  if (!base64Archivo) {
    Object.assign(diagnostico, { httpSunat: response.status }, resumirRespuesta(data, [token, tokenUsado]));
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
  registrar(contexto, etapa, 'xml_descargado', { ...diagnostico, httpSunat: response.status, bytes: contenido.length });

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
  } catch (error) {
    const resultado = [401, 403].includes(diagnostico.httpSunat) ? 'autorizacion_rechazada' : 'fallo';
    registrar(contexto, etapa, resultado, diagnostico);
    const detalle = [
      `RUC ${documentoId}`, `etapa: ${etapa === 'token' ? 'generacion del token CPE' : etapa === 'token_portal' ? 'login del portal (fallback)' : 'descarga del XML'}`,
      diagnostico.credencial && `credencial: ${diagnostico.credencial}`,
      typeof diagnostico.tokenCache === 'boolean' && `token: ${diagnostico.tokenCache ? 'cache' : 'nuevo'}`,
      diagnostico.httpSunat && `HTTP SUNAT ${diagnostico.httpSunat}`,
      diagnostico.codigoSunat && `codigo SUNAT: ${diagnostico.codigoSunat}`,
      `referencia: ${contexto.referencia}`,
    ].filter(Boolean).join('; ');
    const mensaje = diagnostico.mensajeSunat || (etapa === 'token'
      ? 'No se pudo obtener el token CPE. Revisa el diagnostico del backend.'
      : 'No se pudo descargar el XML. Revisa el diagnostico del backend.');
    error.mensajePublico = `${mensaje} (${detalle})`;
    // El controlador tambien registra error.message en fallos 5xx.
    error.message = error.mensajePublico;
    throw error;
  }
};

module.exports = {
  descargarComprobanteCpe,
  construirLlaveCpe,
  obtenerTokenCpe,
  SCOPE_CPE,
  CPE_BASE,
  FORMATOS,
};
