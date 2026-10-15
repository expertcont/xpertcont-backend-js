const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AdmZip = require('adm-zip');
const { prepararArchivo, MAX_BYTES } = require('../src/services/sire/sireReemplazoArchivo.service');
const id = 'bd110bc4-1db1-432b-bfac-d4685a3d349d';
const hash = 'a'.repeat(64);
const p = { idAnfitrion: 'U', documentoId: '20123456789', periodo: '2024-09', idLibro: '014',
  idReemplazo: id, hashArchivo: hash, confirmar: true };
const nombre = 'LE2012345678920240900140400020112.txt';
const linea = (cambios = {}) => {
  const c = Array(33).fill('');
  Object.assign(c, { 0: p.documentoId, 1: 'EMPRESA', 2: '202409', 4: '01/09/2024',
    6: '01', 7: 'F001', 8: '1', 10: '6', 11: '20123456789', 12: 'CLIENTE',
    14: '100.00', 16: '18.00', 25: '118.00', 26: 'PEN', 27: '1.000', ...cambios });
  return c.join('|') + '|';
};
const archivo = (text = linea(), name = nombre) => prepararArchivo({
  buffer: Buffer.from(text), nombreArchivo: name, documentoId: p.documentoId, periodo: p.periodo,
});
function cargar(relative, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, relative), 'utf8'), {
    module, exports: module.exports, Buffer, URL, Date, Intl,
    console: { error() {} }, require: (n) => {
      if (!(n in deps)) throw new Error('Dependencia no simulada: ' + n);
      return deps[n];
    },
  });
  return module.exports;
}
function entorno({ previo, aceptacion, fallo, falloGuardado, estados = [], ocupado = false, ventas = [] } = {}) {
  let registro = previo === null ? null : { id_reemplazo: id, hash_archivo: hash, estado: 'PREPARADO',
    archivo_zip: Buffer.from('ZIP'), nombre_archivo: nombre.replace('.txt', '.zip'), ...previo };
  let envios = 0, consultas = 0, liberaciones = 0, falla = falloGuardado;
  const escrituras = [];
  const db = {};
  const repository = {
    adquirirCandado: async () => ocupado ? null : { client: db },
    liberarCandado: async () => { liberaciones++; },
    obtenerAceptacion: async () => aceptacion || null,
    obtenerVentas: async () => ({ razonSocial: 'EMPRESA', ventas }),
    registrarConciliacion: async () => {},
    obtenerUltimo: async () => registro,
    preparar: async (params, file, nuevoId) => (registro = { ...params, id_reemplazo: nuevoId,
      hash_archivo: file.hash, cantidad_registros: file.cantidad, estado: 'PREPARADO' }),
    actualizar: async (params, r, datos) => {
      if (falla && datos.estado === 'ENVIADO') { falla = false; throw new Error('DB no disponible'); }
      escrituras.push(datos.estado);
      registro = { ...registro, estado: datos.estado, ticket_reemplazo: datos.ticket || registro.ticket_reemplazo,
        codigo_estado_sunat: datos.codigo };
      return registro;
    },
  };
  const service = cargar('../src/services/transporte/sireReemplazo.service.js', {
    'node:crypto': require('node:crypto'),
    '../../repositories/sire/sireReemplazo.repository': repository,
    '../sire/sireReemplazoArchivo.service': { prepararArchivo },
    './sireReemplazoGenerador.service': require('../src/services/transporte/sireReemplazoGenerador.service'),
    './sireReemplazoActualizacion.service': { sincronizarReemplazo: async (params, registro) => registro },
    '../sire/sireReemplazoSunat.service': { enviarArchivo: async (params) => {
      assert.equal(params.db, db);
      assert.equal(registro.estado, 'ENVIANDO');
      envios++;
      if (fallo) throw fallo;
      await params.guardarCarga('https://api-sire.sunat.gob.pe/carga');
      return { ticket: 'REEMPLAZO3', respuesta_sunat: { numTicket: 'REEMPLAZO3' } };
    } },
    '../sire/sireSunatClient.service': {
      normalizarIdLibroSire: (v) => v === '014' ? '140000' : v,
      consultarEstadoTicketSire: async (params) => {
        if (registro.ticket_reemplazo) assert.equal(params.ticket, registro.ticket_reemplazo);
        assert.equal(params.db, db);
        consultas++;
        return { registros: estados, respuesta_sunat: { registros: estados } };
      },
    },
  });
  return { service, registro: () => registro, envios: () => envios, consultas: () => consultas,
    liberaciones: () => liberaciones, escrituras };
}

