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
    // Registrar la apertura del navegador: si los binarios de Chromium no
    // estan en la imagen (paso "npx playwright install" del build), launch
    // truena aqui y ANTES moria en silencio, dejando el log sin ningun
    // evento playwright_* y ocultando la causa real.
    // SUNAT corta la conexion del Chrome headless (ERR_CONNECTION_RESET
    // verificado local y produccion: ni headless-shell ni el headless nuevo
    // pasan; solo navegador real). Regla: PLAYWRIGHT_HEADLESS=1 fuerza
    // headless; 0 fuerza navegador real; sin la variable se auto-detecta
    // pantalla (Linux con DISPLAY via xvfb-run, o Windows local).
    const pantallaDisponible = process.platform === 'win32' || Boolean(process.env.DISPLAY);
    const modoReal = process.env.PLAYWRIGHT_HEADLESS !== '1' && pantallaDisponible
      || process.env.PLAYWRIGHT_HEADLESS === '0';
    navegador = await chromium.launch({ headless: !modoReal, args: ['--no-sandbox'] }).catch((error) => {
      registrar(contexto, 'portal', 'playwright_lanzador_fallo', {
        mensajeSunat: String(error?.message || error).replace(/\s+/g, ' ').slice(0, 300),
      });
      throw Object.assign(new Error(`El navegador de Playwright no pudo arrancar en el servidor: ${String(error?.message || error).slice(0, 160)}`), { statusCode: 501 });
    });
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

    // Ruta legada de la app de consulta: cuando el catalogo dispara el
    // item, la peticion a ww1.sunat.gob.pe/ol-ti-itconscpemype/consultar.do
    // lleva hc + token (UserBean serializado) CON la autorizacion viva en la
    // query. Se captura para poder navegarla en pestaña propia si el popup
    // no entrega el token (navegable directo, a diferencia del iconExecute).
    let urlLegada = '';
    contextoNavegador.on('request', (solicitud) => {
      const u = solicitud.url();
      if (!urlLegada && /ww1\.sunat\.gob\.pe\/ol-ti-itconscpemype\/consultar\.do/.test(u)) urlLegada = u;
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

    // 3) SONDEO: token en la pagina (sessionStorage), en los FRAMES de la
    //    app (el menu abre las apps en iframe cross-origin; Playwright lee
    //    el sessionStorage de cualquier frame) o en la red. Cuando el
    //    catalogo del menu aparece, abrir la app de consulta CPE con su
    //    mecanismo real: los links del menu no son <a href>, son
    //    ejecuta('MenuInternet.htm?action=iconExecute&code=X.Y.Z.W')
    //    (dossier de crafter-research/sunat-cli, 2026).
    let tokenApi = '';
    let tokenFrame = '';
    let appAbierta = false;
    let ideaUrlLegada = false;
    // El menu abre las apps en POPUP o IFRAME cross-origin: se escanea el
    // sessionStorage de TODAS las paginas y frames del contexto (Playwright
    // cruza origenes), no solo la pagina "activa" (en la corrida de prueba
    // el frame de la SPA quedo en un popup y se perdio).
    const leerTokenDeTodo = async () => {
      for (const paginaP of contextoNavegador.pages()) {
        const t = await paginaP.evaluate(() => sessionStorage.getItem('SUNAT.token') || '').catch(() => '');
        if (t) return { token: t, url: paginaP.url() };
        for (const marco of paginaP.frames()) {
          const tf = await marco.evaluate(() => sessionStorage.getItem('SUNAT.token') || '').catch(() => '');
          if (tf) return { token: tf, url: marco.url() };
        }
      }
      return null;
    };
    for (let i = 0; i < 120; i += 1) {
      await new Promise((r) => setTimeout(r, 600));
      const hallado = await leerTokenDeTodo();
      if (hallado) {
        tokenFrame = hallado.token;
        registrar(contexto, 'portal', 'playwright_token_frame', { mensajeSunat: `token en el frame: ${hallado.url.slice(0, 150)}` });
        break;
      }
      tokenApi = await pagina.evaluate(() => sessionStorage.getItem('SUNAT.token') || '').catch(() => '');
      if (tokenApi) break;
      const capturo = sesion.verTokenDeRed();
      if (capturo) break;

      const url = pagina.url();
      const conFormulario = await pagina.evaluate(() => Boolean(document.querySelector('#txtContrasena, #txtRuc'))).catch(() => true);
      const enMenu = /e-menu\.sunat\.gob\.pe/.test(url) && !conFormulario;
      if (enMenu && !appAbierta && i > 6) {
        appAbierta = true;
        // ARBOL PRINCIPAL (ids reales del portal, expuestos por el buscador
        // "Busque una opcion del menu"):
        //   nivel1_11            Comprobantes de pago
        //   nivel2_11_38         Comprobantes de Pago
        //   nivel3_11_38_1       Consulta de Comprobantes de Pago
        //   nivel4_11_38_1_1_1   Nueva Consulta de comprobantes de pago <- SPA
        // La hoja lleva el anchor ejecuta(...) que abre la app; los li viven
        // en el DOM aunque esten plegados, asi que el clic directo funciona.
        const codigoHoja = await pagina.evaluate(() => {
          for (const id of ['nivel1_11', 'nivel2_11_38', 'nivel3_11_38_1']) {
            const li = document.getElementById(id);
            if (li) li.click();
          }
          const hoja = document.getElementById('nivel4_11_38_1_1_1')
            || [...document.querySelectorAll('li.nivel4')].find((li) => /nueva consulta de comprobantes de pago/i.test((li.innerText || '').trim().replace(/\s+/g, ' ')));
          if (!hoja) return '';
          const a = hoja.querySelector('a[onclick]') || hoja;
          const retorno = (a.getAttribute('onclick') || '').slice(0, 150);
          a.click();
          return retorno;
        }).catch(() => '');
        if (codigoHoja) {
          registrar(contexto, 'portal', 'playwright_menu_app', { mensajeSunat: `arbol comprobantes -> Nueva Consulta de comprobantes de pago (${codigoHoja})` });
        } else {
          // Respaldo: item del catalogo clasico ejecuta(...). Los emisores
          // (Emision de Factura Electronica, RH) NO son el objetivo.
          const esteTexto = (s) => String(s || '').replace(/\s+/g, ' ').toLowerCase();
          const arbol = await pagina.evaluate(() => [...document.querySelectorAll('a[onclick]')]
            .map((a) => ({ texto: (a.innerText || '').trim(), onclick: (a.getAttribute('onclick') || '').slice(0, 220) }))
            .filter(it => it.onclick.includes('ejecuta'))
            .slice(0, 200));
          registrar(contexto, 'portal', 'playwright_menu_arbol', { mensajeSunat: arbol.map(it => `${it.texto || '(sin texto)'} :: ${it.onclick.split("'")[1] || ''}`).join(' | ').slice(0, 3000) });
          const puntaje = (it) => {
            const t = esteTexto(it.texto);
            if (/consulta.*comprobantes? de pago/.test(t)) return 5;
            if (t === 'comprobantes de pago') return 4;
            if (/comprobantes de pago/.test(t) && !/fisico/.test(t)) return 3;
            if (/consulta.*(comprobante|factura|nota)/.test(t)) return 2;
            if (/(comprobante|factura|nota).*(electr)/.test(t) && !/emisi/.test(t)) return 1;
            return 0;
          };
          const objetivo = arbol.map((it) => ({ ...it, puntos: puntaje(it) }))
            .sort((a, b) => b.puntos - a.puntos).find(it => it.puntos > 0);
          if (objetivo) {
            const codigo = objetivo.onclick.split("'")[1] || '';
            const selector = `a[onclick*="${codigo}"]`;
            registrar(contexto, 'portal', 'playwright_menu_app', { mensajeSunat: `clic clasico en: ${objetivo.texto || codigo}` });
            let clicFaena = false;
            try {
              await pagina.locator(selector).first().click({ timeout: 4000 });
              clicFaena = true;
            } catch {
              await pagina.evaluate((sel) => document.querySelector(sel)?.click(), selector).catch(() => {});
            }
            registrar(contexto, 'portal', 'playwright_menu_clic', { mensajeSunat: clicFaena ? 'clic real ejecutado' : 'clic simulado via evaluate' });
          } else {
            registrar(contexto, 'portal', 'playwright_menu_sin_link', { mensajeSunat: 'ni arbol ni catalogo tuvieron item de consulta de comprobantes; se continua sondeando.' });
          }
        }
      }

      // Respaldo: la peticion legada capturada (consultar.do con hc+token en
      // la query, autorizacion viviente) se navega en la MISMA pestana si el
      // popup no entrego el token; esa URL SI es navegable directo. La legada
      // decide su experiencia nueva por el Referer del menú (sin Referer
      // muestra solo su formulario clasico, verificado).
      if (urlLegada && i > 14 && !ideaUrlLegada) {
        ideaUrlLegada = true;
        registrar(contexto, 'portal', 'playwright_legada_reintento', { mensajeSunat: `navegando la ruta legada capturada: ${urlLegada.split('?')[0]}` });
        await pagina.goto(urlLegada, {
          waitUntil: 'domcontentloaded',
          referer: 'https://e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm?pestana=*&agrupacion=*',
        }).catch(() => {});
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

    const tokenFinal = tokenApi || tokenFrame || sesion.verTokenDeRed();
    if (tokenFinal) {
      registrar(contexto, 'portal', 'playwright_login_completo', { httpSunat: 200, mensajeSunat: 'token del portal capturado en el navegador.' });
      return tokenFinal;
    }
    if (sesion.urlsVistas.size) {
      registrar(contexto, 'portal', 'playwright_trafico', { mensajeSunat: [...sesion.urlsVistas].join(' | ').slice(0, 1400) });
    }
    const textoPagina = await pagina.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400));
    const listadoFrames = contextoNavegador.pages().map((p) =>
      [...p.frames().map((f) => f.url().split('?')[0].slice(0, 90))].join(' , ')).join(' | ');
    registrar(contexto, 'portal', 'playwright_sin_token', {
      mensajeSunat: `url final: ${(pagina.url() || '').slice(0, 200)} | frames: ${listadoFrames.slice(0, 500)} | pagina: ${textoPagina}`,
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
