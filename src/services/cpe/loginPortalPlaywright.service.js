// ------------------------------------------------------------------
// Obtencion del token CPE via LOGIN PORTAL con navegador (Playwright).
//
// Via primaria para empresas cuya aplicacion SUNAT no declara el recurso
// /v1/contribuyente/consultacpe: el portal "Consulta de comprobantes"
// (e-factura) usa la app interna de SUNAT (client_id cd8e7afb-...) que SI
// lo declara para cualquier usuario SOL. Este modulo hace el MISMO login
// que hace el usuario en el portal, con un navegador real:
//   1) abrir la URL del portal -> redirecciona al login de SUNAT
//      (api-seguridad .../oauth2/authen, formulario #txtRuc/#txtUsuario/
//      #txtContrasena y boton #btnAceptar)
//   2) elegir la pestana de login por RUC (boton #btnPorRuc), llenar los
//      campos y enviar (el login del portal NO exige captcha en el
//      primer intento; el desafio solo aparece tras 3 fallos en la
//      misma sesion)
//   3) esperar el retorno al portal y leer el token que SUNAT entrega
//      en sessionStorage("SUNAT.token") (se lo inyecta su servidor al
//      canjear el authorization-code; el SPA solo lo lee)
//
// Requisito de despliegue (Railway): la imagen necesita el navegador.
//   comando de build: npm install && npx playwright install --with-deps chromium
// Si Playwright no esta disponible, obtenerTokenPortalCpe recurre al
// metodo HTTP puro (loginPortalSunat.service.js) y loguea el motivo.
// ------------------------------------------------------------------

const { registrar } = require('./diagnosticoSunat');

const URI_RETORNO_PORTAL =
  'https://e-factura.sunat.gob.pe/app/contribuyentems/servicio/consultacpe/consulta/nuevaconsulta/1.0.0/';

const limpiarTexto = (value = '') => String(value ?? '').trim();

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
    // timeout global del login portal (SUNAT puede tardar en el canje)
    pagina.setDefaultTimeout(60000);

    // 1) abrir el portal; SUNAT redirige al formulario de login.
    await pagina.goto(URI_RETORNO_PORTAL, { waitUntil: 'domcontentloaded' });
    try {
      await pagina.waitForSelector('#txtRuc:not([hidden])', { state: 'visible', timeout: 30000 });
    } catch {
      // si llego a un formulario sin pestana RUC visible, intentar clic en la pestana
      const botonRuc = await pagina.$('#btnPorRuc');
      if (botonRuc) await botonRuc.click().catch(() => {});
      await pagina.waitForSelector('#txtRuc', { state: 'visible', timeout: 15000 });
    }
    // pestana de login por RUC (el default del formulario es DNI)
    const pestanaRuc = await pagina.$('#btnPorRuc');
    if (pestanaRuc) {
      const visible = await pestanaRuc.isVisible().catch(() => false);
      if (visible) await pestanaRuc.click().catch(() => {});
    }
    registrar(contexto, 'portal', 'playwright_formulario_listo', { mensajeSunat: 'Formulario del portal listo.' });

    // 2) credenciales y envio
    await pagina.fill('#txtRuc', limpiarTexto(documentoId).replace(/\D/g, ''));
    await pagina.fill('#txtUsuario', limpiarTexto(sol));
    await pagina.fill('#txtContrasena', limpiarTexto(password));
    await pagina.click('#btnAceptar');

    // 3) esperar el token en sessionStorage (o un error visible del formulario)
    await pagina.waitForFunction(() => {
      const token = sessionStorage.getItem('SUNAT.token');
      if (token) return true;
      const alertas = Array.from(document.querySelectorAll('.alert, [class*="alert"], [class*="mensaje"]'))
        .filter((n) => n && n.offsetParent !== null && (n.textContent || '').trim().length > 3);
      return alertas.length > 0;
    }, { timeout: 60000, polling: 300 });

    const token = await pagina.evaluate(() => sessionStorage.getItem('SUNAT.token') || '');
    if (token) {
      registrar(contexto, 'portal', 'playwright_login_completo', { httpSunat: 200 });
      return token;
    }
    const textoError = await pagina.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300));
    registrar(contexto, 'portal', 'playwright_login_rechazado', { mensajeSunat: textoError });
    const captchaRequerido = /captcha|valor que aparece/i.test(textoError);
    throw Object.assign(
      new Error(captchaRequerido
        ? 'El portal SUNAT pidio captcha para esta empresa (esperar unos minutos o revisar el portal manualmente).'
        : `El portal SUNAT rechazo el login: ${textoError || 'sin mensaje visible'}.`),
      { statusCode: captchaRequerido ? 423 : 401 }
    );
  } finally {
    if (navegador) await navegador.close().catch(() => {});
  }
};

module.exports = { loginPortalPlaywrightCpe, URI_RETORNO_PORTAL };
