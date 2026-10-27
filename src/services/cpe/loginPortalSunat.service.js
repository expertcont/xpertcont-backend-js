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
//      "SUNAT.token"; el SPA solo lo LEE, nunca lo canjea). No se
//      requiere captcha en el primer intento (verificaFails esta
//      deshabilitado; el captcha solo aparece tras 3 fallos).
//   3) Con ese token, GET api-cpe.sunat.gob.pe/v1/contribuyente/
//      consultacpe/... responde 200 para el comprobante de cualquier
//      emisor (probado exitosamente con IP extranjera y comprobante
//      20295458551-01-FA03-174509-2).
//
// Estrategia (v3, tras el primer ensayo real en produccion):
//   a) GET authen siguiendo TODAS sus redirecciones (cookies por dominio).
//   b) POST j_security_check; si la Location trae ?code=... ANTES de
//      seguir la cadena se intenta el CANJE nosotros mismos contra el
//      endpoint de tokens (grant_type=authorization_token y
//      authorization_code; con y sin slash final). El canje por cadena
//      del BFF puede no entregar el token en la pagina final (el SPA no
//      tiene canje propio), asi que el canje directo es la via preferente.
//   c) Si el canje directo no funciona, se sigue la cadena completa y se
//      busca el JWT en el HTML final; si no aparece, la traza completa
//      (URLs y HTTP de cada salto) se registra para ajustar el flujo.
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

const resolverUrl = (url, base) => {
  if (url.startsWith('http')) return url;
  return new URL(url, base).toString();
};

