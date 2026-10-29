const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resumirRespuesta, resumirToken } = require('../src/services/cpe/diagnosticoSunat');

function entorno({ tokenRechazado = false, descargaRechazada = false, usarPortal = false, errorPortal } = {}) {
  const logs = [];
  const logger = { registrar: (...args) => logs.push(args), resumirRespuesta, resumirToken };
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
  let autorizacionUsada;
  const claimsPortal = { sub: '20111111111', grantType: 'authorization_token', exp: Math.floor(Date.now()/1000) + 3600,
    aud: [{ api: 'https://api-cpe.sunat.gob.pe', recurso: [{ id: '/v1/contribuyente/consultacpe', indicador: '1', gt: '100100' }] }] };
  const tokenPortal = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(claimsPortal)).toString('base64url')}.firma`;
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
          : { access_token: `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000) + 3600, ...(usarPortal ? { aud: [] } : {}) })).toString('base64url')}.firma` } };
    },
  });
  const cpe = cargar('cpe/consultacpe.service.js', {
    './diagnosticoSunat': logger,
    crypto: { randomUUID: () => 'REF-PRUEBA' },
    '../sire/sireSunatClient.service': sunat,
    './loginPortalSunat.service': { obtenerTokenPortalCpe: async ({ diagnostico }) => {
      if (errorPortal) throw errorPortal;
      if (!usarPortal) throw new Error('portal no simulado');
      Object.assign(diagnostico, { viaPortal: true, viaPortalMetodo: 'playwright' });
      return tokenPortal;
    } },
    'adm-zip': class {
      getEntries() { return [{ entryName: 'comprobante.xml', header: { size: 6 } }]; }
      readFile() { return Buffer.from('<xml/>'); }
    },
    'node-fetch': async (url, opciones) => {
      autorizacionUsada = opciones.headers.Authorization;
      return { ok: !descargaRechazada, status: descargaRechazada ? 403 : 200,
      text: async () => JSON.stringify(descargaRechazada
        ? { errors: [{ codError: '104', desError: 'No autorizado' }] }
        : { valArchivo: Buffer.from('PK-zip-simulado').toString('base64') }),
      };
    },
  });
  return { cpe, logs, solicitudesToken: () => solicitudesToken, tokenPortal, autorizacionUsada: () => autorizacionUsada };
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

test('fallback usa el token portal para descargar y diagnostica ese mismo token', async () => {
  const e = entorno({ usarPortal: true });
  await e.cpe.descargarComprobanteCpe(params);
  assert.equal(e.autorizacionUsada(), `Bearer ${e.tokenPortal}`);
  const evento = e.logs.find(log => log[1] === 'descarga' && log[2] === 'solicitando');
  assert.equal(evento[3].grantType, 'authorization_token');
  assert.equal(evento[3].consultacpeDeclarado, true);
  assert.equal(evento[3].viaPortalMetodo, 'playwright');
  assert.doesNotMatch(JSON.stringify(e.logs), /eyJhbG/);
});

test('fallo de pantalla en el portal conserva el HTTP tecnico en vez de convertirlo a 403', async () => {
  const e = entorno({ usarPortal: true, errorPortal: Object.assign(new Error('Xvfb no disponible'), { statusCode: 501 }) });
  await assert.rejects(e.cpe.descargarComprobanteCpe(params), error => {
    assert.equal(error.statusCode, 501);
    assert.match(error.mensajePublico, /Xvfb no disponible/);
    assert.doesNotMatch(error.mensajePublico, /Habilita el recurso/);
    return true;
  });
  assert.equal(e.autorizacionUsada(), undefined);
});

test('resume declaraciones del token sin exponer datos de sesion ni identificadores de aplicacion', () => {
  const claims = { sub: params.documentoId, grantType: 'authorization_token',
    iss: 'https://api-seguridad.sunat.gob.pe/v1/clientessol/CLIENTE_PRIVADO/oauth2/token/',
    clientId: 'CLIENTE_PRIVADO', userdata: { ticket: 'TICKET_PRIVADO', login: 'USUARIO_PRIVADO' },
    iat: 1000, nbf: 1000, exp: 4600,
    aud: JSON.stringify([{ api: 'https://api-cpe.sunat.gob.pe', recurso: [
      { id: '/v1/contribuyente/consultacpe', indicador: '1', gt: '100100', secreto: 'DATO_PRIVADO' },
    ] }]),
  };
  const token = `cabecera.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.firma`;
  const r = resumirToken(token, params.documentoId, 2000 * 1000);
  assert.equal(r.grantType, 'authorization_token');
  assert.equal(r.emisorHost, 'api-seguridad.sunat.gob.pe');
  assert.equal(r.consultacpeDeclarado, true);
  assert.equal(r.rucTokenCoincide, true);
  assert.equal(r.segundosRestantes, 2600);
  assert.equal(r.tokenVencido, false);
  assert.equal(r.recursosCpe[0].gt, '100100');
  assert.doesNotMatch(JSON.stringify(r), /PRIVADO|cabecera|firma/);
  assert.equal(resumirToken(token, '20999999999', 4600 * 1000).rucTokenCoincide, false);
  assert.equal(resumirToken(token, params.documentoId, 4600 * 1000).tokenVencido, true);
});

test('distingue recurso ausente, deshabilitado y audiencia no interpretable', () => {
  const resumen = aud => resumirToken(`h.${Buffer.from(JSON.stringify({ aud })).toString('base64url')}.f`, params.documentoId);
  assert.equal(resumen([]).consultacpeDeclarado, false);
  assert.equal(resumen([{ api: 'https://api-cpe.sunat.gob.pe', recurso: [
    { id: '/v1/contribuyente/consultacpe', indicador: '0' },
  ] }]).consultacpeDeclarado, false);
  assert.equal(resumen('otra-audiencia').consultacpeDeclarado, null);
  assert.equal(resumirToken('no-es-jwt', params.documentoId).jwtDecodificable, false);
});
