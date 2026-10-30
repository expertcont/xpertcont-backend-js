const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resumirRespuesta } = require('../src/services/cpe/diagnosticoSunat');

const params = { idAnfitrion: 'HOST', documentoId: '20111111111', scope: 'https://api-sire.sunat.gob.pe' };
const credenciales = { sire_id: 'CLIENTE', sire_secret: 'SECRETO_CLIENTE',
  sunat_sol: 'USER_A', sunat_solpwd: 'CLAVE_A', sire_sol: 'USER_B', sire_solpwd: 'CLAVE_B' };

function cargar({ creds = credenciales, respuestas = [] } = {}) {
  const llamadas = [], logs = [], temporizadores = [];
  let lecturas = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/sire/sireSunatClient.service.js'), 'utf8'), {
    module, Buffer, Date, URLSearchParams,
    console: { log() {} },
    setTimeout: callback => { temporizadores.push(callback); return { unref() {} }; },
    require: id => {
      if (id === '../../repositories/sire/sire.repository') return { obtenerCredencialesSire: async () => { lecturas++; return creds; } };
      if (id === '../cpe/diagnosticoSunat') return { resumirRespuesta, registrar: (...args) => logs.push(args) };
      if (id === 'node-fetch') return async (url, opciones) => {
        llamadas.push(Object.fromEntries(opciones.body));
        const respuesta = respuestas[llamadas.length - 1];
        const data = respuesta?.data || { access_token: `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url')}.firma${llamadas.length}` };
        const status = respuesta?.status || 200;
        return { ok: status < 400, status, json: async () => data };
      };
      throw new Error(id);
    },
  });
  return { api: module.exports, llamadas, logs, temporizadores, lecturas: () => lecturas };
}

test('prueba primaria rechazada termina sin intentar la secundaria aunque este completa', async () => {
  const e = cargar({ respuestas: [{ status: 400, data: { error: 'invalid_grant', error_description: 'Error en la autenticacion del usuario.' } }] });
  const diagnostico = {};
  await assert.rejects(e.api.obtenerTokenSunat({ ...params, parejaSol: 'principal', forzarNuevo: true, diagnostico }), /invalid_grant/);
  assert.equal(e.llamadas.length, 1);
  assert.equal(e.llamadas[0].username, params.documentoId + 'USER_A');
  assert.equal(e.llamadas[0].password, 'CLAVE_A');
  assert.equal(diagnostico.camposSol, 'sunat_sol/sunat_solpwd');
  assert.equal(diagnostico.intentos.length, 1);
  assert.doesNotMatch(JSON.stringify(e.logs), /USER_A|USER_B|CLAVE_A|CLAVE_B|SECRETO_CLIENTE/);
});

test('no reintenta por cliente API invalido, limite de solicitudes ni error de SUNAT', async () => {
  for (const [status, error] of [[401, 'invalid_client'], [429, 'invalid_grant'], [503, 'invalid_grant']]) {
    const e = cargar({ respuestas: [{ status, data: { error, error_description: 'Solicitud rechazada' } }] });
    await assert.rejects(e.api.obtenerTokenSunat(params));
    assert.equal(e.llamadas.length, 1);
  }
});

test('nunca mezcla campos de dos parejas incompletas ni llama a SUNAT sin datos completos', async () => {
  const e = cargar({ creds: { ...credenciales, sunat_solpwd: '', sire_sol: '' } });
  await assert.rejects(e.api.obtenerTokenSunat(params), /pareja SOL completa/);
  assert.equal(e.llamadas.length, 0);
});

test('prueba secundaria usa solo sus columnas aunque la primaria tambien este completa', async () => {
  const e = cargar({ creds: { ...credenciales, sire_sol: params.documentoId + 'USER_B' } });
  const diagnostico = {};
  await e.api.obtenerTokenSunat({ ...params, parejaSol: 'secundario', forzarNuevo: true, diagnostico });
  assert.equal(e.llamadas.length, 1);
  assert.equal(e.llamadas[0].username, params.documentoId + 'USER_B');
  assert.equal(e.llamadas[0].password, 'CLAVE_B');
  assert.equal(diagnostico.camposSol, 'sire_sol/sire_solpwd');
});

test('la prueba manual no lee ni sustituye la cache normal y relee la BD cada vez', async () => {
  const datos = { ...credenciales };
  const e = cargar({ creds: datos });
  const anterior = await e.api.obtenerTokenSunat(params);
  assert.equal(await e.api.obtenerTokenSunat(params), anterior);
  const nuevo = await e.api.obtenerTokenSunat({ ...params, parejaSol: 'principal', forzarNuevo: true });
  assert.notEqual(nuevo, anterior);
  datos.sunat_solpwd = 'CLAVE_ACTUALIZADA';
  await e.api.obtenerTokenSunat({ ...params, parejaSol: 'principal', forzarNuevo: true });
  assert.equal(e.llamadas[2].password, 'CLAVE_ACTUALIZADA');
  assert.equal(e.lecturas(), 3);
  assert.equal(await e.api.obtenerTokenSunat(params), anterior);
  assert.equal(e.temporizadores.length, 1);
  e.temporizadores[0]();
  assert.notEqual(await e.api.obtenerTokenSunat(params), anterior);
  assert.equal(e.llamadas.length, 4);
});

