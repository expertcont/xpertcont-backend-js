
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pgTypes = require('pg-types');
const generarXml = require('../../xpertcont-backend-api/src/controllers/cpe/cpegeneraxmlresumen');

function cargarComercial(rdi, capturar = () => {}) {
  const module = { exports: {} };
  const consultas = [];
  const deps = {
    '../db': {
      query: async (sql) => {
        consultas.push(sql);
        if (sql.includes('FROM mad_usuariocontabilidad')) return { rows: [{ documento_id: '20123456789', modo: '0' }] };
        if (sql.includes('FROM public.mve_rdi_sunat')) return { rows: [rdi] };
        if (sql.includes('FROM public.mve_venta')) return { rows: [{
          r_cod: '03', r_serie: 'B001', r_numero: '0000123', registrado: 1,
          r_base002: 100, r_igv002: 18, r_monto_total: 118,
        }] };
        return { rows: [], rowCount: 0 };
      },
    },
    '../utils/libreria.utils': {},
    'node-fetch': async (url, options) => {
      capturar(JSON.parse(options.body));
      return { ok: true, text: async () => JSON.stringify({ estado: true, nivel: 'PENDIENTE' }) };
    },
  };
  const file = path.join(__dirname, '../src/controllers/venta.controllers.js');
  const source = fs.readFileSync(file, 'utf8') +
    '\nmodule.exports.pruebasFechaRdi = { generarPayloadResumenSunatComercial, consultarTicketRdiSunatComercial };';
  vm.runInNewContext(source, {
    module, exports: module.exports, Date, console,
    require: (name) => {
      if (!(name in deps)) throw new Error('Dependencia no simulada: ' + name);
      return deps[name];
    },
  }, { filename: file });
  return { ...module.exports.pruebasFechaRdi, consultas };
}

for (const zona of ['UTC', 'America/Lima', 'Europe/Madrid', 'Asia/Tokyo']) {
  test('RDI comercial conserva fecha en payload, XML y consulta en ' + zona, async () => {
    const anterior = process.env.TZ;
    process.env.TZ = zona;
    try {
      for (const fecha of ['2026-10-14', '2026-01-01', '2024-02-29']) {
        let consultaTicket;
        const numeroRdi = 'RC-' + fecha.replace(/-/g, '') + '-1';
        const rdi = {
          fecha: pgTypes.getTypeParser(1082)(fecha),
          fecha_rdi_texto: fecha, secuencia: 1, ticket: 'T1',
        };
        const svc = cargarComercial(rdi, (payload) => { consultaTicket = payload; });
        const parametros = { periodo: fecha.slice(0, 7), idUsuario: 'U', documentoId: '20123456789', numeroRdi };
        const { payload } = await svc.generarPayloadResumenSunatComercial(parametros);
        assert.equal(payload.resumen.fecha_documentos, fecha);
        assert.equal(payload.resumen.fecha_resumen, fecha);
        const xml = generarXml(payload);
        assert.ok(xml.includes('<cbc:ReferenceDate>' + fecha + '</cbc:ReferenceDate>'));
        assert.ok(xml.includes('<cbc:IssueDate>' + fecha + '</cbc:IssueDate>'));
        assert.ok(svc.consultas.some((sql) => /TO_CHAR\(fecha, 'YYYY-MM-DD'\) AS fecha_rdi_texto/.test(sql)));
        await svc.consultarTicketRdiSunatComercial(parametros);
        assert.equal(consultaTicket.resumen.fecha_documentos, fecha);
        assert.equal(consultaTicket.nombre_archivo, '20123456789-' + numeroRdi);
      }
    } finally {
      if (anterior === undefined) delete process.env.TZ;
      else process.env.TZ = anterior;
    }
  });
}

test('RDI comercial sin fecha SQL valida no genera payload', async () => {
  const svc = cargarComercial({ fecha: new Date('2026-10-14T00:00:00Z') });
  await assert.rejects(svc.generarPayloadResumenSunatComercial({ numeroRdi: 'RC-20261014-1' }), /FECHA DEL RESUMEN DIARIO COMERCIAL NO VALIDA/);
});
