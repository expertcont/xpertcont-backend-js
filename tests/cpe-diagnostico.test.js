const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resumirRespuesta } = require('../src/services/cpe/diagnosticoSunat');

function entorno({ tokenRechazado = false, descargaRechazada = false } = {}) {
  const logs = [];
  const logger = { registrar: (...args) => logs.push(args), resumirRespuesta };
  const cargar = (archivo, dependencias) => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services', archivo), 'utf8'), {
      module, Buffer, URLSearchParams, Date, setTimeout,
      console: { log() {} }, require: id => {
        if (Object.hasOwn(dependencias, id)) return dependencias[id];
        throw new Error(`Dependencia inesperada: ${id}`);
      },
    });
    return module.exports;
  };
  let solicitudesToken = 0;
  const sunat = cargar('sire/sireSunatClient.service.js', {
    '../cpe/diagnosticoSunat': logger,
    '../../repositories/sire/sire.repository': {
      obtenerCredencialesSire: async () => ({ sire_id: 'CLIENT_ID', sire_secret: 'SECRET_CLIENT',
        sunat_sol: 'USER_SOL', sunat_solpwd: 'SECRET_PASSWORD' }),
    },
    'node-fetch': async () => {
      solicitudesToken++;
      return { ok: !tokenRechazado, status: tokenRechazado ? 401 : 200,
        json: async () => tokenRechazado
          ? { error: 'invalid_grant', error_description: 'Rechazo USER_SOL SECRET_PASSWORD SECRET_CLIENT' }
          : { access_token: `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url')}.firma` } };
    },
  });
  const cpe = cargar('cpe/consultacpe.service.js', {
    './diagnosticoSunat': logger,
    crypto: { randomUUID: () => 'REF-PRUEBA' },
    '../sire/sireSunatClient.service': sunat,
    'adm-zip': class {
      getEntries() { return [{ entryName: 'comprobante.xml', header: { size: 6 } }]; }
      readFile() { return Buffer.from('<xml/>'); }
    },
    'node-fetch': async () => ({ ok: !descargaRechazada, status: descargaRechazada ? 403 : 200,
      text: async () => JSON.stringify(descargaRechazada
        ? { errors: [{ codError: '104', desError: 'No autorizado' }] }
        : { valArchivo: Buffer.from('PK-zip-simulado').toString('base64') }),
    }),
  });
  return { cpe, logs, solicitudesToken: () => solicitudesToken };
}
const params = { idAnfitrion: 'HOST', documentoId: '20111111111', ruc: '20222222222', tipo: '01', serie: 'F001', numero: '123' };

test('descarga exitosa identifica empresa, credencial y reutilizacion de token', async () => {
  const e = entorno();
  await e.cpe.descargarComprobanteCpe(params);
  await e.cpe.descargarComprobanteCpe(params);
  assert.equal(e.solicitudesToken(), 1);
  const eventos = e.logs.filter(r => r[2] === 'xml_descargado');
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0][0].rucEmpresa, params.documentoId);
  assert.equal(eventos[0][3].credencial, 'principal');
  assert.equal(eventos[0][3].tokenCache, false);
  assert.equal(eventos[1][3].tokenCache, true);
  assert.doesNotMatch(JSON.stringify(e.logs), /SECRET_|eyJhbG/);
});

test('rechazo OAuth identifica etapa y oculta credenciales incluso si SUNAT las refleja', async () => {
  const e = entorno({ tokenRechazado: true });
  await assert.rejects(e.cpe.descargarComprobanteCpe(params), error => {
    assert.match(error.mensajePublico, /generacion del token CPE/);
    assert.match(error.mensajePublico, /HTTP SUNAT 401/);
    assert.match(error.mensajePublico, /invalid_grant/);
    assert.doesNotMatch(error.mensajePublico, /USER_SOL|SECRET_/);
    assert.doesNotMatch(error.message, /USER_SOL|SECRET_/);
    return true;
  });
  assert.doesNotMatch(JSON.stringify(e.logs), /USER_SOL|SECRET_/);
  assert.equal(e.logs.at(-1)[1], 'token');
});

test('token valido y recurso rechazado informa etapa de descarga y codigo SUNAT', async () => {
  const e = entorno({ descargaRechazada: true });
  await assert.rejects(e.cpe.descargarComprobanteCpe(params), error => {
    assert.equal(error.statusCode, 403);
    assert.match(error.mensajePublico, /descarga del XML/);
    assert.match(error.mensajePublico, /codigo SUNAT: 104/);
    assert.match(error.mensajePublico, /REF-PRUEBA/);
    return true;
  });
  assert.equal(e.logs.at(-1)[2], 'autorizacion_rechazada');
});
