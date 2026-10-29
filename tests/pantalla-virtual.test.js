const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

function entorno({ env = {}, plataforma = 'linux', modo = 'listo' } = {}) {
  const hijos = [], logs = [], llamadas = [];
  const spawn = (...args) => {
    llamadas.push(args);
    const hijo = new EventEmitter();
    Object.assign(hijo, { pid: 100 + hijos.length, exitCode: null, signalCode: null,
      stderr: new PassThrough(), stdio: [null, null, null, new PassThrough()], senales: [] });
    hijo.kill = senal => {
      hijo.senales.push(senal);
      queueMicrotask(() => { hijo.signalCode = senal; hijo.emit('exit', null, senal); });
      return true;
    };
    hijos.push(hijo);
    queueMicrotask(() => {
      if (modo === 'listo') hijo.stdio[3].write(`${100 + hijos.indexOf(hijo)}\n`);
      if (modo === 'ausente') { hijo.pid = undefined; hijo.emit('error', Object.assign(new Error('ausente'), { code: 'ENOENT' })); }
      if (modo === 'falla') {
        hijo.stderr.write('Error cargando biblioteca de Xvfb');
        hijo.exitCode = 1;
        hijo.emit('exit', 1, null);
      }
    });
    return hijo;
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/cpe/pantallaVirtual.service.js'), 'utf8'), {
    module, process: { platform: plataforma, env }, setTimeout, clearTimeout,
    require: id => {
      if (id === 'node:child_process') return { spawn };
      if (id === './diagnosticoSunat') return { registrar: (...args) => logs.push(args) };
      throw new Error(id);
    },
  });
  return { preparar: module.exports.prepararPantalla, hijos, logs, llamadas, env };
}

test('importar el modulo no inicia Xvfb; cada login recibe un display independiente', async () => {
  const e = entorno();
  assert.equal(e.llamadas.length, 0);
  const [a, b] = await Promise.all([e.preparar({}), e.preparar({})]);
  assert.equal(a.env.DISPLAY, ':100');
  assert.equal(b.env.DISPLAY, ':101');
  assert.equal(e.env.DISPLAY, undefined);
  assert.equal(a.headless, false);
  assert.equal(e.llamadas[0][0], 'Xvfb');
  assert.ok(e.llamadas[0][1].includes('-displayfd'));
  await Promise.all([a.cerrar(), a.cerrar(), b.cerrar()]);
  assert.deepEqual(e.hijos.map(h => h.senales), [['SIGTERM'], ['SIGTERM']]);
});

test('headless, Windows y un DISPLAY existente no crean ni cierran pantallas ajenas', async () => {
  for (const opciones of [{ env: { PLAYWRIGHT_HEADLESS: '1' } }, { plataforma: 'win32' }, { env: { DISPLAY: ':42' } }]) {
    const e = entorno(opciones);
    const pantalla = await e.preparar({});
    await pantalla.cerrar();
    assert.equal(e.hijos.length, 0);
    assert.equal(pantalla.headless, opciones.env?.PLAYWRIGHT_HEADLESS === '1');
    if (opciones.env?.DISPLAY) assert.equal(pantalla.env.DISPLAY, ':42');
  }
});

test('Xvfb ausente o con error devuelve un fallo controlado con diagnostico', async () => {
  for (const modo of ['ausente', 'falla']) {
    const e = entorno({ modo });
    await assert.rejects(e.preparar({}), error => {
      assert.equal(error.statusCode, 501);
      assert.match(error.message, modo === 'ausente' ? /ENOENT/ : /biblioteca/);
      return true;
    });
    assert.ok(e.logs.some(log => log[2] === 'xvfb_fallo'));
  }
});

test('Xvfb que no confirma pantalla vence y se termina sin bloquear el event loop', async () => {
  const e = entorno({ modo: 'silencio' });
  let atendioOtraTarea = false;
  const pendiente = e.preparar({ timeoutMs: 20 });
  await new Promise(resolve => queueMicrotask(() => { atendioOtraTarea = true; resolve(); }));
  await assert.rejects(pendiente, /no confirmo una pantalla/);
  assert.equal(atendioOtraTarea, true);
  assert.deepEqual(e.hijos[0].senales, ['SIGTERM']);
});

