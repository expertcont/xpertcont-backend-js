const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function entorno({ rubro = 'COMERCIAL', sku = '1', rowCount = 1, codigoError } = {}) {
  const consultas = [];
  const module = { exports: {} };
  const pool = { query: async (sql, values) => {
    consultas.push({ sql, values });
    if (sql.includes('SELECT u.rubro')) return { rows: [{ rubro, producto_sku: sku }] };
    if (codigoError) throw Object.assign(new Error('Base de datos'), { code: codigoError });
    return { rowCount, rows: rowCount ? [{ id_grupo: 'G01', nombre: 'GRUPO' }] : [] };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/productoGrupo.controllers.js'), 'utf8'), {
    module, require: id => id === '../db' ? pool : { resolverDocumentoId: async () => 'EMPRESA_MATRIZ' },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; }, sendStatus(code) { this.statusCode = code; return this; } };
  const req = { params: { id_anfitrion: 'propietario', documento_id: 'EMPRESA', id_grupo: 'G01' }, body: { id_grupo: 'G01', nombre: 'Grupo', descripcion: 'Detalle', ctrl_crea_us: 'invitado' } };
  return { api: module.exports, consultas, req, res };
}

test('acceso denegado para otros rubros y SKU desactivado, ausente o distinto de 1', async () => {
  for (const config of [{ rubro: 'TRANSPORTE' }, { rubro: 'PROYECTOS' }, { rubro: 'CONTABLE' }, { sku: '0' }, { sku: null }, { sku: 'zku' }]) {
    const e = entorno(config);
    await e.api.validarAccesoGrupos(e.req, e.res, () => assert.fail('No debe autorizar'));
    assert.equal(e.res.statusCode, 403);
    assert.equal(e.consultas.length, 1);
  }
});

test('listado y escrituras usan la empresa resuelta, sin mezclar anfitriones', async () => {
  const e = entorno();
  let autorizado = false;
  await e.api.validarAccesoGrupos(e.req, e.res, error => { assert.equal(error, undefined); autorizado = true; });
  assert.equal(autorizado, true);
  assert.equal(e.consultas[0].values[1], 'EMPRESA_MATRIZ');
  await e.api.obtenerGrupos(e.req, e.res, assert.fail);
  assert.deepEqual(Array.from(e.consultas[1].values), ['propietario', 'EMPRESA_MATRIZ']);
  e.req.method = 'POST';
  await e.api.guardarGrupo(e.req, e.res, assert.fail);
  assert.equal(e.res.statusCode, 201);
  assert.match(e.consultas[2].sql, /id_grupo/);
  assert.match(e.consultas[2].sql, /ctrl_crea/);
  assert.deepEqual(Array.from(e.consultas[2].values), ['propietario', 'EMPRESA_MATRIZ', 'G01', 'GRUPO', 'Detalle', 'invitado']);
  e.req.method = 'PUT';
  e.req.body.id_grupo = 'CAMBIO_NO_PERMITIDO';
  await e.api.guardarGrupo(e.req, e.res, assert.fail);
  assert.equal(e.res.statusCode, 200);
  assert.equal(e.consultas[3].values[2], 'G01');
  assert.match(e.consultas[3].sql, /ctrl_mod = CURRENT_TIMESTAMP/);
  await e.api.eliminarGrupo(e.req, e.res, assert.fail);
  assert.equal(e.res.statusCode, 204);
  assert.deepEqual(Array.from(e.consultas[4].values), ['propietario', 'EMPRESA_MATRIZ', 'G01']);
});

test('validación rechaza campos vacíos y valores fuera del tamaño de la tabla', async () => {
  for (const cambio of [{ id_grupo: '' }, { id_grupo: 'X'.repeat(16) }, { nombre: ' ' }, { nombre: 'X'.repeat(101) }, { descripcion: 'X'.repeat(301) }]) {
    const e = entorno();
    e.req.method = 'POST'; e.req.body = { ...e.req.body, ...cambio };
    e.req.grupoContexto = { id_anfitrion: 'propietario', documento: 'EMPRESA_MATRIZ' };
    await e.api.guardarGrupo(e.req, e.res, assert.fail);
    assert.equal(e.res.statusCode, 400);
    assert.equal(e.consultas.length, 0);
  }
});

test('duplicados, grupo ausente y referencias tienen respuestas controladas', async () => {
  for (const [operacion, config, status] of [['guardarGrupo', { codigoError: '23505' }, 409], ['guardarGrupo', { rowCount: 0 }, 404], ['eliminarGrupo', { rowCount: 0 }, 404], ['eliminarGrupo', { codigoError: '23503' }, 409]]) {
    const e = entorno(config);
    e.req.method = 'PUT'; e.req.grupoContexto = { id_anfitrion: 'propietario', documento: 'EMPRESA_MATRIZ' };
    await e.api[operacion](e.req, e.res, assert.fail);
    assert.equal(e.res.statusCode, status);
  }
});
