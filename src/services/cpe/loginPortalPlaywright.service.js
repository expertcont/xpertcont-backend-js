// ------------------------------------------------------------------
// Obtencion del token CPE via LOGIN PORTAL con navegador (Playwright).
//
// Descubrimientos verificados contra SUNAT (oct 2026):
//   1) El SPA de consulta CPE (e-factura app/contribuyentems) es un shell
//      estatico: no redirige al login, no canjea ningun ?code y solo LEE
//      sessionStorage("SUNAT.token"). El portal real NO arranca ahi.
//   2) El portal SOL real es e-menu.sunat.gob.pe/cl-ti-itmenu/
//      MenuInternet.htm: su stub redirige al login de opciones
//      (api-seguridad, client del MENU 4f3b88b3-...) con un state que es
//      un objeto Java serializado base64 que trae params/exe de la
//      sesion; el callback del menu es AutenticaMenuInternet.htm y el
//      login establece sesion F5/SSO en los dominios sunat.gob.pe.
//   3) Desde esa sesion el usuario abre "consulta de comprobantes"
//      (app/contribuyentems) y el token con consultacpe llega al
//      sessionStorage por la injecion del portal. Aqui lo CAPTURAMOS
//      escuchando la red (token en respuesta) y leyendo sessionStorage.
//   4) j_security_check con 'originalUrl' en el body ejecuta un FORWARD
//      directo a la app (verificado con credenciales reales); por eso el
//      login del portal escribe ese campo oculto (url2Fields copia la
//      query al formulario).
//
// Requisito de despliegue (Railway): la imagen necesita el navegador.
//   build: npm install && npx playwright install --with-deps chromium
// Si Playwright no esta disponible, obtenerTokenPortalCpe recurre al
// metodo HTTP puro (loginPortalSunat.service.js) y loguea el motivo.
// ------------------------------------------------------------------

const { registrar } = require('./diagnosticoSunat');

const MENU_PORTAL_SOL = 'https://e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm';
const URI_APP_CONSULTACPE =
  'https://e-factura.sunat.gob.pe/app/contribuyentems/servicio/consultacpe/consulta/nuevaconsulta/1.0.0/';

const limpiarTexto = (value = '') => String(value ?? '').trim();

