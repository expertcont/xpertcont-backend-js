const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cargar(archivo, dependencias) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, archivo), 'utf8'), {
    module, console,
    require: (nombre) => {
      if (!(nombre in dependencias)) throw new Error(`Dependencia no simulada: ${nombre}`);
      return dependencias[nombre];
    },
  });
  return module.exports;
}

for (const origen of ['', "AGENCIA'1"]) {
  test(`destinos del periodo aislados por empresa y origen ${origen || 'todos'}`, async () => {
    let consulta;
    let parametros;
    const destinos = [{ id_punto_venta_dest: 'V', nombre: 'Vitor' }];
    const repo = cargar('../src/repositories/transporte/transventa.repository.js', {
      '../../db': { query: async (sql, values) => { consulta = sql; parametros = values; return { rows: destinos }; } },
      '../transventaColumnas': {},
    });
    assert.equal(await repo.obtenerDestinosPeriodo({ periodo: '2026-10', id_anfitrion: 'U', documento_id: 'D', idPuntoVenta: origen }), destinos);
    assert.deepEqual(Array.from(parametros), ['2026-10', 'U', 'D', ...(origen ? [origen] : [])]);
    assert.match(consulta, /SELECT DISTINCT tv.id_punto_venta_dest/);
    assert.match(consulta, /tv.periodo = \$1 AND tv.id_usuario = \$2 AND tv.documento_id = \$3/);
    assert.match(consulta, /tv.tipo_operacion = 'E'/);
    assert.match(consulta, /pv.id_usuario = tv.id_usuario/);
    assert.match(consulta, /pv.documento_id = tv.documento_id/);
    assert.doesNotMatch(consulta, /r_fecemi|cliente|destinatario/);
    if (origen) {
      assert.match(consulta, /tv.id_punto_venta = \$4/);
      assert.ok(!consulta.includes(origen));
    }
  });
}

test('opciones del periodo son opcionales y no cambian el contrato del listado anterior', async () => {
  let consultasDestinos = 0;
  let filtros;
  const destinos = [{ id_punto_venta_dest: 'V', nombre: 'Vitor' }];
  const service = cargar('../src/services/transporte/transventa.service.js', {
    '../../utils/texto': { normalizarTexto: (value) => String(value || '').trim() },
    './boleto.service': {},
    '../../repositories/transporte/transventa.repository': {
      obtenerOperaciones: async () => [],
      obtenerDestinosPeriodo: async (values) => { consultasDestinos++; filtros = values; return destinos; },
    },
  });
  const params = { periodo: '2026-10', id_anfitrion: 'U', documento_id: 'D', dia: '23', idPuntoVentaCrudo: 'P' };
  const anterior = await service.obtenerVentasTrans(params);
  assert.equal(anterior.status, 200);
  assert.equal(anterior.body.meta, undefined);
  assert.equal(consultasDestinos, 0);
  const nuevo = await service.obtenerVentasTrans({ ...params, incluirDestinos: true });
  assert.equal(nuevo.status, 200);
  assert.equal(nuevo.body.meta.destinos_periodo, destinos);
  assert.equal(consultasDestinos, 1);
  assert.equal(filtros.idPuntoVenta, 'P');
  assert.equal(filtros.dia, '23');
});

for (const origen of ['', 'ORIGEN']) {
  test(`el dia filtra en SQL antes de obtener destinos distintos, origen ${origen || 'todos'}`, async () => {
    let consulta;
    let parametros;
    const repo = cargar('../src/repositories/transporte/transventa.repository.js', {
      '../../db': { query: async (sql, values) => { consulta = sql; parametros = values; return { rows: [] }; } },
      '../transventaColumnas': {},
    });
    await repo.obtenerDestinosPeriodo({ periodo: '2026-10', id_anfitrion: 'U', documento_id: 'D', idPuntoVenta: origen, dia: '3' });
    assert.deepEqual(Array.from(parametros), ['2026-10', 'U', 'D', ...(origen ? [origen] : []), '2026-10-03']);
    assert.match(consulta, origen ? /tv.r_fecemi = \$5::date/ : /tv.r_fecemi = \$4::date/);
    assert.match(consulta, /SELECT DISTINCT tv.id_punto_venta_dest/);
  });
}