// Sigue redirecciones manualmente acumulando Set-Cookie por DOMINIO
// (api-seguridad y e-factura tienen sesiones distintas).
const seguirHastaFinal = async ({ urlInicio, cuerpo = null, urlReferer = null, jarras = {}, maxSaltos = 12 }) => {
  const traza = [];
  let url = urlInicio;
  let metodoActual = cuerpo ? 'POST' : 'GET';
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
        Accept: 'text/html',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        Referer: urlReferer || undefined,
        Cookie: headerCookie(jarra) || '',
      },
      redirect: 'manual',
      timeout: 30000,
    });
    absorberCookies(jarra, respuesta);
    traza.push({ url: destino.slice(0, 160), status: respuesta.status });
    if (respuesta.status >= 300 && respuesta.status < 400) {
      const siguiente = respuesta.headers.get('location');
      url = siguiente ? resolverUrl(siguiente, destino) : null;
      // Tras la redireccion del POST el navegador hace GET.
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

// Canje directo del authorization-code (que SUNAT entrega como JWT en la
// URL de aterrizaje) contra el endpoint de tokens de SUNAT (el iss del
// JWT del portal apunta aca). El hallazgo de produccion (oct 2026) es que
// SUNAT redirige a SU PROPIA RAIZ (api-seguridad.sunat.gob.pe/?state=..&code=..)
// e ignora el redirect_uri solicitado, asi que el canje se prueba con
// TODAS las combinaciones: grant authorization_token/authorization_code
// (SUNAT usa nombres propios; el JWT real declaraba "authorization_token"),
// con/sin slash final del endpoint y las dos uri de retorno plausibles.
// Cada intento queda logueado con el cuerpo de error de SUNAT para afinar.
const canjearCodePortal = async ({ code, contexto }) => {
  const urlTokenBase = `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/token`;
  const urisRetorno = [HOST_SEGURIDAD + '/', URI_RETORNO_PORTAL];
  const intentos = [];
  for (const sufijo of ['', '/']) {
    for (const grant of ['authorization_token', 'authorization_code']) {
      for (const redirect_uri of urisRetorno) {
        const urlToken = urlTokenBase + sufijo;
        try {
          const respuesta = await fetch(urlToken, {
            method: 'POST',
            headers: {
              'User-Agent': UA_NAVEGADOR,
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: new URLSearchParams({
              grant_type: grant,
              code,
              redirect_uri,
              client_id: CLIENTE_PORTAL_CONSULTACPE,
            }),
            redirect: 'manual',
            timeout: 30000,
          });
          const data = await respuesta.json().catch(() => null);
          const cuerpo = data ? JSON.stringify(data).slice(0, 200) : '';
          const etiqueta = `${grant}${sufijo ? '/' : ''} uri=${new URL(redirect_uri).host}`;
          intentos.push(`${etiqueta}: HTTP ${respuesta.status}${cuerpo ? ` ${cuerpo}` : ''}`);
          registrar(contexto, 'portal', 'canje_intento', {
            httpSunat: respuesta.status,
            mensajeSunat: `${etiqueta} | sunat: ${cuerpo || '(sin cuerpo)'}`,
          });
          if (respuesta.ok && data?.access_token) return { token: data.access_token, via: etiqueta };
        } catch (error) {
          intentos.push(`${grant}${sufijo}: ${error.message}`);
        }
      }
    }
  }
  registrar(contexto, 'portal', 'canje_fallo', { mensajeSunat: intentos.join(' | ').slice(0, 300) });
  return null;
};

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
    const trail = trazaAuthen.map((t) => t.status).join('->') || 'sin-traza';
    registrar(contexto, 'portal', 'authen_no_formulario', {
      httpSunat: respuestaAuthen?.status ?? 'sin-respuesta',
      mensajeSunat: `Trazas: ${JSON.stringify(trazaAuthen).slice(0, 400)}`,
    });
    throw Object.assign(
      new Error(`La pagina de login del portal SUNAT no respondio el formulario (traza: ${trail}).`),
      { statusCode: 502 }
    );
  }

  // b) POST j_security_check (manual, sin seguir por defecto para poder
  // capturar el code de la primera Location antes de gastarlo).
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
  const urlsPost = [
    `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/j_security_check`,
    `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/authen/j_security_check`,
  ];
  let primerPost = null;
  for (const urlPost of urlsPost) {
    const respuesta = await fetch(urlPost, {
      method: 'POST',
      headers: {
        'User-Agent': UA_NAVEGADOR,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        Referer: authenUrl,
        Cookie: headerCookie(jarras[HOST_SEGURIDAD] || (jarras[HOST_SEGURIDAD] = [])) || '',
      },
      body: cuerpo,
      redirect: 'manual',
      timeout: 30000,
    });
    absorberCookies(jarras[HOST_SEGURIDAD], respuesta);
    if (respuesta.status === 404) continue;
    primerPost = { respuesta, urlPost };
    break;
  }
  if (!primerPost) {
    registrar(contexto, 'portal', 'post_sin_ruta', { mensajeSunat: 'Ninguna ruta de j_security_check respondio.' });
    throw Object.assign(new Error('No se encontro la ruta de login del portal SUNAT.'), { statusCode: 502 });
  }

  const { respuesta: respuestaPost, urlPost: urlPostUsada } = primerPost;
  const statusPost = respuestaPost.status;
  const locationPost = respuestaPost.headers.get('location') || '';

  // Credenciales rechazadas: vuelve al formulario (200) con mensaje de error.
  if (statusPost !== 302 && statusPost !== 303) {
    const texto = await respuestaPost.text().catch(() => '');
    const credRechazadas = texto.includes('LoginForm') && /usuario|contrase|invalido|incorrect/i.test(texto);
    registrar(contexto, 'portal', 'login_rechazado', {
      httpSunat: statusPost,
      mensajeSunat: credRechazadas
        ? 'El portal rechazo las credenciales enviadas.'
        : `POST ${urlPostUsada.slice(0, 120)} respondio ${statusPost}.`,
    });
    throw Object.assign(
      new Error(credRechazadas
        ? 'El portal SUNAT rechazo las credenciales de esta empresa (verifica usuario/clave SOL).'
        : `Respuesta inesperada del login portal (HTTP ${statusPost}.).`),
      { statusCode: credRechazadas ? 401 : 502 }
    );
  }

  // b2) Canje DIRECTO preferente: si la Location trae el code.
  const hallazgoCode = /[?&]code=([^&]+)/.exec(locationPost);
  if (hallazgoCode) {
    const code = decodeURIComponent(hallazgoCode[1]);
    const canje = await canjearCodePortal({ code, contexto });
    if (canje?.token) {
      registrar(contexto, 'portal', 'login_completo', { httpSunat: 200, mensajeSunat: `canje directo via ${canje.via}` });
      return canje.token;
    }
  } else {
    registrar(contexto, 'portal', 'sin_code_inmediato', {
      mensajeSunat: `Location del POST: ${locationPost.slice(0, 200) || '(vacia)'}`,
    });
  }

  // c) Fallback: seguir la cadena completa y buscar el JWT en el HTML final.
  const { respuestaFinal, traza } = await seguirHastaFinal({
    urlInicio: locationPost || authenUrl,
    urlReferer: authenUrl,
    jarras,
  });
  const htmlFinal = respuestaFinal ? await respuestaFinal.text().catch(() => '') : '';
  const tokenHallado = RE_JWT.exec(htmlFinal || '');
  if (tokenHallado) {
    const token = tokenHallado[1];
    const jwt = decodificarJwt(token);
    registrar(contexto, 'portal', 'login_completo', {
      httpSunat: 200,
      mensajeSunat: 'token inyectado en el HTML final',
      loginPortal: limpiarTexto(jwt?.userdata?.login) || 'ok',
    });
    return token;
  }

  registrar(contexto, 'portal', 'token_no_inyectado', {
    httpSunat: respuestaFinal?.status ?? 'sin-respuesta',
    bytes: htmlFinal.length,
    mensajeSunat: `Trazas: ${JSON.stringify(traza).slice(0, 500)} | HTML inicio: ${htmlFinal.slice(0, 250).replace(/\s+/g, ' ')}`,
  });
  throw Object.assign(
    new Error(`El portal SUNAT no entrego el token tras el login (traza: ${traza.map((t) => t.status).join('->')}; html ${htmlFinal.length} bytes).`),
    { statusCode: 502 }
  );
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
  // Via primaria: navegador real (Playwright), el MISMO login del portal.
  // Via de respaldo: replicacion HTTP pura del login portal.
  const metodos = [];
  try {
    const { loginPortalPlaywrightCpe } = require('./loginPortalPlaywright.service');
    metodos.push({ nombre: 'playwright', invocar: (par) =>
      loginPortalPlaywrightCpe({ documentoId, sol: par.sol, password: par.password, contexto }) });
  } catch (error) {
    // require dentro de try aunque el modulo es internamente tolerante:
    // cualquier problema de carga de playwright cae al metodo HTTP.
  }
  metodos.push({ nombre: 'http', invocar: (par) =>
    loginPortalUnaSesion({ documentoId, sol: par.sol, password: par.password, contexto }) });

  for (const par of pares) {
    for (const metodo of metodos) {
      try {
        const token = await metodo.invocar(par);
        const expiracion = decodificarJwt(token)?.exp;
        const msVigencia = expiracion ? Math.max(0, (expiracion - MARGEN_TOKEN_SEG) * 1000 - Date.now()) : 0;
        if (msVigencia > 0) setTimeout(() => PORTALES_EN_CACHE.delete(clave), msVigencia).unref();
        PORTALES_EN_CACHE.set(clave, token);
        if (diagnostico) Object.assign(diagnostico, { viaPortal: true, viaPortalMetodo: metodo.nombre, credencialPortal: par.par, tokenCache: false });
        console.log(`[SUNAT] token CPE obtenido via LOGIN PORTAL (${metodo.nombre}, credencial ${par.par}) para ${documentoId}`);
        return token;
      } catch (error) {
        errores.push(`[${metodo.nombre}] ${error.message}`);
      }
    }
  }
  throw new Error(errores.join(' | ') || 'El login portal SUNAT no se concreto.');
};

module.exports = {
  CLIENTE_PORTAL_CONSULTACPE,
  HOST_SEGURIDAD,
  URI_RETORNO_PORTAL,
  canjearCodePortal,
  obtenerTokenPortalCpe,
};