// Escucha la red de una pagina: registra peticiones SUNAT (excluye ruido
// Dynatrace/estaticos) y captura el token si viaja en alguna respuesta.
const instrumentar = (pagina, contexto) => {
  const urlsVistas = new Set();
  let tokenDeRed = '';
  const esRuido = (u) => /ruxitagentjs|\/rb_|beacon|\.css|\.ico|\.svg|\.png|\.jpg|\.woff|dominio\.txt/.test(u);
  pagina.on('request', (solicitud) => {
    const u = solicitud.url();
    if (esRuido(u) || !/(sunat\.gob\.pe)/.test(u)) return;
    urlsVistas.add(`${solicitud.method()} ${u.split('?')[0]}`);
  });
  pagina.on('response', async (respuesta) => {
    const u = respuesta.url();
    if (esRuido(u) || !/(sunat\.gob\.pe)/.test(u) || tokenDeRed) return;
    try {
      if (![200, 201].includes(respuesta.status())) return;
      const cuerpo = await respuesta.text().catch(() => '');
      if (!cuerpo || cuerpo.length > 400000) return;
      if (/\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,})/.test(cuerpo)) {
        tokenDeRed = /\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,})/.exec(cuerpo)[1];
        registrar(contexto, 'portal', 'playwright_token_en_red', {
          httpSunat: respuesta.status(),
          mensajeSunat: `token capturado desde la respuesta de: ${u.split('?')[0].slice(0, 180)}`,
        });
      } else if (/token|seguridad|olog|cashm|authen/i.test(u) && urlsVistas.size < 40) {
        registrar(contexto, 'portal', 'playwright_red', {
          httpSunat: `${respuesta.status()} ${respuesta.request().method()}`,
          mensajeSunat: `${u.slice(0, 200)} | resp: ${cuerpo.slice(0, 160).replace(/\s+/g, ' ')}`,
        });
      }
    } catch { /* respuesta consumida o vacia: ignorar */ }
  });
  return { urlsVistas, verTokenDeRed: () => tokenDeRed };
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
    const contextoNavegador = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
    let pagina = await contextoNavegador.newPage();
    pagina.setDefaultTimeout(45000);
    const sesion = instrumentar(pagina, contexto);
    // popups (el menu suele abrir la app de consulta en ventana nueva)
    contextoNavegador.on('page', (nueva) => {
      pagina = nueva;
      nueva.setDefaultTimeout(45000);
      Object.assign(sesion, instrumentar(nueva, contexto));
    });

    // 1) entrar al PORTAL REAL (stub -> authen menu -> formulario)
    await pagina.goto(MENU_PORTAL_SOL, { waitUntil: 'domcontentloaded' });
    try {
      await pagina.waitForSelector('#txtRuc', { state: 'visible', timeout: 30000 });
    } catch {
      // el stub hace $.ajax HEAD y luego location.href: reintentar carga
      await pagina.goto(MENU_PORTAL_SOL, { waitUntil: 'load' });
      await pagina.waitForSelector('#txtRuc', { state: 'visible', timeout: 30000 });
    }
    // los botones arrancan en RUC activo; asegurar por si aca
    const pestanaRuc = await pagina.$('#btnPorRuc');
    if (pestanaRuc) {
      const visible = await pestanaRuc.isVisible().catch(() => false);
      if (visible) await pestanaRuc.click().catch(() => {});
      await pagina.waitForSelector('#txtRuc', { state: 'visible', timeout: 10000 });
    }
    registrar(contexto, 'portal', 'playwright_formulario_listo', { mensajeSunat: 'Formulario de login del portal SOL listo.' });

    // 2) credenciales y envio (mismo submit que hace el usuario)
    await pagina.fill('#txtRuc', limpiarTexto(documentoId).replace(/\D/g, ''));
    await pagina.fill('#txtUsuario', limpiarTexto(sol));
    await pagina.fill('#txtContrasena', limpiarTexto(password));
    await (await pagina.$('#btnAceptar')).click();

    // 3) SONDEO: token en la pagina (sessionStorage) o en la red; en
    //    paralelo, cuando aparece la interfaz del menu, abrir la app de
    //    consulta CPE (link del catalogo o acceso directo a la SPA con
    //    la sesion SSO ya viva).
    let tokenApi = '';
    let appAbierta = false;
    for (let i = 0; i < 120; i += 1) {
      await new Promise((r) => setTimeout(r, 600));
      tokenApi = await pagina.evaluate(() => sessionStorage.getItem('SUNAT.token') || '').catch(() => '');
      if (tokenApi) break;
      const capturo = sesion.verTokenDeRed();
      if (capturo) break;

      const url = pagina.url();
      const conFormulario = await pagina.evaluate(() => Boolean(document.querySelector('#txtContrasena, #txtRuc'))).catch(() => true);
      const enMenu = /e-menu\.sunat\.gob\.pe/.test(url) && !conFormulario;
      if (enMenu && !appAbierta && i > 6) {
        appAbierta = true;
        const linkApp = await pagina.$('a[href*="contribuyentems"]');
        if (linkApp) {
          registrar(contexto, 'portal', 'playwright_menu_app', { mensajeSunat: 'link de la app en el catalogo; abriendo..' });
          await Promise.race([
            linkApp.click().then(() => pagina.waitForLoadState('domcontentloaded').catch(() => {})),
            new Promise((r) => setTimeout(r, 8000)),
          ]);
        } else {
          registrar(contexto, 'portal', 'playwright_menu_sin_link', { mensajeSunat: 'catalogo sin link directo; abriendo la app con la sesion SSO.' });
          await pagina.goto(URI_APP_CONSULTACPE, { waitUntil: 'domcontentloaded' }).catch(() => {});
        }
      }

      // Congestion de SUNAT: mensaje propio del portal
      if (i % 4 === 3) {
        const texto = await pagina.evaluate(() => (document.body?.innerText || '').slice(0, 200)).catch(() => '');
        if (/no se puede acceder/i.test(texto)) {
          registrar(contexto, 'portal', 'playwright_error_portal', { mensajeSunat: texto });
          throw Object.assign(
            new Error('SUNAT esta congestionado (el portal no esta entregando sesiones ahora). Reintenta en unos 5 minutos.'),
            { statusCode: 503 }
          );
        }
      }
    }

    const tokenFinal = tokenApi || sesion.verTokenDeRed();
    if (tokenFinal) {
      registrar(contexto, 'portal', 'playwright_login_completo', { httpSunat: 200, mensajeSunat: 'token del portal capturado en el navegador.' });
      return tokenFinal;
    }
    if (sesion.urlsVistas.size) {
      registrar(contexto, 'portal', 'playwright_trafico', { mensajeSunat: [...sesion.urlsVistas].join(' | ').slice(0, 1400) });
    }
    const textoPagina = await pagina.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400));
    registrar(contexto, 'portal', 'playwright_sin_token', {
      mensajeSunat: `url final: ${(pagina.url() || '').slice(0, 200)} | pagina: ${textoPagina}`,
    });
    const captchaRequerido = /captcha|valor que aparece/i.test(textoPagina);
    throw Object.assign(
      new Error(captchaRequerido
        ? 'El portal SUNAT pidio captcha para esta empresa (esperar unos minutos o revisar el portal manualmente).'
        : `El portal SUNAT no entrego el token por el navegador (final: ${(pagina.url() || '').slice(0, 120)}).`),
      { statusCode: captchaRequerido ? 423 : 502 }
    );
  } finally {
    if (navegador) await navegador.close().catch(() => {});
  }
};

module.exports = { loginPortalPlaywrightCpe, MENU_PORTAL_SOL, URI_APP_CONSULTACPE };