test('TXT y ZIP preservan bytes revisados, importes y huella; no incluyen cabecera', () => {
  const txt = Buffer.from(linea() + '\r\n');
  const z = new AdmZip(); z.addFile(nombre, txt);
  const resultado = prepararArchivo({ buffer: z.toBuffer(), nombreArchivo: 'revision.zip',
    documentoId: p.documentoId, periodo: p.periodo });
  assert.deepEqual(new AdmZip(resultado.buffer).readFile(nombre), txt);
  assert.equal(resultado.hash, require('node:crypto').createHash('sha256').update(txt).digest('hex'));
  assert.equal(resultado.cantidad, 1);
});
test('rechaza contexto, campos, importes y notas incompletas antes de preparar', () => {
  for (const text of [linea({ 0: '20999999999' }), linea({ 2: '202408' }), 'cabecera|ruc',
    linea({ 14: 'NaN' }), linea({ 26: '' }), linea({ 6: '07' }), linea({ 4: '2024-09-01' }), linea({ 4: '31/02/2024' }), linea({ 4: '01/10/2024' })]) {
    assert.throws(() => archivo(text), (e) => e.statusCode === 400);
  }
  assert.throws(() => archivo(linea(), '../' + nombre), (e) => e.statusCode === 400);
  assert.throws(() => archivo(linea(), nombre.replace('202409', '202408')), (e) => e.statusCode === 400);
});
test('rechaza duplicados normalizando ceros iniciales del comprobante', () => {
  assert.throws(() => archivo(linea() + '\n' + linea({ 8: '0001' })), /duplicado/);
});
test('valida limites, UTF8, ZIP sin TXT unico y ausencia de movimiento', () => {
  assert.throws(() => prepararArchivo({ buffer: Buffer.alloc(MAX_BYTES + 1) }), /20 MiB/);
  assert.throws(() => prepararArchivo({ buffer: Buffer.from([255]), nombreArchivo: nombre,
    documentoId: p.documentoId, periodo: p.periodo }), /UTF-8/);
  assert.throws(() => prepararArchivo({ buffer: Buffer.from('ZIP corrupto'), nombreArchivo: 'datos.zip',
    documentoId: p.documentoId, periodo: p.periodo }), (e) => e.statusCode === 400);
  const z = new AdmZip(); z.addFile(nombre, Buffer.from(linea())); z.addFile('otro.txt', Buffer.from('x'));
  assert.throws(() => prepararArchivo({ buffer: z.toBuffer(), nombreArchivo: 'datos.zip',
    documentoId: p.documentoId, periodo: p.periodo }), /exactamente un TXT/);
  assert.equal(archivo('', nombre.replace('0112.txt', '0012.txt')).cantidad, 0);
  assert.throws(() => archivo(''), /indicador de contenido/);
});
test('preparar persiste una copia sin enviar; bloquea aceptacion o reemplazo activo', async () => {
  const e = entorno({ previo: null });
  const r = await e.service.prepararReemplazo({ ...p, buffer: Buffer.from(linea()), nombreArchivo: nombre });
  assert.equal(r.estado, 'PREPARADO'); assert.equal(r.cantidad_registros, 1); assert.equal(e.envios(), 0);
  for (const opciones of [{ previo: { estado: 'INCIERTO' } }, { aceptacion: { estado: 'TERMINADO' } }]) {
    const x = entorno(opciones);
    await assert.rejects(x.service.prepararReemplazo({ ...p, buffer: Buffer.from(linea()), nombreArchivo: nombre }),
      (err) => err.statusCode === 409);
    assert.equal(x.liberaciones(), 1);
  }
});
test('valida confirmacion, periodo, RUC, libro e identificacion antes del envio', async () => {
  for (const cambio of [{ confirmar: false }, { documentoId: '123' }, { periodo: '2999-01' },
    { periodo: '202413' }, { idLibro: '008' }, { hashArchivo: '' }, { idReemplazo: '' }]) {
    const e = entorno();
    await assert.rejects(e.service.enviarReemplazo({ ...p, ...cambio }), (err) => err.statusCode === 400);
    assert.equal(e.envios(), 0);
  }
});
test('archivo obsoleto o candado ocupado no envian', async () => {
  for (const opciones of [{ ocupado: true }, { previo: null }, { previo: { hash_archivo: 'b'.repeat(64) } }]) {
    const e = entorno(opciones);
    await assert.rejects(e.service.enviarReemplazo(p), (err) => err.statusCode === 409);
    assert.equal(e.envios(), 0);
  }
});
test('persiste ENVIANDO antes de SUNAT y repetir envio devuelve el mismo ticket', async () => {
  const e = entorno();
  const r = await e.service.enviarReemplazo(p);
  assert.equal(r.ticket_reemplazo, 'REEMPLAZO3');
  assert.equal(r.estado, 'ENVIADO'); assert.equal(r.completado, false);
  assert.deepEqual(e.escrituras, ['ENVIANDO', 'ENVIANDO', 'ENVIADO']);
  assert.equal((await e.service.enviarReemplazo(p)).reutilizado, true);
  assert.equal(e.envios(), 1);
});
test('aceptacion activa, ENVIANDO o INCIERTO bloquean el reemplazo', async () => {
  for (const opciones of [{ aceptacion: { estado: 'ENVIADO' } },
    { previo: { estado: 'ENVIANDO' } }, { previo: { estado: 'INCIERTO' } }]) {
    const e = entorno(opciones);
    await assert.rejects(e.service.enviarReemplazo(p), (err) => err.statusCode === 409);
    assert.equal(e.envios(), 0);
  }
});
test('timeout o fallo de persistencia conservan el bloqueo y el ticket conocido', async () => {
  for (const opciones of [{ fallo: Object.assign(new Error('timeout'), { resultadoIncierto: true }) }, { falloGuardado: true }]) {
    const e = entorno(opciones);
    await assert.rejects(e.service.enviarReemplazo(p), (err) => err.estado === 'INCIERTO');
    assert.equal(e.registro().estado, 'INCIERTO');
    if (opciones.falloGuardado) assert.equal(e.registro().ticket_reemplazo, 'REEMPLAZO3');
    await assert.rejects(e.service.enviarReemplazo(p), (err) => err.statusCode === 409);
    assert.equal(e.envios(), 1);
  }
});
test('rechazo definitivo requiere preparar otro intento', async () => {
  const e = entorno({ fallo: Object.assign(new Error('Validacion SUNAT'), { statusCode: 422 }) });
  await assert.rejects(e.service.enviarReemplazo(p), (err) => err.statusCode === 422);
  assert.equal(e.registro().estado, 'RECHAZADO');
  await assert.rejects(e.service.enviarReemplazo(p), (err) => err.statusCode === 409);
});
test('consulta solo ticket, periodo y proceso 3; 04 y 06 concluyen, 03 rechaza', async () => {
  for (const [cod, esperado] of [['02', 'ENVIADO'], ['04', 'TERMINADO'], ['06', 'TERMINADO'], ['03', 'RECHAZADO']]) {
    const e = entorno({ previo: { estado: 'ENVIADO', ticket_reemplazo: 'REEMPLAZO3' }, estados: [
      { numTicket: 'REEMPLAZO3', perTributario: '202409', codProceso: '3', codEstadoProceso: cod },
    ] });
    assert.equal((await e.service.consultarEstado(p)).estado, esperado);
  }
  const base = { numTicket: 'REEMPLAZO3', perTributario: '202409', codProceso: '3', codEstadoProceso: '06' };
  for (const cambio of [{ numTicket: 'OTRO' }, { perTributario: '202408' }, { codProceso: '2' }, { codProceso: '61' }]) {
    const e = entorno({ previo: { estado: 'ENVIADO', ticket_reemplazo: 'REEMPLAZO3' }, estados: [{ ...base, ...cambio }] });
    const r = await e.service.consultarEstado(p);
    assert.equal(r.estado, 'ENVIADO'); assert.equal(r.encontrado, false);
  }
});
test('error de detalle prevalece y consulta sin ticket no consulta SUNAT', async () => {
  const e = entorno({ previo: { estado: 'ENVIADO', ticket_reemplazo: 'REEMPLAZO3' }, estados: [{
    numTicket: 'REEMPLAZO3', perTributario: '202409', codProceso: 3, codEstadoProceso: '06', detalleTicket: { codEstadoEnvio: '03' },
  }] });
  assert.equal((await e.service.consultarEstado(p)).estado, 'RECHAZADO');
  const sin = entorno({ previo: { estado: 'INCIERTO' } });
  await assert.rejects(sin.service.consultarEstado(p), (err) => err.statusCode === 409);
  assert.equal(sin.consultas(), 0);
  assert.equal((await entorno({ previo: null }).service.obtenerReemplazo(p)).estado, 'SIN_ENVIO');
});

