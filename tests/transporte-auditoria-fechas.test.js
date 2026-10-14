
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pgTypes = require('pg-types');
const formato = require('../src/utils/formato');

function cargar(relativo, deps, extra = '', DateClase = Date) {
  const file = path.join(__dirname, relativo), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8') + extra, {
    module, exports: module.exports, Date: DateClase, console, Intl,
    require: (n) => { if (!(n in deps)) throw Error('Dependencia no simulada: ' + n); return deps[n]; },
  }, { filename: file });
  return module.exports;
}

for (const zona of ['UTC', 'America/Lima', 'Europe/Madrid', 'Asia/Tokyo']) {
  test('DATE y ambos tickets PDF mantienen el dia en ' + zona, async () => {
    const anterior = process.env.TZ;
    process.env.TZ = zona;
    try {
      for (const fecha of ['2026-10-14', '2026-01-01', '2024-02-29']) {
        const fechaPg = pgTypes.getTypeParser(1082)(fecha);
        assert.equal(formato.toIsoDateColumna(fechaPg), fecha);
        const svc = cargar('../src/services/transporte/ticket.service.js', {
          'node-fetch': () => { throw Error('No se permiten llamadas reales'); },
          '../../utils/formato': formato, '../../utils/sunat': {},
          '../../repositories/transporte/ticket.repository': {
            obtenerContabilidadAdminQuery: async () => ({ documento_id: '20123456789' }),
            obtenerEncomiendaTicketQuery: async () => ({
              tipo_operacion: 'E', r_fecemi: fechaPg, fecha_emision_ticket: fecha,
              r_cod: '03', r_serie: 'B001', r_numero: '0000123', r_monto_total: 118,
            }),
          },
        });
        for (const endpoint of [svc.TICKET_ENCOMIENDA_ENDPOINT, svc.TICKET_ENCOMIENDA_ADMIN_ENDPOINT]) {
          const payload = JSON.parse(await svc.generaJsonTicketEncomiendaExpertcontTransporte(
            '2026-10', 'U', '20123456789', '03', 'B001', '0000123', 1, endpoint
          ));
          assert.equal(payload.venta.fecha_emision, fecha);
          assert.equal(payload.encomienda.r_fecemi, fecha);
          assert.ok(payload.venta.fecha_hora_emision.startsWith(fecha + ' '));
        }
      }
    } finally {
      if (anterior === undefined) delete process.env.TZ;
      else process.env.TZ = anterior;
    }
  });
}

test('los instantes siguen convirtiendose a Lima correctamente', () => {
  assert.equal(formato.toIsoDate(new Date('2026-10-15T02:00:00Z')), '2026-10-14');
});

test('manifiesto usa hoy en Lima y no el dia UTC', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../xpertcont-frontend-react/src/components/Admin/transporte/manifiesto/TrManifiestoList.js'), 'utf8');
  const inicio = src.indexOf('const fechaHoy =');
  const fin = src.indexOf('export default function', inicio);
  for (const [instante, esperado] of [
    ['2026-10-15T02:00:00Z', '2026-10-14'],
    ['2026-10-15T04:59:59Z', '2026-10-14'],
    ['2026-10-15T05:00:00Z', '2026-10-15'],
  ]) {
    class FechaFija extends Date { constructor(...a) { super(...(a.length ? a : [instante])); } }
    const ctx = { Date: FechaFija, Intl };
    vm.runInNewContext(src.slice(inicio, fin) + '\nthis.hoy = fechaHoy;', ctx);
    assert.equal(ctx.hoy(), esperado);
  }
});

test('consulta y guardado de manifiestos serializan DATE como texto SQL', async () => {
  const consultas = [];
  const repo = cargar('../src/repositories/transporte/transmanifiesto.repository.js', {
    '../../db': { query: async (sql) => { consultas.push(sql); return { rows: [] }; } },
    '../transventaColumnas': require('../src/repositories/transventaColumnas'),
  });
  await repo.obtenerManifiestos({ id_usuario: 'U', documento_id: 'R' });
  await repo.obtenerManifiesto({ id_manifiesto: 1 });
  await repo.crearManifiesto({ fecha: '2026-10-14' });
  assert.equal(consultas.length, 3);
  for (const sql of consultas) assert.match(sql, /TO_CHAR\((?:m\.)?fecha, 'YYYY-MM-DD'\) AS fecha/);
});

test('GRE conserva fechas de calendario y toma Lima cuando falta fecha de emision', async () => {
  class FechaFija extends Date { constructor(...a) { super(...(a.length ? a : ['2026-10-15T02:00:00Z'])); } }
  const venta = { periodo: '2026-10', r_cod: '03', r_serie: 'B001', r_numero: '0000123', elemento: 1,
    r_fecemi: '2026-10-14', cliente_documento_id: '20123456789', cliente_id_doc: '6', cliente: 'CLIENTE' };
  const ctrl = cargar('../src/controllers/grem.controllers.js', {
    '../db': { query: async (sql) => ({ rows: sql.includes('mad_usuariocontabilidad')
      ? [{ documento_id: '20123456789', razon_social: 'EMPRESA' }] : [venta] }) },
    'node-fetch': () => { throw Error('No se permiten llamadas reales'); },
    '../utils/formato': formato,
  }, '\nmodule.exports.pruebas = { normalizarPayloadGremSunat, generarPayloadGremTransporte };', FechaFija).pruebas;
  const datos = {
    periodo: '2026-10', idUsuario: 'U', documentoId: '20123456789',
    encomiendas: [{ r_periodo: '2026-10', r_cod: '03', r_serie: 'B001', r_numero: '0000123', elemento: 1 }],
    guia: { serie: 'V001', fecha_traslado: '2026-10-14', hora_emision: '21:00:00', peso_total: 1,
      partida_ubigeo: '150101', partida_direccion: 'ORIGEN', llegada_ubigeo: '150102', llegada_direccion: 'DESTINO',
      vehiculo_placa: 'AAA111', conductor_dni: '12345678', conductor_nombres: 'NOMBRE', conductor_apellidos: 'APELLIDO', conductor_licencia: 'Q123' },
  };
  const payload = await ctrl.generarPayloadGremTransporte(datos);
  assert.equal(payload.guia.fecha_emision, '2026-10-14');
  assert.equal(payload.guia.fecha_traslado, '2026-10-14');
  const explicita = await ctrl.generarPayloadGremTransporte({ ...datos, guia: { ...datos.guia, fecha_emision: '2026-10-13' } });
  assert.equal(ctrl.normalizarPayloadGremSunat(explicita).guia.fecha_emision, '2026-10-13');
});
