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
// Por eso este modulo replica el login portal por HTTP puro:
//   a) GET authen (sesion JSESSIONID + state)
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

// Recolecta cookies de Set-Cookie y arma el header Cookie acumulado.
const absorberCookies = (jarra, respuesta) => {
  for (const c of respuesta.headers.raw()['set-cookie'] || []) jarra.push(c.split(';')[0]);
};
const headerCookie = (jarra) => (jarra.length ? jarra.join('; ') : undefined);

const RE_JWT = /\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,})\b/;

const loginPortalUnaSesion = async ({ documentoId, sol, password, contexto }) => {
  const ruc = obtenerRuc(documentoId);
  // Jarras de cookies: api-seguridad y e-factura son sesiones distintas.
  const cookiesSeguridad = [];
  const cookiesFactura = [];
  const authenUrl =
    `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/authen` +
    `?redirect_uri=${encodeURIComponent(URI_RETORNO_PORTAL)}` +
    `&state=ix${Date.now()}&client_id=${CLIENTE_PORTAL_CONSULTACPE}&response_type=code`;

  // a) GET authen: pagina de login + cookie de sesion.
  const respuestaAuthen = await fetch(authenUrl, {
    headers: { 'User-Agent': UA_NAVEGADOR, Accept: 'text/html' },
    redirect: 'manual',
    timeout: 30000,
  });
  absorberCookies(cookiesSeguridad, respuestaAuthen);
  const htmlAuthen = await respuestaAuthen.text();
  if (!respuestaAuthen.ok || !htmlAuthen.includes('LoginForm')) {
    registrar(contexto, 'portal', 'authen_no_formulario', {
      httpSunat: respuestaAuthen.status,
      mensajeSunat: 'La pagina de login del portal no devolvio el formulario esperado.',
    });
    throw Object.assign(new Error('La pagina de login del portal SUNAT no respondio el formulario.'), { statusCode: 502 });
  }

  // b) POST j_security_check. La action del formulario es relativa; WebSphere
  // resuelve j_security_check a nivel del directorio de la pagina (oauth2/).
  // Se prueban las dos variantes por si SUNAT cambia el layout.
  const subm = new URLSearchParams({
    tipo: '2',
    dni: '',
    custom_ruc: ruc,
    j_username: sol,
    j_password: password,
    captcha: '',
    originalUrl: '',
    state: `ix${Date.now()}`,
  });
  const urlsPost = [
    `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/j_security_check`,
    `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/authen/j_security_check`,
  ];
  let respuestaPost = null;
  for (const urlPost of urlsPost) {
    const intento = await fetch(urlPost, {
      method: 'POST',
      headers: {
        'User-Agent': UA_NAVEGADOR,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
        Referer: authenUrl,
        Cookie: headerCookie(cookiesSeguridad) || '',
      },
      body: subm,
      redirect: 'manual',
      timeout: 30000,
    });
    absorberCookies(cookiesSeguridad, intento);
    if (intento.status === 302 || intento.status === 303) { respuestaPost = intento; break; }
    // 200 con el formulario de nuevo = credenciales rechazadas con esta ruta;
    // 404 = ruta equivocada: probar la siguiente.
    if (intento.status === 404) continue;
    respuestaPost = intento;
    break;
  }
  if (!respuestaPost) {
    registrar(contexto, 'portal', 'post_sin_ruta', { mensajeSunat: 'Ninguna ruta de j_security_check respondio.' });
    throw Object.assign(new Error('No se encontro la ruta de login del portal SUNAT.'), { statusCode: 502 });
  }
  if (respuestaPost.status !== 302 && respuestaPost.status !== 303) {
    const texto = await respuestaPost.text().catch(() => '');
    const credRechazadas = /LoginForm|usuario|contrase/i.test(texto);
    registrar(contexto, 'portal', 'login_rechazado', {
      httpSunat: respuestaPost.status,
      mensajeSunat: credRechazadas ? 'El portal rechazo las credenciales enviadas.' : 'Respuesta inesperada del login portal.',
    });
    throw Object.assign(new Error(credRechazadas
      ? 'El portal SUNAT rechazo las credenciales de esta empresa (verifica usuario/clave SOL).'
      : `Respuesta inesperada del login portal (HTTP ${respuestaPost.status}).`), { statusCode: 401 });
  }

  // c) Seguir la cadena de redirecciones hasta el HTML final del portal,
  // llevando las cookies del dominio correspondiente en cada salto.
  let urlActual = respuestaPost.headers.get('location');
  let html = '';
  for (let salto = 0; salto < 12 && urlActual; salto += 1) {
  const destino = urlActual.startsWith('http') ? urlActual : `${new URL(urlActual, HOST_SEGURIDAD)}`;
  const esFactura = destino.includes('e-factura.sunat.gob.pe');
  const jarra = esFactura ? cookiesFactura : cookiesSeguridad;
  const saltoResp = await fetch(destino, {
      headers: {
        'User-Agent': UA_NAVEGADOR,
        Accept: 'text/html',
        Cookie: headerCookie(jarra) || '',
      },
      redirect: 'manual',
      timeout: 30000,
    });
    absorberCookies(jarra, saltoResp);
    if (saltoResp.status >= 300 && saltoResp.status < 400) {
      urlActual = saltoResp.headers.get('location');
      continue;
    }
    html = await saltoResp.text();
    urlActual = null;
  }

  const tokenHallado = RE_JWT.exec(html || '');
  if (!tokenHallado) {
    registrar(contexto, 'portal', 'token_no_inyectado', {
      mensajeSunat: 'El HTML final del portal no contiene el token (SUNAT.token).',
    });
    throw Object.assign(new Error('El portal SUNAT no entrego el token tras el login (revisar trafico).'), { statusCode: 502 });
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