function respuesta(status, data, headers = {}) {
  return { ok: status >= 200 && status < 300, status,
    text: async () => data == null ? '' : JSON.stringify(data),
    headers: { get: (name) => headers[name.toLowerCase()] ?? null } };
}
function cliente(respuestas) {
  const calls = [];
  const service = cargar('../src/services/sire/sireReemplazoSunat.service.js', {
    'node-fetch': async (url, opts) => {
      calls.push({ url, opts });
      const r = respuestas.shift();
      if (r instanceof Error) throw r;
      if (!r) throw new Error('Llamada inesperada');
      return r;
    },
    './sireSunatClient.service': { obtenerTokenSire: async () => 'TOKEN_SIMULADO' },
  });
  const guardadas = [];
  const params = { ...p, buffer: Buffer.from('ZIP'), nombreArchivo: nombre.replace('.txt', '.zip'),
    guardarCarga: async (url) => { guardadas.push(url); assert.equal(calls.length, 1); } };
  return { service, params, calls, guardadas };
}
const location = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/receptorpropuesta/web/propuesta/upload/id1';
test('cliente TUS crea POST, persiste Location, envia PATCH y retorna ticket de la respuesta final', async () => {
  const e = cliente([respuesta(201, null, { location }), respuesta(200, { numTicket: 'REEMPLAZO3' }, { 'upload-offset': '3' })]);
  assert.equal((await e.service.enviarArchivo(e.params)).ticket, 'REEMPLAZO3');
  assert.equal(e.calls.length, 2); assert.equal(e.calls[0].opts.method, 'POST');
  const metadata = Object.fromEntries(e.calls[0].opts.headers['Upload-Metadata'].split(',').map((item) => {
    const [key, value] = item.split(' '); return [key, Buffer.from(value, 'base64').toString()];
  }));
  assert.equal(metadata.codProceso, '3'); assert.equal(metadata.codOrigenEnvio, '2');
  assert.equal(metadata.codLibro, '140000'); assert.equal(metadata.codTipoCorrelativo, '01');
  assert.equal(metadata.perTributario, '202409'); assert.equal(metadata.numRuc, p.documentoId);
  assert.equal(e.calls[1].url, location); assert.equal(e.calls[1].opts.method, 'PATCH');
  assert.equal(e.calls[1].opts.headers['Upload-Offset'], '0');
  assert.equal(e.calls[1].opts.headers['Content-Type'], 'application/offset+octet-stream');
  assert.deepEqual(e.calls[1].opts.body, Buffer.from('ZIP')); assert.equal(e.guardadas.length, 1);
});
test('cliente divide archivo en bloques, verifica offsets y no sigue redirecciones', async () => {
  const size = 5 * 1024 * 1024;
  const e = cliente([respuesta(201, null, { location }), respuesta(204, null, { 'upload-offset': String(size) }),
    respuesta(200, { numTicket: 'REEMPLAZO3' }, { 'upload-offset': String(size + 1) })]);
  await e.service.enviarArchivo({ ...e.params, buffer: Buffer.alloc(size + 1) });
  assert.equal(e.calls.length, 3); assert.equal(e.calls[2].opts.headers['Upload-Offset'], String(size));
  assert.equal(e.calls[2].opts.redirect, 'error');
});
test('cliente no expone credenciales a Location ajena y marca protocolo incierto sin reenviar', async () => {
  for (const loc of ['https://otro.test/robar-token', '/ruta-distinta/id']) {
    const e = cliente([respuesta(201, null, { location: loc })]);
    await assert.rejects(e.service.enviarArchivo(e.params), (err) => err.resultadoIncierto === true);
    assert.equal(e.calls.length, 1);
  }
  for (const final of [respuesta(200, { numTicket: 'REEMPLAZO3' }, { 'upload-offset': '2' }),
    respuesta(204, null, { 'upload-offset': '3' }), new Error('timeout')]) {
    const e = cliente([respuesta(201, null, { location }), final]);
    await assert.rejects(e.service.enviarArchivo(e.params), (err) => err.resultadoIncierto === true);
    assert.equal(e.calls.length, 2);
  }
});
test('cliente distingue validacion 422 de timeout y fallo SUNAT 5xx', async () => {
  for (const [r, incierto] of [[respuesta(422, { msg: 'Nombre invalido', errors: [{ cod: '1044' }] }), false],
    [respuesta(503, { msg: 'No disponible' }), true], [new Error('timeout'), true]]) {
    const e = cliente([r]);
    await assert.rejects(e.service.enviarArchivo(e.params), (err) => err.resultadoIncierto === incierto);
    assert.equal(e.calls.length, 1);
  }
});
test('repositorio conserva binario y contexto; lecturas publicas excluyen archivo y respuesta SUNAT', async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id_reemplazo: id }] }; } };
  const repo = cargar('../src/repositories/sire/sireReemplazo.repository.js', {
    '../../db': db, './sireAceptacion.repository': {},
  });
  await repo.obtenerUltimo(p);
  assert.doesNotMatch(calls[0].sql, /archivo_zip|respuesta_sunat|url_carga/);
  await repo.preparar(p, { buffer: Buffer.from('COPIA'), nombreArchivo: 'rvie.zip', hash, cantidad: 1 }, id, db);
  assert.deepEqual(Array.from(calls[1].params.slice(0, 5)), [p.idAnfitrion, p.documentoId, p.periodo, p.idLibro, id]);
  assert.deepEqual(calls[1].params[7], Buffer.from('COPIA'));
  await repo.actualizar(p, { id_reemplazo: id }, { estado: 'ENVIADO', ticket: 'REEMPLAZO3', respuesta: { numTicket: 'REEMPLAZO3' } }, db);
  assert.match(calls[2].sql, /id_reemplazo=\$5/);
  assert.equal(calls[2].params[9], '{"numTicket":"REEMPLAZO3"}');
  assert.doesNotMatch(calls.map((c) => c.sql).join('\n'), /UPDATE.*mct_contabilidadticket|UPDATE.*mve_sire_aceptacion/);
});

