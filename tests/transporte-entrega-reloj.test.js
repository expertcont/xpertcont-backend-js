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

test('el reloj SQL usa America/Lima y devuelve texto sin serializacion Date', async () => {
  const hora = '2026-10-21 23:59:59.123';
  let consulta;
  const repo = cargar('../src/repositories/transporte/entrega.repository.js', {
    '../../db': { query: async (sql) => {
      consulta = sql;
      return { rows: [{ hora_servidor: hora }] };
    } },
    '../transventaColumnas': { columnasVentaTrans: '' },
  });
  assert.equal(await repo.consultarHoraServidorQuery(), hora);
  assert.match(consulta, /clock_timestamp\(\) AT TIME ZONE 'America\/Lima'/);
  assert.match(consulta, /TO_CHAR/);
});

test('el listado publica la referencia del servidor incluso sin encomiendas', async () => {
  const hora = '2026-10-22 00:00:00.123';
  const service = cargar('../src/services/transporte/entrega.service.js', {
    '../../utils/periodos': { obtenerUltimosPeriodos: () => ['2026-10'] },
    '../../utils/texto': { normalizarTexto: (texto) => String(texto || '') },
    '../../repositories/transporte/entrega.repository': {
      listarEncomiendasAgenciaQuery: async () => [],
      consultarHoraServidorQuery: async () => hora,
    },
  });
  const resultado = await service.listarEncomiendasPorEntregar({
    params: { periodo: '2026-10', id_anfitrion: 'U', documento_id: 'D', id_punto_venta_dest: 'P' }, query: {},
  });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.meta.hora_servidor, hora);
  assert.equal(resultado.body.data.length, 0);
});
