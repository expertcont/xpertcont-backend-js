// ------------------------------------------------------------------
// Login tipo PORTAL SUNAT para obtener un token con el recurso
// consultacpe, replicando el flujo del portal e-factura SIN navegador.
//
// Descubrimiento (verificado contra el trafico real del portal, oct 2026):
//   1) El portal "Consulta de comprobantes" usa la aplicacion interna de
//      SUNAT con client_id = cd8e7afb-a0e2-4217-9187-88206e4ba7af, cuya
//      app SI declara los recursos /v1/contribuyente/consultacpe y
//      /v1/contribuyente/parametros (indicador 1) para CUALQUIER usuario
//      SOL que inicie sesion en el portal. Por eso en el portal se puede
//      consultar comprobantes de cualquier razon social aunque la app
//      de credenciales API de esa empresa no tenga consultacpe.
//   2) El flujo del portal es authorization-code: el login se hace en
//      https://api-seguridad.sunat.gob.pe/v1/clientessol/{client_id}/
//      oauth2/authen (formulario WebSphere j_security_check), el code
//      vuelve al e-factura y el SERVIDOR del portal canjea el token,
//      que llega al navegador dentro del HTML (sessionStorage
//      "SUNAT.token"). No se requiere captcha en el primer intento
//      (verificaFails esta deshabilitado; el captcha solo aparece tras
//      3 fallos en la misma sesion).
//   3) Con ese token, GET api-cpe.sunat.gob.pe/v1/contribuyente/
//      consultacpe/... responde 200 para el comprobante de cualquier
//      emisor (probado exitosamente con IP extranjera y comprobante
//      20295458551-01-FA03-174509-2).
//
// Por eso este modulo replica el login portal por HTTP puro. IMPORTANTE:
// todas las etapas comienzan con redirecciones (cookies de sesion), por
// lo que cada llamada IVA con redirecciones manuales y se siguen todos
// los saltos acumulando Set-Cookie por dominio:
//   a) GET authen (cadena de redirecciones hasta el formulario)
//   b) POST j_security_check con las credenciales
//      (j_username = usuario SOL, custom_ruc = RUC, j_password = clave)
//   c) se siguen las redirecciones hasta el HTML final y se extrae el JWT
// ------------------------------------------------------------------

const fetch = require('node-fetch');
const { registrar } = require('./diagnosticoSunat');
const { obtenerCredencialesSire } = require('../sire/sireSunatClient.service');

const CLIENTE_PORTAL_CONSULTACPE = 'cd8e7afb-a0e2-4217-9187-88206e4ba7af';
const HOST_SEGURIDAD = 'https://api-seguridad.sunat.gob.pe';
const URI_RETORNO_PORTAL =
  'https://e-factura.sunat.gob.pe/app/contribuyentems/servicio/consultacpe/consulta/nuevaconsulta/1.0.0/';

// El WAF de SUNAT corta las conexiones HTTP sin aspecto de navegador
// (verificado: fetch sin User-Agent recibe ECONNRESET en endpoints
// autenticados, con el mismo token).
const UA_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MARGEN_TOKEN_SEG = 300;
const PORTALES_EN_CACHE = new Map();
const decodificarJwt = (token = '') => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8')); } catch { return null; }
};
const limpiarTexto = (value = '') => String(value ?? '').trim();
const obtenerRuc = (documentoId = '') => limpiarTexto(documentoId).replace(/\D/g, '');

// Para el login PORTAL el usuario va SIN el RUC concatenado (el formulario
// lo pide aparte en custom_ruc). Por la misma razon que el API (verificado
// en produccion), el par SECUNDARIO (sire_sol/sire_solpwd) es el que
// SUNAT acepta: primero el secundario, y luego el principal si existiera.
const paresPortal = (credenciales) => {
  const secundario = [limpiarTexto(credenciales.sire_sol), limpiarTexto(credenciales.sire_solpwd)];
  const principal = [limpiarTexto(credenciales.sunat_sol), limpiarTexto(credenciales.sunat_solpwd)];
  const pares = [];
  if (secundario[0] && secundario[1]) pares.push({ par: 'secundario', sol: secundario[0], password: secundario[1] });
  if (principal[0] && principal[1]) pares.push({ par: 'principal', sol: principal[0], password: principal[1] });
  return pares;
};

const absorberCookies = (jarra, respuesta) => {
  for (const c of respuesta.headers.raw()['set-cookie'] || []) jarra.push(c.split(';')[0]);
};
const headerCookie = (jarra) => (jarra.length ? jarra.join('; ') : undefined);

