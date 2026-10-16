const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const { parsearTextoCompras, compararCompras } = require('../domain/compras');
const { leerArchivoPropuesta } = require('../infrastructure/archivoPropuesta');
const crearServicio = require('../application/sireCompras.service');
const parsearCompras = ({ buffer, ...contexto }) => parsearTextoCompras({ contenido: leerArchivoPropuesta(buffer), ...contexto });
const contexto = { id_anfitrion: 'anfitrion.con.correo.largo@example.com', documento_id: '20123456789', periodo: '2026-09' };
const cabecera = Array.from({ length: 33 }, (_, i) => `Columna${i}`).join('|');
const linea = (cambios = {}) => {
  const r = Array(33).fill('');
  Object.assign(r, { 0: contexto.documento_id, 1: 'EMPRESA', 2: '202609', 3: 'CAR', 4: '15/09/2026', 6: '01', 7: 'F001', 9: '000123', 11: '6', 12: '20999999999', 13: 'PROVEEDOR, SAC', 14: '100.00', 15: '18.00', 24: '118.00', 25: 'PEN', 26: '1' }, cambios);
  return r.join('|');
};
const archivo = (cambios = {}) => Buffer.from(cabecera + '\r\n' + linea(cambios) + '\r\n');
const parsear = (buffer = archivo()) => parsearCompras({ buffer, documentoId: contexto.documento_id, periodo: '2026-09' });
function entorno({ registros, ticket = 'COMPRA1', cambiaTicket = false } = {}) {
  let consultasTicket = 0;
  const llamadas = { guardar: [], descargar: 0, generar: [] };
  const service = crearServicio({
    propuestas: {
      obtenerPropuesta: async () => ({ ticket, detalle: parsear() }),
      guardarPropuesta: async (...args) => { llamadas.guardar.push(args); },
    },
    tickets: {
      obtenerDatosTicketPropuestaSire: async p => {
        assert.equal(p.idLibro, '080000');
        consultasTicket++;
        return { sire_tpropuesta: cambiaTicket && consultasTicket > 1 ? 'OTRO' : ticket };
      },
    },
    sunat: {
      generarTicketPropuestaSire: async p => { llamadas.generar.push(p); return { ticket: 'COMPRA2' }; },
      consultarEstadoTicketSire: async p => { assert.equal(p.idLibro, '080000'); return { registros: registros || [] }; },
      descargarPropuestaSire: async p => { assert.equal(p.idLibro, '080000'); llamadas.descargar++; return { buffer: archivo() }; },
    },
    comprasSistema: { obtenerComprasSistema: async () => parsear() },
    leerArchivo: leerArchivoPropuesta,
  });
  return { service, llamadas };
}
test('RCE interpreta el formato propio de compras y preserva proveedor, importes y correlativo', () => {
  const [r] = parsear();
  assert.equal(r.fecha_emision, '2026-09-15');
  assert.equal(r.numero, '000123');
  assert.equal(r.proveedor, 'PROVEEDOR, SAC');
  assert.equal(r.base001, 100);
  assert.equal(r.igv001, 18);
  assert.equal(r.total, 118);
  assert.equal(r.documento_proveedor, '20999999999');
});
test('RCE extrae un unico TXT del ZIP y admite propuesta vacia con cabecera', () => {
  const zip = new AdmZip(); zip.addFile('compras.txt', archivo());
  assert.equal(parsear(zip.toBuffer()).length, 1);
  assert.deepEqual(parsear(Buffer.from(cabecera + '\n')), []);
  zip.addFile('otro.txt', archivo());
  assert.throws(() => parsear(zip.toBuffer()), /unico TXT/);
});
test('RCE rechaza archivo de otro RUC o periodo, fecha inexistente y montos invalidos', () => {
  for (const cambio of [{ 0: '20987654321' }, { 2: '202608' }, { 4: '31/09/2026' }, { 14: 'sin importe' }]) {
    assert.throws(() => parsear(archivo(cambio)), error => error.statusCode === 422);
  }
  assert.throws(() => parsear(Buffer.from(linea())), /cabecera/);
});
test('comparacion normaliza ceros del correlativo y detecta diferencias de un centimo', () => {
  const [a] = parsear();
  assert.equal(compararCompras([a], [{ ...a, numero: '123' }])[0].resultado, 'COINCIDE');
  const r = compararCompras([a], [{ ...a, total: 118.01 }])[0];
  assert.equal(r.resultado, 'DIFERENCIA');
  assert.ok(r.diferencias.includes('total'));
});
test('comparacion separa proveedores y detecta duplicados sin presentarlos como coincidencia', () => {
  const [a] = parsear();
  const resultados = compararCompras([a], [{ ...a, documento_proveedor: '20888888888' }]);
  assert.deepEqual(resultados.map(r => r.resultado), ['SOLO_SUNAT', 'SOLO_SISTEMA']);
  assert.equal(compararCompras([a, a], [a])[0].resultado, 'DUPLICADO');
  assert.equal(compararCompras([], [a])[0].total_sunat, null);
});
test('compras siempre usa RCE, acepta correo largo y valida RUC y mes antes de SUNAT', async () => {
  const e = entorno();
  await e.service.generarTicket({ ...contexto, id_libro: '014', reutilizar_existente: false });
  assert.equal(e.llamadas.generar[0].idLibro, '080000');
  assert.equal(e.llamadas.generar[0].reutilizarExistente, false);
  for (const cambio of [{ documento_id: '-' }, { periodo: '2026-13' }, { id_anfitrion: '' }]) {
    await assert.rejects(e.service.generarTicket({ ...contexto, ...cambio }), error => error.statusCode === 400);
  }
  assert.equal(e.llamadas.generar.length, 1);
});
test('recupera ticket y compara compras sin filtrar por rubro', async () => {
  const r = await entorno().service.recuperar(contexto);
  assert.equal(r.ticket, 'COMPRA1');
  assert.equal(r.comparacion[0].resultado, 'COINCIDE');
});
const listo = { numTicket: 'COMPRA1', perTributario: '202609', codProceso: '10', codLibro: '080000', codEstadoProceso: '06', archivoReporte: [{ nomArchivoReporte: 'compras.zip' }] };
test('consulta solo importa el ticket RCE del RUC y periodo seleccionados', async () => {
  const e = entorno({ registros: [{ ...listo, numTicket: 'VENTA1' }, listo] });
  const r = await e.service.consultar({ ...contexto, ticket: 'COMPRA1' });
  assert.equal(r.listo, true);
  assert.equal(e.llamadas.descargar, 1);
  assert.equal(e.llamadas.guardar[0][0].documentoId, contexto.documento_id);
  assert.equal(e.llamadas.guardar[0][4][0].proveedor, 'PROVEEDOR, SAC');
});
test('ticket, libro, periodo o proceso ajenos y ticket en proceso no importan archivos', async () => {
  for (const cambio of [{ numTicket: 'OTRO' }, { perTributario: '202608' }, { codLibro: '140000' }, { codProceso: '2' }, { codEstadoProceso: '01' }]) {
    const e = entorno({ registros: [{ ...listo, ...cambio }] });
    assert.equal((await e.service.consultar({ ...contexto, ticket: 'COMPRA1' })).listo, false);
    assert.equal(e.llamadas.descargar, 0);
    assert.equal(e.llamadas.guardar.length, 0);
  }
});
test('rechazo SUNAT y cambio de ticket durante descarga conservan la propuesta previa', async () => {
  const rechazo = entorno({ registros: [{ ...listo, codEstadoProceso: '03' }] });
  await assert.rejects(rechazo.service.consultar({ ...contexto, ticket: 'COMPRA1' }), error => error.statusCode === 422);
  const cambio = entorno({ registros: [listo], cambiaTicket: true });
  await assert.rejects(cambio.service.consultar({ ...contexto, ticket: 'COMPRA1' }), error => error.statusCode === 409);
  assert.equal(cambio.llamadas.guardar.length, 0);
  await assert.rejects(entorno().service.consultar({ ...contexto, ticket: 'ANTERIOR' }), error => error.statusCode === 409);
});