test('HTTP multipart prepara, descarga copia y POST JSON envia con contrato 201/202/200', async (t) => {
  const express = require('express');
  const http = require('node:http');
  let enviado = false;
  const controller = cargar('../src/controllers/transporte/sireReemplazo.controller.js', {
    '../../services/transporte/sireReemplazo.service': {
      prepararReemplazo: async (params) => {
        assert.equal(params.idAnfitrion, 'U');
        const preparado = prepararArchivo(params);
        return { success: true, estado: 'PREPARADO', id_reemplazo: id, hash_archivo: preparado.hash };
      },
      enviarReemplazo: async (params) => {
        assert.equal(params.confirmar, true); assert.equal(params.idReemplazo, id);
        const result = { success: true, estado: 'ENVIADO', ticket_reemplazo: 'REEMPLAZO3', reutilizado: enviado };
        enviado = true; return result;
      },
      descargarArchivo: async (params) => {
        assert.equal(params.idReemplazo, id);
        return { buffer: Buffer.from('ZIP_GUARDADO'), nombreArchivo: 'copia.zip' };
      },
      obtenerReemplazo: async () => ({ success: true, estado: 'PREPARADO' }),
      consultarEstado: async () => { throw Object.assign(new Error('Verifica SUNAT'), { statusCode: 409, estado: 'INCIERTO' }); },
    },
  });
  const router = cargar('../src/routes/sireReemplazo.routes.js', {
    express, multer: require('multer'), '../services/sire/sireReemplazoArchivo.service': { MAX_BYTES },
    '../controllers/transporte/sireReemplazo.controller': controller,
  });
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (method, url, body, contentType) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method,
      path: '/transporte/sire/propuesta/' + url, headers: body ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
      const parts = []; res.on('data', (part) => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString() }));
    });
    req.on('error', reject); req.end(body);
  });
  const boundary = 'sire-boundary';
  const fields = { id_anfitrion: 'U', documento_id: p.documentoId, periodo: p.periodo };
  const multipart = Object.entries(fields).map(([key, value]) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`).join('')
    + `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: text/plain\r\n\r\n${linea()}\r\n--${boundary}--\r\n`;
  const preparado = await request('POST', 'reemplazo/preparar', multipart, `multipart/form-data; boundary=${boundary}`);
  assert.equal(preparado.status, 201); assert.equal(JSON.parse(preparado.body).estado, 'PREPARADO');
  const body = JSON.stringify({ ...fields, confirmar: true, id_reemplazo: id, hash_archivo: hash });
  assert.equal((await request('POST', 'reemplazar', body, 'application/json')).status, 202);
  assert.equal((await request('POST', 'reemplazar', body, 'application/json')).status, 200);
  const descarga = await request('GET', `reemplazo/archivo/${p.periodo}/U/${p.documentoId}?id_reemplazo=${id}&hash_archivo=${hash}`);
  assert.equal(descarga.status, 200); assert.equal(descarga.body, 'ZIP_GUARDADO');
  assert.equal(descarga.headers['content-type'], 'application/zip');
  const consulta = await request('POST', 'reemplazo/estado', body, 'application/json');
  assert.equal(consulta.status, 409); assert.equal(JSON.parse(consulta.body).estado, 'INCIERTO');
});
const venta = (cambios = {}) => ({ r_cod: '01', r_serie: 'F001', r_numero: '1',
  r_fecemi: '2024-09-01', cliente_id_doc: '6', cliente_documento_id: '20123456789', cliente: 'CLIENTE',
  r_gravado: '100.00', r_igv: '18.00', r_exonerado: '0.00', r_monto_total: '118.00', ...cambios });
const { generarArchivo } = require('../src/services/transporte/sireReemplazoGenerador.service');
const generar = (ventas) => generarArchivo({ ...p, razonSocial: 'EMPRESA', ventas });
const leerGenerado = (archivo) => new AdmZip(archivo.buffer).getEntries()[0].getData().toString().trim().split('\r\n').map((r) => r.split('|'));
test('generador suma elementos con centimos exactos, respeta datos del cliente y no duplica comprobantes', () => {
  const a = generar([venta(), venta({ r_gravado: '0.10', r_igv: '0.02', r_monto_total: '0.12' })]);
  assert.equal(a.cantidad, 1); assert.equal(a.resumen.total, '118.12');
  const [row] = leerGenerado(a);
  assert.equal(row[25], '118.12'); assert.equal(row[14], '100.10'); assert.equal(row[26], 'PEN');
  assert.equal(row[12], 'CLIENTE'); assert.equal(row[4], '01/09/2024');
});
test('generador anota anulados en cero y notas de credito negativas con referencia original', () => {
  const a = generar([venta({ registrado: 0 }), venta({ r_cod_ref: '07', r_serie_ref: 'FC01', r_numero_ref: '2', r_fecemi_ref: '2024-09-01' })]);
  const rows = leerGenerado(a);
  assert.equal(rows[0][25], '0.00'); assert.equal(rows[1][25], '-118.00');
  assert.equal(rows[1][29], '01'); assert.equal(rows[1][30], 'F001'); assert.equal(rows[1][31], '1');
});
test('generador bloquea moneda no soportada, importes descuadrados, notas incompletas y datos divergentes', () => {
  for (const ventas of [[venta({ r_moneda: 'USD' })], [venta({ r_igv: '17' })],
    [venta({ r_cod_ref: '07', r_serie_ref: 'FC01', r_numero_ref: '2' })], [venta(), venta({ cliente: 'OTRO' })]]) {
    assert.throws(() => generar(ventas), (error) => error.statusCode === 409);
  }
  assert.equal(generar([]).cantidad, 0);
});
test('envio generado exige confirmar alcance y detecta cambios posteriores a la revision', async () => {
  const e = entorno({ previo: null, ventas: [venta()] });
  const listo = await e.service.prepararReemplazo(p);
  assert.equal(listo.fuente, 'TRANSPORTE');
  const envio = { ...p, idReemplazo: listo.id_reemplazo, hashArchivo: listo.hash_archivo };
  await assert.rejects(e.service.enviarReemplazo(envio), (error) => error.statusCode === 400);
  assert.equal(e.envios(), 0);
  assert.equal((await e.service.enviarReemplazo({ ...envio, confirmarAlcance: true })).estado, 'ENVIADO');
  const modificado = entorno({ previo: { fuente: 'TRANSPORTE' }, ventas: [venta()] });
  await assert.rejects(modificado.service.enviarReemplazo({ ...p, confirmarAlcance: true }), /cambiaron/);
  assert.equal(modificado.envios(), 0);
});
test('conciliacion solo asocia ticket confirmado de proceso, archivo, periodo y momento del intento', async () => {
  const previo = { estado: 'INCIERTO', fecha_solicitud: '2024-09-15T12:00:00-05:00' };
  const ticket = { numTicket: 'RECUPERADO3', perTributario: '202409', codProceso: 3,
    nomArchivoImportacion: nombre.replace('.txt', '.zip'), fecCargaImportacion: '15/09/2024T12:00:01', codEstadoProceso: '02' };
  const e = entorno({ previo, estados: [ticket] });
  const r = await e.service.conciliarReemplazo({ ...p, ticketReemplazo: 'RECUPERADO3' });
  assert.equal(r.ticket_reemplazo, 'RECUPERADO3'); assert.equal(r.estado, 'ENVIADO'); assert.equal(e.envios(), 0);
  for (const cambio of [{ codProceso: 2 }, { perTributario: '202408' }, { nomArchivoImportacion: 'OTRO.zip' },
    { fecCargaImportacion: '14/09/2024T12:00:00' }]) {
    const x = entorno({ previo, estados: [{ ...ticket, ...cambio }] });
    await assert.rejects(x.service.conciliarReemplazo({ ...p, ticketReemplazo: 'RECUPERADO3' }), (error) => error.statusCode === 409);
    assert.equal(x.registro().estado, 'INCIERTO');
  }
});

test('sincronizacion invalida historial, guarda ticket nuevo y reanuda descarga sin volver a reemplazar', async () => {
  const orden = [];
  let persistido = { id_reemplazo: id, estado: 'TERMINADO', estado_actualizacion: 'PENDIENTE' };
  let disponible = false;
  const service = cargar('../src/services/transporte/sireReemplazoActualizacion.service.js', {
    '../../repositories/sire/sireReemplazo.repository': {
      invalidarPropuestas: async () => orden.push('INVALIDAR'),
      guardarActualizacion: async (params, registro, datos) => {
        persistido = { ...registro, estado_actualizacion: datos.estado,
          ticket_actualizacion: datos.ticket || registro.ticket_actualizacion, id_propuesta_actualizada: datos.idPropuesta };
        orden.push(datos.estado); return persistido;
      },
    },
    '../sire/sireSunatClient.service': {
      generarTicketPropuestaSire: async () => { orden.push('GENERAR_DESCARGA'); return { ticket: 'NUEVA10' }; },
      consultarEstadoTicketSire: async () => ({ registros: disponible ? [{ numTicket: 'NUEVA10', perTributario: '202409',
        codProceso: 10, codEstadoProceso: '06', archivoReporte: [{ nomArchivoReporte: 'nueva.zip' }] }] : [] }),
      descargarPropuestaSire: async () => { orden.push('DESCARGAR'); return { buffer: Buffer.from('ZIP') }; },
    },
    '../sire/sirePropuestaStore.service': { guardarPropuestaVentasSire: async (params) => {
      assert.equal(params.ticket, 'NUEVA10'); assert.ok(params.db); orden.push('IMPORTAR'); return { id_propuesta: 'NUEVA' };
    } },
  });
  await service.sincronizarReemplazo(p, persistido, {});
  assert.deepEqual(orden, ['INVALIDAR', 'GENERAR_DESCARGA', 'PENDIENTE']);
  disponible = true;
  const r = await service.sincronizarReemplazo(p, persistido, {});
  assert.equal(r.estado_actualizacion, 'ACTUALIZADO'); assert.equal(r.id_propuesta_actualizada, 'NUEVA');
  assert.equal(orden.filter((a) => a === 'GENERAR_DESCARGA').length, 1);
  const antes = orden.length;
  await service.sincronizarReemplazo(p, r, {}); assert.equal(orden.length, antes);
});
test('fallo de actualizacion conserva reemplazo TERMINADO y permite reanudar sin reenviar', async () => {
  const service = cargar('../src/services/transporte/sireReemplazoActualizacion.service.js', {
    '../../repositories/sire/sireReemplazo.repository': {
      invalidarPropuestas: async () => {},
      guardarActualizacion: async (params, r, datos) => ({ ...r, estado_actualizacion: datos.estado, error_actualizacion: datos.error }),
    },
    '../sire/sireSunatClient.service': { consultarEstadoTicketSire: async () => { throw Error('SUNAT no disponible'); } },
    '../sire/sirePropuestaStore.service': {},
  });
  const r = await service.sincronizarReemplazo(p, { estado: 'TERMINADO', ticket_actualizacion: 'NUEVA10' }, {});
  assert.equal(r.estado, 'TERMINADO'); assert.equal(r.estado_actualizacion, 'ERROR'); assert.match(r.error_actualizacion, /no disponible/);
});
test('importacion bloquea tickets anteriores tras reemplazo y conserva detalle del historial', async () => {
  const consultas = [];
  const db = { query: async (sql) => {
    consultas.push(sql);
    if (sql.includes('to_regclass')) return { rows: [{ tabla: 'mve_sire_reemplazo' }] };
    if (sql.includes('SELECT ticket_actualizacion')) return { rows: [{ ticket_actualizacion: 'NUEVA10' }] };
    if (sql.includes('SELECT id_propuesta')) return { rows: [] };
    if (sql.includes('INSERT INTO public.mve_sire_propuesta (')) return { rows: [{ id_propuesta: 'NUEVA' }] };
    return { rows: [] };
  } };
  const store = cargar('../src/services/sire/sirePropuestaStore.service.js', {
    'adm-zip': AdmZip, '../../db': { connect: async () => { throw Error('No debe adquirir otra conexion'); } },
    '../../utils/libreria.utils': { convertirFechaStringComplete: (v) => v ? v.split('/').reverse().join('-') : null, corregirTCPEN: () => '1' },
  });
  const entrada = { ...p, idLibro: '140000', buffer: Buffer.from('CABECERA\n' + linea()), nombreArchivo: 'propuesta.txt', db };
  await assert.rejects(store.guardarPropuestaVentasSire({ ...entrada, ticket: 'ANTERIOR10' }), (e) => e.statusCode === 409);
  assert.ok(consultas.some((sql) => sql.includes('advisory_xact_lock')));
  assert.ok(!consultas.some((sql) => sql.includes('DELETE')));
  const resultado = await store.guardarPropuestaVentasSire({ ...entrada, ticket: 'NUEVA10' });
  assert.equal(resultado.id_propuesta, 'NUEVA'); assert.equal(resultado.cantidad_registros, 1);
  assert.ok(!consultas.some((sql) => sql.includes('DELETE')));
});
test('comparacion bloqueada mientras la propuesta nueva no esta importada', async () => {
  let consultas = 0;
  const repo = cargar('../src/repositories/transporte/sire.repository.js', { '../../db': { query: async (sql) => {
    consultas++;
    if (sql.includes('to_regclass')) return { rows: [{ tabla: 'mve_sire_reemplazo' }] };
    if (sql.includes('actualizacion')) return { rows: [{ actualizacion: 'PENDIENTE' }] };
    throw Error('No debe comparar contra historial');
  } } });
  await assert.rejects(repo.obtenerComparacionSireTransporteQuery(p), (e) => e.statusCode === 409);
  assert.equal(consultas, 2);
});
test('rechazo explicito de descarga permite un ticket nuevo al actualizar sin repetir el reemplazo', async () => {
  for (const detalle of [false, true]) {
    let actual = { id_reemplazo: id, estado: 'TERMINADO', ticket_reemplazo: 'REEMPLAZO3',
      ticket_actualizacion: 'RECHAZADA10', estado_actualizacion: 'PENDIENTE' };
    let generados = 0;
    const consultados = [];
    const service = cargar('../src/services/transporte/sireReemplazoActualizacion.service.js', {
      '../../repositories/sire/sireReemplazo.repository': {
        invalidarPropuestas: async () => {},
        guardarActualizacion: async (params, r, datos) => {
          actual = { ...r, estado_actualizacion: datos.estado, error_actualizacion: datos.error,
            ticket_actualizacion: datos.reiniciarTicket ? null : datos.ticket || r.ticket_actualizacion };
          return actual;
        },
      },
      '../sire/sireSunatClient.service': {
        generarTicketPropuestaSire: async (params) => {
          assert.equal(params.reutilizarExistente, false); generados++; return { ticket: 'NUEVA10' };
        },
        consultarEstadoTicketSire: async (params) => {
          consultados.push(params.ticket);
          return { registros: [{ numTicket: params.ticket, perTributario: '202409', codProceso: 10,
            codEstadoProceso: params.ticket === 'RECHAZADA10' && !detalle ? '03' : '02',
            detalleTicket: { codEstadoEnvio: params.ticket === 'RECHAZADA10' && detalle ? '03' : '02' } }] };
        },
      },
      '../sire/sirePropuestaStore.service': {},
    });
    const rechazo = await service.sincronizarReemplazo(p, actual, {});
    assert.equal(rechazo.estado, 'TERMINADO'); assert.equal(rechazo.ticket_reemplazo, 'REEMPLAZO3');
    assert.equal(rechazo.estado_actualizacion, 'ERROR'); assert.equal(rechazo.ticket_actualizacion, null);
    assert.equal(generados, 0);
    const nuevo = await service.sincronizarReemplazo(p, rechazo, {});
    assert.equal(nuevo.ticket_actualizacion, 'NUEVA10'); assert.equal(nuevo.estado_actualizacion, 'PENDIENTE');
    assert.equal(nuevo.ticket_reemplazo, 'REEMPLAZO3'); assert.equal(generados, 1);
    await service.sincronizarReemplazo(p, nuevo, {});
    assert.equal(generados, 1);
    assert.deepEqual(consultados, ['RECHAZADA10', 'NUEVA10', 'NUEVA10']);
  }
});
test('timeout de descarga mantiene ticket y no solicita otro', async () => {
  let generados = 0;
  const service = cargar('../src/services/transporte/sireReemplazoActualizacion.service.js', {
    '../../repositories/sire/sireReemplazo.repository': {
      invalidarPropuestas: async () => {},
      guardarActualizacion: async (params, r, datos) => {
        assert.equal(datos.reiniciarTicket, false);
        return { ...r, estado_actualizacion: datos.estado };
      },
    },
    '../sire/sireSunatClient.service': {
      generarTicketPropuestaSire: async () => { generados++; },
      consultarEstadoTicketSire: async () => { throw Error('timeout'); },
    },
    '../sire/sirePropuestaStore.service': {},
  });
  const r = await service.sincronizarReemplazo(p, { estado: 'TERMINADO', ticket_actualizacion: 'MISMO10', ticket_reemplazo: 'REEMPLAZO3' }, {});
  assert.equal(r.ticket_actualizacion, 'MISMO10'); assert.equal(r.ticket_reemplazo, 'REEMPLAZO3');
  assert.equal(generados, 0);
});
test('repositorio solo borra ticket de descarga con reinicio explicito', async () => {
  const llamadas = [];
  const db = { query: async (sql, params) => { llamadas.push({ sql, params }); return { rows: [{}] }; } };
  const repo = cargar('../src/repositories/sire/sireReemplazo.repository.js', {
    '../../db': db, './sireAceptacion.repository': {},
  });
  await repo.guardarActualizacion(p, { id_reemplazo: id }, { estado: 'ERROR', reiniciarTicket: true, error: 'Rechazada' }, db);
  await repo.guardarActualizacion(p, { id_reemplazo: id }, { estado: 'ERROR', error: 'Timeout' }, db);
  assert.match(llamadas[0].sql, /ticket_actualizacion=CASE WHEN \$10 THEN NULL ELSE COALESCE/);
  assert.equal(llamadas[0].params[9], true); assert.equal(llamadas[1].params[9], false);
  assert.doesNotMatch(llamadas[0].sql, /ticket_reemplazo\s*=/);
});

test('recupera reemplazo de anfitrion correo de mas de 20 caracteres sin enviar a SUNAT', async () => {
  const e = entorno({ previo: null });
  const resultado = await e.service.obtenerReemplazo({ ...p, idAnfitrion: 'luceliariveracdsl@gmail.com' });
  assert.equal(resultado.estado, 'SIN_ENVIO');
  assert.equal(e.envios(), 0);
  assert.equal(e.consultas(), 0);
  await assert.rejects(e.service.obtenerReemplazo({ ...p, idAnfitrion: 'x'.repeat(61) }),
    (error) => error.statusCode === 400);
});