// Resuelve relativos contra el URL anterior (las Location de SUNAT suelen
// traer path absoluto de otro host).
const resolverUrl = (url, base) => {
  if (url.startsWith('http')) return url;
  return new URL(url, base).toString();
};

// Sigue redirecciones manualmente acumulando Set-Cookie por DOMINIO
// (api-seguridad y e-factura tienen sesiones distintas). Devuelve la
// respuesta final no-redireccional, con una traza [{url, status}].
const seguirHastaFinal = async ({
  urlInicio,
  metodo = 'GET',
  cuerpo = null,
  urlReferer = null,
  jarras = {},
  maxSaltos = 12,
}) => {
  const traza = [];
  let url = urlInicio;
  let metodoActual = metodo;
  let cuerpoActual = cuerpo;
  let respuestaFinal = null;
  for (let salto = 0; salto < maxSaltos && url; salto += 1) {
    const destino = resolverUrl(url, urlReferer || HOST_SEGURIDAD);
    const dominio = new URL(destino).origin;
    const jarra = jarras[dominio] || (jarras[dominio] = []);
    const respuesta = await fetch(destino, {
      method: metodoActual,
      body: cuerpoActual,
      headers: {
        'User-Agent': UA_NAVEGADOR,
        // Accept de navegador: api-cpe rechaza connection sin apariencia web.
        Accept: metodoActual === 'POST' ? 'text/html,application/xhtml+xml' : 'text/html',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        Referer: urlReferer || undefined,
        Cookie: headerCookie(jarra) || '',
      },
      redirect: 'manual',
      timeout: 30000,
    });
    absorberCookies(jarra, respuesta);
    traza.push({ url: destino, status: respuesta.status });
    if (respuesta.status >= 300 && respuesta.status < 400) {
      const siguiente = respuesta.headers.get('location');
      url = siguiente ? resolverUrl(siguiente, destino) : null;
      // Tras la redireccion del POST el navegador hace GET (303; y 302 tras
      // POST se trata como GET en el flujo de login de SUNAT).
      if (metodoActual === 'POST') {
        metodoActual = 'GET';
        cuerpoActual = null;
      }
      continue;
    }
    respuestaFinal = respuesta;
    url = null;
  }
  return { respuestaFinal, traza };
};

const RE_JWT = /\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,})\b/;

