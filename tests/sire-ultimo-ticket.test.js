const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const params = { idAnfitrion: 'luceliariveracdsl@gmail.com', documentoId: '20539579356', periodo: '2026-09', idLibro: '014' };
function entorno({ ticket = 'GUARDADO', reemplazo = null, fallo = '', propuesta = null } = {}) {
  const module = { exports: {} };
  const deps = {
    '../../repositories/transporte/sire.repository': {
      obtenerReemplazoTerminadoQuery: async () => { if (fallo === 'reemplazo') throw Error('columna ausente'); return reemplazo; },
      obtenerPropuestaGuardadaSireTransporteQuery: async () => { if (fallo === 'propuesta') throw Error('tabla ausente'); return propuesta; },
    },
    '../../repositories/sire/sire.repository': { obtenerDatosTicketPropuestaSire: async p => {
      assert.equal(p.idAnfitrion, params.idAnfitrion);
      assert.equal(p.idLibro, '140000');
      return { sire_tpropuesta: ticket };
    } },
    '../sire/sireSunatClient.service': { normalizarIdLibroSire: () => '140000' },
    '../sire/sirePropuestaStore.service': {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/transporte/sire.service.js'), 'utf8'), {
    module, require: id => { if (!(id in deps)) throw Error(id); return deps[id]; }, console: { error() {} },
  });
  return module.exports;
}
test('recupera ticket existente aunque falle el historial de reemplazo o propuesta, sin habilitar presentacion', async () => {
  for (const fallo of ['reemplazo', 'propuesta']) {
    const r = await entorno({ fallo }).obtenerUltimaPropuestaSireTransporte(params);
    assert.equal(r.ticket, 'GUARDADO');
    assert.equal(r.reutilizado, true);
    assert.equal(r.importacion, null);
    assert.ok(r.advertencia);
  }
});
test('reemplazo pendiente conserva su ticket de actualizacion y no restaura el anterior', async () => {
  const r = await entorno({ reemplazo: { estado_actualizacion: 'PENDIENTE', ticket_actualizacion: 'NUEVO' } }).obtenerUltimaPropuestaSireTransporte(params);
  assert.equal(r.ticket, 'NUEVO');
  assert.equal(r.actualizacion_pendiente, true);
  assert.equal(r.importacion, null);
});
test('recupera importacion correspondiente y no inventa una fecha para tickets antiguos', async () => {
  const r = await entorno({ propuesta: { ticket: 'GUARDADO', estado: 'PARSEADO', id_propuesta: '1', cantidad_registros: 3, nombre_archivo: 'propuesta.zip' } }).obtenerUltimaPropuestaSireTransporte(params);
  assert.equal(r.ticket, 'GUARDADO');
  assert.equal(r.fecha_generacion, null);
  assert.equal(r.importacion.cantidad_registros, 3);
  assert.equal(r.nombre_archivo_rep, 'propuesta.zip');
});
test('sin ticket guardado, un error de consulta no se presenta como ausencia de datos', async () => {
  await assert.rejects(entorno({ ticket: '', fallo: 'propuesta' }).obtenerUltimaPropuestaSireTransporte(params), /tabla ausente/);
});
