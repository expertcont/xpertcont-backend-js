// ------------------------------------------------------------------
// Obtencion del token CPE via LOGIN PORTAL con navegador (Playwright).
//
// Hallazgos verificados contra SUNAT (oct 2026, ver traza de pruebas):
//   1) El SPA de consulta CPE (e-factura .../nuevaconsulta/1.0.0/) es un
//      shell estatico: NO redirige al login, NO canjea ningun ?code y
//      solo LEE sessionStorage("SUNAT.token") (ningun chunk llama
//      setItem). Por tanto NO sirve como punto de partida ni como
//      callback: el token real lo inyecta el menun del portal tras su
//      propio canje.
//   2) La pagina de login del portal es standalone y sirve igual sin
//      sesion previa (verificado: GET authen devuelve 200 con el
//      formulario, ~28 KB, "SUNAT - Menu SOL"). AHI arranca este login.
//   3) El endpoint de tokens existe y valida parametros (POST con code
//      ficticio responde 400 invalid_request), asi que tras el login se
//      intenta el CANJE DIRECTO del code real:
//        POST api-seguridad/v1/clientessol/{client_id}/oauth2/token/
//        grant_type=authorization_token | authorization_code
//        con y sin slash final (SUNAT usa nombres propios no
//        documentados; el JWT real declaraba "authorization_token").
//
// Flujo: abrir AUTHEN -> elegir pestana RUC -> credenciales -> enviar;
// luego se espera el token en sessionStorage y, si llega primero una URL
// con ?code=..., se extrae y se canjea directo desde Node.
//
// Requisito de despliegue (Railway): la imagen necesita el navegador.
//   build: npm install && npx playwright install --with-deps chromium
// Si Playwright no esta disponible, obtenerTokenPortalCpe recurre al
// metodo HTTP puro (loginPortalSunat.service.js) y loguea el motivo.
// ------------------------------------------------------------------

const { registrar } = require('./diagnosticoSunat');

const CLIENTE_PORTAL_CONSULTACPE = 'cd8e7afb-a0e2-4217-9187-88206e4ba7af';
const HOST_SEGURIDAD = 'https://api-seguridad.sunat.gob.pe';
const URI_RETORNO_PORTAL =
  'https://e-factura.sunat.gob.pe/app/contribuyentems/servicio/consultacpe/consulta/nuevaconsulta/1.0.0/';

const limpiarTexto = (value = '') => String(value ?? '').trim();

const urlAutenticacion = (state) => {
  const uriRetorno = URI_RETORNO_PORTAL;
  return `${HOST_SEGURIDAD}/v1/clientessol/${CLIENTE_PORTAL_CONSULTACPE}/oauth2/authen`
    + `?redirect_uri=${encodeURIComponent(uriRetorno)}`
    + `&state=${state}&client_id=${CLIENTE_PORTAL_CONSULTACPE}&response_type=code`;
};

const loginPortalPlaywrightCpe = async ({ documentoId, sol, password, contexto }) => {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (error) {
    registrar(contexto, 'portal', 'playwright_ausente', {
      mensajeSunat: 'La dependencia playwright no esta instalada (npm install / npx playwright install chromium).',
    });
    throw Object.assign(
      new Error('Playwright no esta instalado en el servidor (instala playwright + chromium).'),
      { statusCode: 501 }
    );
  }

  let navegador;
  try {
    navegador = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
    pagina.setDefaultTimeout(45000);

    // 1) IR DIRECTO al formulario de login (no al shell del SPA, que no
    //    redirige a ninguna parte sin token).
    await pagina.goto(urlAutenticacion(`ix${Date.now()}`), { waitUntil: 'domcontentloaded' });
    await pagina.waitForSelector('#txtRuc', { state: 'visible', timeout: 30000 });
    // pestana de login por RUC (el default del formulario es DNI)
    const pestanaRuc = await pagina.$('#btnPorRuc');
    if (pestanaRuc) {
      const visible = await pestanaRuc.isVisible().catch(() => false);
      if (visible) await pestanaRuc.click().catch(() => {});
      await pagina.waitForSelector('#txtRuc', { state: 'visible', timeout: 10000 });
    }
    registrar(contexto, 'portal', 'playwright_formulario_listo', { mensajeSunat: 'Formulario de login del portal listo.' });

    // 2) credenciales y envio
    await pagina.fill('#txtRuc', limpiarTexto(documentoId).replace(/\D/g, ''));
    await pagina.fill('#txtUsuario', limpiarTexto(sol));
    await pagina.fill('#txtContrasena', limpiarTexto(password));
    await pagina.click('#btnAceptar');

    // 3) sondear el resultado: token en sessionStorage O aterrizaje con
    //    ?code= (para el canje directo O un mensaje de error visible.
    let tokenApi = '';
    let urlAterrizaje = '';
    for (let i = 0; i < 90; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      tokenApi = await pagina.evaluate(() => sessionStorage.getItem('SUNAT.token') || '').catch(() => '');
      if (tokenApi) break;
      urlAterrizaje = pagina.url();
      if (/[?&]code=/.test(urlAterrizaje)) break;
    }

    if (tokenApi) {
      registrar(contexto, 'portal', 'playwright_login_completo', { httpSunat: 200, mensajeSunat: 'token inyectado en sessionStorage del mismo navegador.' });
      return tokenApi;
    }

    // 4) CANJE DIRECTO con el code real que SUNAT devuelve en la URL.
    const hallazgoCode = /[?&]code=([^&]+)/.exec(urlAterrizaje || '');
    if (hallazgoCode) {
      const code = decodeURIComponent(hallazgoCode[1]);
      registrar(contexto, 'portal', 'playwright_code_recibido', { mensajeSunat: `code presente en la URL de aterrizaje: ${urlAterrizaje.slice(0, 200)}` });
      const { canjearCodePortal } = require('./loginPortalSunat.service');
      const canje = await canjearCodePortal({ code, contexto });
      if (canje?.token) {
        registrar(contexto, 'portal', 'playwright_login_completo', { httpSunat: 200, mensajeSunat: `canje directo exitoso via ${canje.via}` });
        return canje.token;
      }
    }

    const textoPagina = await pagina.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400));
    registrar(contexto, 'portal', 'playwright_sin_token', {
      mensajeSunat: `url final: ${(urlAterrizaje || pagina.url()).slice(0, 200)} | pagina: ${textoPagina}`,
    });
    const captchaRequerido = /captcha|valor que aparece/i.test(textoPagina);
    throw Object.assign(
      new Error(captchaRequerido
        ? 'El portal SUNAT pidio captcha para esta empresa (esperar unos minutos o revisar el portal manualmente).'
        : `El portal SUNAT no entrego el token por el navegador (final: ${(urlAterrizaje || pagina.url()).slice(0, 120)}).`),
      { statusCode: captchaRequerido ? 423 : 502 }
    );
  } finally {
    if (navegador) await navegador.close().catch(() => {});
  }
};

module.exports = { loginPortalPlaywrightCpe, CLIENTE_PORTAL_CONSULTACPE, URI_RETORNO_PORTAL };