test('pareja explicita incompleta no se reemplaza por la otra, aunque sea valida', async () => {
  for (const parejaSol of ['principal', 'secundario']) {
    const campo = parejaSol === 'principal' ? 'sunat_solpwd' : 'sire_solpwd';
    const e = cargar({ creds: { ...credenciales, [campo]: '' } });
    await assert.rejects(e.api.obtenerTokenSunat({ ...params, parejaSol, forzarNuevo: true }), /No se intento otra pareja/);
    assert.equal(e.llamadas.length, 0);
  }
});

test('rechazo final conserva HTTP, codigo y campos, ocultando cualquier credencial reflejada', async () => {
  const data = { error: 'invalid_grant', error_description: 'Error en la autenticacion del usuario CLAVE_A CLAVE_B SECRETO_CLIENTE' };
  const e = cargar({ respuestas: [{ status: 400, data }, { status: 400, data }] });
  await assert.rejects(e.api.obtenerTokenSunat(params), error => {
    assert.match(error.message, /sunat_sol\/sunat_solpwd/);
    assert.doesNotMatch(error.message, /sire_sol\/sire_solpwd/);
    assert.match(error.message, /HTTP 400, invalid_grant/);
    assert.doesNotMatch(error.message, /CLAVE_A|CLAVE_B|SECRETO_CLIENTE/);
    return true;
  });
});

test('botones Token SIRE exigen emision nueva y pareja explicita con diagnostico seguro', async () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/sire/compras/application/sireCompras.service.js'), 'utf8'), {
    module, Buffer, Date, console,
    require: id => {
      if (id.endsWith('diagnosticoSunat')) return { resumirToken: () => ({ jwtDecodificable: false }) };
      return {};
    },
  });
  let solicitud;
  const servicio = module.exports({ sunat: { obtenerTokenSunat: async p => {
    solicitud = p;
    p.diagnostico.camposSol = p.parejaSol === 'principal' ? 'sunat_sol/sunat_solpwd' : 'sire_sol/sire_solpwd';
    p.diagnostico.tokenCache = false;
    return 'TOKEN-PRIVADO';
  } } });
  for (const pareja of ['principal', 'secundario']) {
  const resultado = await servicio.generarTokenSire({ id_anfitrion: 'HOST', documento_id: params.documentoId, periodo: '2026-10', pareja_sol: pareja });
  assert.equal(solicitud.forzarNuevo, true);
  assert.equal(solicitud.parejaSol, pareja);
  assert.equal(resultado.pareja_sol, pareja);
  assert.equal(solicitud.scope, params.scope);
  assert.equal(resultado.diagnostico.tokenCache, false);
  assert.doesNotMatch(JSON.stringify(resultado), /TOKEN-PRIVADO/);
  }
  await assert.rejects(servicio.generarTokenSire({ id_anfitrion: 'HOST', documento_id: params.documentoId, periodo: '2026-10', pareja_sol: 'otra' }), /Selecciona la pareja/);
});

test('con la misma pareja completa, la solicitud SIRE coincide con la antigua de Contabilidad', async () => {
  for (const parejaSol of ['principal', 'secundario']) {
    const datos = { ...credenciales, ...(parejaSol === 'secundario' ? { sunat_sol: '', sunat_solpwd: '' } : {}) };
    const antiguas = [];
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/sire.controllers.js'), 'utf8'), {
      module, Buffer, URLSearchParams, console: { log() {}, error() {} },
      require: id => {
        if (id === '../db') return { query: async () => ({ rows: [datos] }) };
        if (id === 'node-fetch') return async (url, opciones) => {
          antiguas.push({ url: url.trim(), body: opciones.body && Object.fromEntries(opciones.body) });
          return { json: async () => ({ access_token: 'TOKEN-ANTIGUO' }), buffer: async () => Buffer.from('ZIP') };
        };
        return {};
      },
    });
    await module.exports.generarTicketSireDescarga({ body: {
      id_anfitrion: params.idAnfitrion, documento_id: params.documentoId,
      id_libro: '008', periodo: '2026-10', ticket: 'T', nombre_archivo_rep: 'propuesta.zip',
    } }, {}, true);
    const actual = cargar({ creds: datos });
    await actual.api.obtenerTokenSunat({ ...params, parejaSol, forzarNuevo: true });
    assert.deepEqual(actual.llamadas[0], antiguas[0].body);
    assert.equal(antiguas[0].url, 'https://api-seguridad.sunat.gob.pe/v1/clientessol/CLIENTE/oauth2/token/');
    assert.equal(actual.llamadas.length, 1);
  }
});
