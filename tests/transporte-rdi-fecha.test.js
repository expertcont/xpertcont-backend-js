
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pgTypes = require('pg-types');
const formato = require('../src/utils/formato');
const texto = require('../src/utils/texto');
const generarXml = require('../../xpertcont-backend-api/src/controllers/cpe/cpegeneraxmlresumen');

function cargar(file, dependencias) {
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

function servicio(rdi, tipoOperacion, capturar = () => {}) {
  return cargar(path.join(__dirname, '../src/services/transporte/rdi.service.js'), {
    'node-fetch': async (url, options) => {
      capturar(JSON.parse(options.body));
      return { ok: true };
    },
    '../../utils/formato': formato,
    '../../utils/texto': texto,
    '../../utils/sunat': { leerRespuestaSunat: async () => ({ estado: true, nivel: 'PENDIENTE' }) },
    '../../repositories/transporte/rdi.repository': {
      obtenerDatosResumenSunatTransporte: async () => ({ documento_id: '20123456789', modo: '0' }),
      obtenerRdiSunatTransporte: async () => rdi,
      obtenerComprobantesPorRdiQuery: async () => [{
        tipo_operacion: tipoOperacion, r_cod: '03', r_serie: 'B001', r_numero: '0000123',
        fecha_emision: rdi.fecha_rdi_texto, r_monto_total: 118,
        r_gravado: tipoOperacion === 'E' ? 100 : 0,
        r_exonerado: tipoOperacion === 'B' ? 118 : 0, r_igv: tipoOperacion === 'E' ? 18 : 0,
      }],
      actualizarRdiSunatTransporte: async () => {},
      estadoSunatTransportePorNivel: () => 'P',
      actualizarOperacionesRdiQuery: async () => [],
    },
  });
}

test('la consulta RDI devuelve su fecha como texto SQL', async () => {
  let sql;
  const repo = cargar(path.join(__dirname, '../src/repositories/transporte/rdi.repository.js'), {
    '../../db': { query: async (query) => { sql = query; return { rows: [] }; } },
  });
  await repo.obtenerRdiSunatTransporte({ idUsuario: 'U', documentoId: 'R', numeroRdi: 'RC-20261014-1' });
  assert.match(sql, /TO_CHAR\(fecha, 'YYYY-MM-DD'\) AS fecha_rdi_texto/);
});

for (const zona of ['UTC', 'America/Lima', 'Europe/Madrid', 'Asia/Tokyo']) {
  for (const tipo of ['E', 'B']) {
    test('RDI ' + tipo + ' conserva fecha en payload, XML y consulta de ticket en ' + zona, async () => {
      const anterior = process.env.TZ;
      process.env.TZ = zona;
      try {
        for (const fecha of ['2026-10-14', '2026-01-01', '2024-02-29']) {
          const numeroRdi = 'RC-' + fecha.replace(/-/g, '') + '-1';
          const rdi = {
            fecha: pgTypes.getTypeParser(1082)(fecha),
            fecha_rdi_texto: fecha, ticket: 'T1', secuencia: 1,
          };
          let consulta;
          const svc = servicio(rdi, tipo, (payload) => { consulta = payload; });
          const parametros = { periodo: fecha.slice(0, 7), idUsuario: 'U', documentoId: '20123456789', numeroRdi, tipoOperacion: tipo };
          const { payload } = await svc.generarPayloadResumenSunatTransporteDesdeRdi(parametros);
          assert.equal(payload.resumen.fecha_documentos, fecha);
          assert.equal(payload.resumen.fecha_resumen, fecha);
          const xml = generarXml(payload);
          assert.ok(xml.includes('<cbc:ReferenceDate>' + fecha + '</cbc:ReferenceDate>'));
          assert.ok(xml.includes('<cbc:IssueDate>' + fecha + '</cbc:IssueDate>'));
          await svc.consultarTicketRdiSunatTransporte(parametros);
          assert.equal(consulta.resumen.fecha_documentos, fecha);
          assert.equal(consulta.nombre_archivo, '20123456789-' + numeroRdi);
        }
      } finally {
        if (anterior === undefined) delete process.env.TZ;
        else process.env.TZ = anterior;
      }
    });
  }
}

test('RDI sin fecha SQL valida no genera payload', async () => {
  const svc = servicio({ fecha: new Date('2026-10-14T00:00:00Z') }, 'E');
  await assert.rejects(svc.generarPayloadResumenSunatTransporteDesdeRdi({ numeroRdi: 'RC-20261014-1' }), /FECHA DEL RESUMEN DIARIO NO VALIDA/);
});