function cargarLogin({ fallaLanzamiento = false } = {}) {
  const eventos = [], acciones = [];
  let cerrados = 0, pantallasCerradas = 0, vuelta = 0;
  const pagina = {
    on() {}, setDefaultTimeout() {},
    goto: async url => acciones.push(['goto', url]),
    waitForSelector: async selector => acciones.push(['selector', selector]),
    $: async selector => selector === '#btnAceptar' ? { click: async () => acciones.push(['submit']) } : null,
    fill: async selector => acciones.push(['fill', selector]),
    url: () => 'https://e-menu.sunat.gob.pe/cl-ti-itmenu/MenuInternet.htm',
    frames: () => [],
    locator: () => ({ first: () => ({ click: async () => acciones.push(['menu']) }) }),
    evaluate: async funcion => {
      const codigo = funcion.toString();
      if (codigo.includes('sessionStorage')) return vuelta >= 9 ? 'TOKEN-SIMULADO' : '';
      if (codigo.includes('Boolean(document.querySelector')) return false;
      if (codigo.includes('nivel1_11')) return '';
      if (codigo.includes("querySelectorAll('a[onclick]')")) return [{ texto: 'Nueva Consulta de comprobantes de pago', onclick: "ejecuta('consulta')" }];
      return '';
    },
  };
  const navegador = {
    newContext: async () => ({ newPage: async () => pagina, on() {}, pages: () => [pagina] }),
    close: async () => { cerrados++; },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/cpe/loginPortalPlaywright.service.js'), 'utf8'), {
    module, setTimeout: callback => { vuelta++; queueMicrotask(callback); },
    require: id => {
      if (id === './diagnosticoSunat') return { registrar: (...args) => eventos.push(args) };
      if (id === './pantallaVirtual.service') return { prepararPantalla: async () => ({
        headless: false, env: { DISPLAY: ':123' }, cerrar: async () => { pantallasCerradas++; },
      }) };
      if (id === 'playwright') return { chromium: { launch: async opciones => {
        acciones.push(['launch', opciones]);
        if (fallaLanzamiento) throw new Error('Chromium no disponible');
        return navegador;
      } } };
      throw new Error(id);
    },
  });
  return { login: module.exports.loginPortalPlaywrightCpe, acciones, eventos,
    cierres: () => ({ navegador: cerrados, pantalla: pantallasCerradas }) };
}

test('login conserva formulario SOL, apertura del menu y captura del token; cierra ambos procesos', async () => {
  const e = cargarLogin();
  const token = await e.login({ documentoId: '20111111111', sol: 'USUARIO', password: 'CLAVE', contexto: {} });
  assert.equal(token, 'TOKEN-SIMULADO');
  assert.deepEqual(e.acciones.filter(a => a[0] === 'fill').map(a => a[1]), ['#txtRuc', '#txtUsuario', '#txtContrasena']);
  assert.ok(e.acciones.some(a => a[0] === 'menu'));
  assert.ok(e.eventos.some(ev => ev[2] === 'playwright_menu_clic' && ev[3].mensajeSunat === 'clic real ejecutado'));
  const opciones = e.acciones.find(a => a[0] === 'launch')[1];
  assert.equal(opciones.env.DISPLAY, ':123');
  assert.equal(opciones.headless, false);
  assert.equal(opciones.timeout, 30000);
  assert.deepEqual(e.cierres(), { navegador: 1, pantalla: 1 });
});

test('fallo al abrir Chromium libera la pantalla y registra el error', async () => {
  const e = cargarLogin({ fallaLanzamiento: true });
  await assert.rejects(e.login({ contexto: {} }), /Chromium no disponible/);
  assert.deepEqual(e.cierres(), { navegador: 0, pantalla: 1 });
  assert.ok(e.eventos.some(ev => ev[2] === 'playwright_lanzador_fallo'));
});
