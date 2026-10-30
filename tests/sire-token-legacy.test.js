const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resumirRespuesta, resumirToken } = require('../src/services/cpe/diagnosticoSunat');

const datos = { sire_id: 'CLIENTE', sire_secret: 'SECRETO', sire_sol: 'USUARIO', sire_solpwd: ' CLAVE+&= ' };
const params = { idAnfitrion: 'HOST', documentoId: '20111111111' };

function entorno({ rechazo = false } = {}) {
  const consultas = [], solicitudes = [], logs = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/sire/sireLegacyToken.service.js'), 'utf8'), {
    module, URLSearchParams,
    require: id => {
      if (id === '../../db') return { query: async (sql, valores) => { consultas.push({ sql, valores }); return { rows: [datos] }; } };
      if (id === '../cpe/diagnosticoSunat') return { resumirRespuesta, registrar: (...args) => logs.push(args) };
      if (id === 'node-fetch') return async (url, opciones) => {
        solicitudes.push({ url, opciones });
        return { ok: !rechazo, status: rechazo ? 400 : 200, json: async () => rechazo
          ? { error: 'invalid_grant', error_description: `Rechazo ${datos.sire_secret} ${datos.sire_solpwd}` }
          : { access_token: 'TOKEN-PRIVADO' } };
      };
      throw new Error(`Legacy no debe utilizar ${id}`);
    },
  });
  return { api: module.exports, consultas, solicitudes, logs };
}

test('legacy usa SQL y parametros originales, sin limpiar valores ni generar ticket', async () => {
  const e = entorno();
  const resultado = await e.api.obtenerTokenSireLegacy(params);
  assert.equal(resultado.token, 'TOKEN-PRIVADO');
  assert.equal(e.consultas.length, 1);
  assert.match(e.consultas[0].sql, /SELECT sire_id,sire_secret,sire_sol,sire_solpwd FROM mad_usuariocontabilidad/);
  assert.doesNotMatch(e.consultas[0].sql, /sunat_sol|ticket|INSERT|UPDATE/);
  assert.equal(e.consultas[0].valores.join(','), 'HOST,20111111111');
  const { url, opciones } = e.solicitudes[0];
  assert.equal(url.trim(), 'https://api-seguridad.sunat.gob.pe/v1/clientessol/CLIENTE/oauth2/token/');
  assert.deepEqual(Object.fromEntries(opciones.body), {
    grant_type: 'password', scope: 'https://api-sire.sunat.gob.pe', client_id: datos.sire_id,
    client_secret: datos.sire_secret, username: params.documentoId + datos.sire_sol, password: datos.sire_solpwd,
  });
  assert.equal(opciones.timeout, 30000);
  assert.doesNotMatch(JSON.stringify(e.logs), /TOKEN-PRIVADO|SECRETO|CLAVE/);
});

test('cada clic legacy relee la tabla y solicita un token sin cache', async () => {
  const e = entorno();
  await e.api.obtenerTokenSireLegacy(params);
  await e.api.obtenerTokenSireLegacy(params);
  assert.equal(e.consultas.length, 2);
  assert.equal(e.solicitudes.length, 2);
});

test('legacy rechazado no prueba otra pareja y oculta secretos reflejados', async () => {
  const e = entorno({ rechazo: true });
  await assert.rejects(e.api.obtenerTokenSireLegacy(params), error => {
    assert.match(error.message, /HTTP 400, invalid_grant/);
    assert.doesNotMatch(error.message, /SECRETO|CLAVE/);
    return true;
  });
  assert.equal(e.solicitudes.length, 1);
});

test('la accion de compras usa el bloque legacy independiente y devuelve solo el resumen', async () => {
  const module = { exports: {} };
  let llamadas = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/sire/compras/application/sireCompras.service.js'), 'utf8'), {
    module, Buffer, Date,
    require: id => {
      if (id.endsWith('diagnosticoSunat')) return { resumirToken };
      if (id.endsWith('sireLegacyToken.service')) return { obtenerTokenSireLegacy: async p => {
        llamadas++;
        assert.equal(p.documentoId, params.documentoId);
        return { token: 'TOKEN-PRIVADO', diagnostico: { modo: 'legacy', tokenCache: false } };
      } };
      return {};
    },
  });
  const servicio = module.exports({ sunat: { obtenerTokenSunat: () => { throw new Error('No usar cliente nuevo'); } } });
  const resultado = await servicio.generarTokenLegacy({ id_anfitrion: 'HOST', documento_id: params.documentoId, periodo: '2026-10' });
  assert.equal(llamadas, 1);
  assert.equal(resultado.modo, 'legacy');
  assert.equal(resultado.documento_id, params.documentoId);
  assert.doesNotMatch(JSON.stringify(resultado), /TOKEN-PRIVADO/);
});

test('la ruta HTTP legacy esta conectada al controlador correcto', async () => {
  const controller = require('../src/modules/sire/compras/http/controller')({ generarTokenLegacy: async () => ({ modo: 'legacy' }) });
  const module = { exports: {} };
  let ruta;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/sire/compras/http/routes.js'), 'utf8'), {
    module, require: () => ({ Router: () => ({ get() {}, put() {}, delete() {},
      post: (url, handler) => { if (url === '/propuesta/token-legacy') ruta = handler; },
    }) }),
  });
  module.exports(controller);
  assert.equal(ruta, controller.generarTokenLegacy);
  let respuesta;
  await ruta({ body: {}, query: {}, params: {} }, { json: data => { respuesta = data; } });
  assert.equal(respuesta.success, true);
  assert.equal(respuesta.modo, 'legacy');
});
