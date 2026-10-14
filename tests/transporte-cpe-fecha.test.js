
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pgTypes = require('pg-types');
const formato = require('../src/utils/formato');
const texto = require('../src/utils/texto');

function cargarConDependencias(file, dependencias) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, Date, console,
    require: (nombre) => {
      if (!(nombre in dependencias)) throw new Error('Dependencia no simulada: ' + nombre);
      return dependencias[nombre];
    },
  }, { filename: file });
  return module.exports;
}

function servicioParaVenta(venta) {
  return cargarConDependencias(path.join(__dirname, '../src/services/transporte/cpe.service.js'), {
    'node-fetch': () => { throw new Error('La prueba no debe enviar comprobantes'); },
    '../../utils/formato': formato,
    '../../utils/texto': texto,
    '../../utils/sunat': {},
    '../../repositories/transporte/cpe.repository': {
      obtenerDatosContabilidad: async () => ({ documento_id: '20123456789', modo: '0' }),
      obtenerEncomiendaParaCpe: async () => venta,
    },
  });
}

const generarCabecera = cargarConDependencias(
  path.join(__dirname, '../../xpertcont-backend-api/src/controllers/cpe/cpegeneracab.js'),
  { '../../utils/libreria.utils': { numeroALetras: () => 'CIENTO DIECIOCHO SOLES' } }
);

test('la consulta obtiene r_fecemi como texto antes de que pg la convierta en Date', async () => {
  let consulta;
  const repo = cargarConDependencias(path.join(__dirname, '../src/repositories/transporte/cpe.repository.js'), {
    '../../db': { query: async (sql) => { consulta = sql; return { rows: [] }; } },
  });
  await repo.obtenerEncomiendaParaCpe({});
  assert.match(consulta, /TO_CHAR\(tv\.r_fecemi, 'YYYY-MM-DD'\) AS fecha_emision_cpe/);
});

for (const zona of ['UTC', 'America/Lima', 'Europe/Madrid', 'Asia/Tokyo']) {
  test('payload y cabecera XML conservan la fecha en ' + zona, async () => {
    const anterior = process.env.TZ;
    process.env.TZ = zona;
    try {
      for (const fecha of ['2026-10-14', '2026-01-01', '2024-02-29']) {
        const venta = {
          r_fecemi: pgTypes.getTypeParser(1082)(fecha),
          fecha_emision_cpe: fecha,
          tipo_operacion: 'E', r_cod: '01', r_serie: 'F001', r_numero: '0000123',
          r_gravado: 100, r_igv: 18, r_monto_total: 118,
        };
        const payload = JSON.parse(await servicioParaVenta(venta).generaJsonPrevioCPEexpertcontTransporte({}));
        assert.equal(payload.venta.fecha_emision, fecha);
        assert.ok(generarCabecera(payload.venta).includes('<cbc:IssueDate>' + fecha + '</cbc:IssueDate>'));
      }
    } finally {
      if (anterior === undefined) delete process.env.TZ;
      else process.env.TZ = anterior;
    }
  });
}

test('una fecha faltante impide armar un payload individual', async () => {
  const svc = servicioParaVenta({ tipo_operacion: 'E', r_fecemi: new Date('2026-10-14T00:00:00Z') });
  await assert.rejects(svc.generaJsonPrevioCPEexpertcontTransporte({}), /FECHA DE EMISION DEL COMPROBANTE NO VALIDA/);
});