const loginPortalUnaSesion = async ({ documentoId, sol, password, contexto }) => {
  const ruc = obtenerRuc(documentoId);
  const jarras = {};
  const state = `ix${Date.now()}`;
  const authenUrl =
    `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/authen` +
    `?redirect_uri=${encodeURIComponent(URI_RETORNO_PORTAL)}` +
    `&state=${state}&client_id=${CLIENTE_PORTAL_CONSULTACPE}&response_type=code`;

  // a) GET authen siguiendo su cadena de redirecciones hasta el formulario.
  const { respuestaFinal: respuestaAuthen, traza: trazaAuthen } = await seguirHastaFinal({
    urlInicio: authenUrl, jarras,
  });
  const htmlAuthen = respuestaAuthen ? await respuestaAuthen.text().catch(() => '') : '';
  if (!respuestaAuthen?.ok || !htmlAuthen.includes('LoginForm')) {
    registrar(contexto, 'portal', 'authen_no_formulario', {
      httpSunat: respuestaAuthen?.status ?? 'sin-respuesta',
      mensajeSunat: `La pagina de login no termino en el formulario. Trazas: ${JSON.stringify(trazaAuthen)}`,
    });
    throw Object.assign(
      new Error(`La pagina de login del portal SUNAT no respondio el formulario (traza: ${trazaAuthen.map(t => t.status).join('->')}).`),
      { statusCode: 502 }
    );
  }

  // b) POST j_security_check. La action del formulario es relativa; WebSphere
  // resuelve j_security_check a nivel del directorio de la pagina (oauth2/).
  // Se prueban las dos variantes por si SUNAT cambia el layout.
  const cuerpo = new URLSearchParams({
    tipo: '2',
    dni: '',
    custom_ruc: ruc,
    j_username: sol,
    j_password: password,
    captcha: '',
    originalUrl: '',
    state,
  });
  // Del formulario original, la Location tipo /oauth2/xxxxx/*varia; se cubren
  // las dos rutas posibles relativas a /oauth2 y a /oauth2/authen.
  const urlsPost = [
    `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/j_security_check`,
    `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/authen/j_security_check`,
  ];
  let envio = null;
  for (const urlPost of urlsPost) {
    const intento = await seguirHastaFinal({
      urlInicio: urlPost,
      metodo: 'POST',
      cuerpo,
      urlReferer: authenUrl,
      jarras,
    });
    const primer = intento.traza[0] || { status: 0 };
    // Si la ubicas (404) se intenta la siguiente variante.
    if (primer.status === 404) continue;
    envio = intento;
    break;
  }
  if (!envio) {
    registrar(contexto, 'portal', 'post_sin_ruta', { mensajeSunat: 'Ninguna ruta de j_security_check respondio.' });
    throw Object.assign(new Error('No se encontro la ruta de login del portal SUNAT.'), { statusCode: 502 });
  }

  // Detecta credenciales rechazadas: el resultado final vuelve al formulario
  // con el mensaje de error (status HTTP 200, pero con el mensaje visible).
  const htmlPost = envio.respuestaFinal ? await envio.respuestaFinal.text().catch(() => '') : '';
  const credRechazadas = htmlPost.includes('LoginForm')
    && /usuario|contras|invalido|incorrect/i.test(htmlPost);
  if (credRechazadas) {
    registrar(contexto, 'portal', 'login_rechazado', {
      mensajeSunat: 'El portal rechazo las credenciales enviadas.',
      httpSunat: envio.traza.map((t) => t.status).join('->'),
    });
    throw Object.assign(
      new Error('El portal SUNAT rechazo las credenciales de esta empresa (verifica usuario/clave SOL).'),
      { statusCode: 401 }
    );
  }
  if (!envio.respuestaFinal || !envio.respuestaFinal.ok) {
    registrar(contexto, 'portal', 'post_inesperado', {
      httpSunat: envio.traza.map((t) => t.status).join('->'),
      mensajeSunat: 'La cadena del POST j_security_check no retorno la pagina del portal.',
    });
    throw Object.assign(
      new Error(`Respuesta inesperada del login portal (traza: ${envio.traza.map((t) => t.status).join('->')}).`),
      { statusCode: 502 }
    );
  }

  const tokenHallado = RE_JWT.exec(htmlPost || '');
  if (!tokenHallado) {
    registrar(contexto, 'portal', 'token_no_inyectado', {
      mensajeSunat: 'El HTML final del portal no contiene el token (SUNAT.token).',
      bytes: htmlPost.length,
    });
    throw Object.assign(
      new Error('El portal SUNAT no entrego el token tras el login (revisar trafico).'),
      { statusCode: 502 }
    );
  }
  const token = tokenHallado[1];
  const jwt = decodificarJwt(token);
  registrar(contexto, 'portal', 'login_completo', {
    httpSunat: 200,
    loginPortal: limpiarTexto(jwt?.userdata?.login) || 'ok',
  });
  return token;
};

// Token CPE via login portal, con cache por empresa (margen 5 min) para
// no afectar el limite de logins en masa de SUNAT: 1 login portal por
// hora por empresa.
const obtenerTokenPortalCpe = async ({ idAnfitrion, documentoId, db, diagnostico }) => {
  const clave = `portal|${idAnfitrion}|${documentoId}`;
  const cacheado = PORTALES_EN_CACHE.get(clave);
  if (cacheado) {
    if (diagnostico) Object.assign(diagnostico, { viaPortal: true, tokenCache: true });
    return cacheado;
  }

  const credenciales = await obtenerCredencialesSire({ idAnfitrion, documentoId, db });
  const pares = paresPortal(credenciales);
  if (!pares.length) {
    throw Object.assign(new Error('No hay credenciales SOL completas para el login portal de esta empresa.'), { statusCode: 400 });
  }
  const contexto = { rucEmpresa: documentoId, scope: 'cpe-portal' };
  const errores = [];
  for (const par of pares) {
    try {
      const token = await loginPortalUnaSesion({ documentoId, sol: par.sol, password: par.password, contexto });
      const expiracion = decodificarJwt(token)?.exp;
      const msVigencia = expiracion ? Math.max(0, (expiracion - MARGEN_TOKEN_SEG) * 1000 - Date.now()) : 0;
      if (msVigencia > 0) setTimeout(() => PORTALES_EN_CACHE.delete(clave), msVigencia).unref();
      PORTALES_EN_CACHE.set(clave, token);
      if (diagnostico) Object.assign(diagnostico, { viaPortal: true, credencialPortal: par.par, tokenCache: false });
      console.log(`[SUNAT] token CPE obtenido via LOGIN PORTAL (credencial ${par.par}) para ${documentoId}`);
      return token;
    } catch (error) {
      errores.push(error.message);
    }
  }
  throw new Error(errores.join(' | ') || 'El login portal SUNAT no se concreto.');
};

module.exports = {
  CLIENTE_PORTAL_CONSULTACPE,
  obtenerTokenPortalCpe,
};
