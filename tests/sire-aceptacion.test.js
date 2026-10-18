const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cargar(file, deps) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    module, exports: module.exports, Date, Intl, URLSearchParams,
    console: { error: () => {} },
    require: (n) => {
      if (!(n in deps)) throw new Error('Dependencia no simulada: ' + n);
      return deps[n];
    },
  });
  return module.exports;
}

const parametros = {
  idAnfitrion: 'U', documentoId: '20123456789', periodo: '2024-09', idLibro: '014',
  idPropuesta: 'DESCARGA1', ticketPropuesta: 'DESCARGA1', confirmar: true,
};

function entorno({ previo = null, propuesta, fallo, estadoSunat, noCandado = false, falloGuardado = false, reemplazoActivo = null } = {}) {
  let registro = previo && { id_aceptacion: '1', ...previo };
  let llamadas = 0, liberaciones = 0, escrituras = [], falloUnaVez = falloGuardado;
  const repo = {
    adquirirCandado: async () => noCandado ? null : { client: {}, lockKey: 'K' },
    liberarCandado: async () => { liberaciones++; },
    obtenerReemplazoActivo: async () => reemplazoActivo,
    obtenerAceptacion: async () => registro,
    registrarIntento: async (p, propuesta) => {
      registro = { id_aceptacion: '1', id_usuario: p.idAnfitrion, documento_id: p.documentoId,
        periodo: p.periodo, id_libro: p.idLibro, id_propuesta: propuesta.id_propuesta,
        ticket_propuesta: propuesta.ticket, estado: 'ENVIANDO', cantidad_registros: 12 };
      escrituras.push('ENVIANDO');
      return registro;
    },
    actualizarAceptacion: async (p, datos) => {
      if (falloUnaVez) { falloUnaVez = false; throw Error('Fallo de guardado'); }
      registro = { ...registro, estado: datos.estado, ticket_aceptacion: datos.ticket || registro.ticket_aceptacion,
        codigo_estado_sunat: datos.codigo, descripcion: datos.descripcion };
      escrituras.push(datos.estado);
      return registro;
    },
  };
  const service = cargar('../src/services/transporte/sireAceptacion.service.js', {
    '../../repositories/sire/sireAceptacion.repository': repo,
    '../../repositories/transporte/sire.repository': {
      obtenerPropuestaGuardadaSireTransporteQuery: async () => propuesta === undefined
        ? { id_propuesta: '7', ticket: 'DESCARGA1', estado: 'PARSEADO', cantidad_registros: 12 }
        : propuesta,
    },
    '../sire/sireSunatClient.service': {
      normalizarIdLibroSire: (l) => l === '014' ? '140000' : l,
      aceptarPropuestaRvieSire: async () => {
        llamadas++;
        assert.equal(registro.estado, 'ENVIANDO');
        if (fallo) throw fallo;
        return { ticket: 'ACEPTACION2', respuesta_sunat: { numTicket: 'ACEPTACION2' } };
      },
      consultarEstadoTicketSire: async (p) => {
        llamadas++;
        assert.equal(p.ticket, registro.ticket_aceptacion);
        return { registros: estadoSunat || [], respuesta_sunat: { registros: estadoSunat || [] } };
      },
    },
  });
  return { service, registro: () => registro, llamadas: () => llamadas, liberaciones: () => liberaciones, escrituras };
}

test('validaciones rechazan confirmar ausente, RUC, mes, futuro, libro y propuesta incompletos antes de llamar SUNAT', async () => {
  for (const cambio of [
    { confirmar: false }, { documentoId: '123' }, { periodo: '2024-13' }, { periodo: '2999-01' },
    { idLibro: '008' }, { ticketPropuesta: '' },
  ]) {
    const e = entorno();
    await assert.rejects(e.service.aceptarPropuesta({ ...parametros, ...cambio }), (error) => error.statusCode === 400);
    assert.equal(e.llamadas(), 0);
  }
});

test('propuesta ausente o desactualizada no se acepta y libera el candado', async () => {
  for (const propuesta of [null, { id_propuesta: '8', ticket: 'OTRA', estado: 'PARSEADO' },
    { id_propuesta: '7', ticket: 'DESCARGA1', estado: 'DESCARGADO' }]) {
    const e = entorno({ propuesta });
    await assert.rejects(e.service.aceptarPropuesta(parametros), (error) => error.statusCode === 409);
    assert.equal(e.llamadas(), 0);
    assert.equal(e.liberaciones(), 1);
  }
});

test('guarda el intento antes del POST y mantiene separados ambos tickets; repetir no reenvia', async () => {
  const e = entorno();
  const r = await e.service.aceptarPropuesta({ ...parametros, periodo: '202409' });
  assert.equal(r.estado, 'ENVIADO');
  assert.equal(r.ticket_propuesta, 'DESCARGA1');
  assert.equal(r.ticket_aceptacion, 'ACEPTACION2');
  assert.equal(r.periodo, '2024-09');
  assert.equal(r.completado, false);
  assert.deepEqual(e.escrituras, ['ENVIANDO', 'ENVIADO']);
  assert.equal((await e.service.aceptarPropuesta(parametros)).reutilizado, true);
  assert.equal(e.llamadas(), 1);
});

test('solicitudes concurrentes se bloquean sin enviar', async () => {
  const e = entorno({ noCandado: true });
  await assert.rejects(e.service.aceptarPropuesta(parametros), (error) => error.statusCode === 409);
  assert.equal(e.llamadas(), 0);
});

test('timeout queda INCIERTO y no permite otro POST', async () => {
  const e = entorno({ fallo: Object.assign(Error('Timeout'), { resultadoIncierto: true, statusCode: 503 }) });
  await assert.rejects(e.service.aceptarPropuesta(parametros), (error) => error.estado === 'INCIERTO');
  assert.equal(e.registro().estado, 'INCIERTO');
  await assert.rejects(e.service.aceptarPropuesta(parametros), (error) => error.statusCode === 409);
  assert.equal(e.llamadas(), 1);
});

test('fallo al guardar ticket conserva el ticket en respuesta y estado incierto', async () => {
  const e = entorno({ falloGuardado: true });
  await assert.rejects(e.service.aceptarPropuesta(parametros), (error) => error.ticketAceptacion === 'ACEPTACION2');
  assert.equal(e.registro().ticket_aceptacion, 'ACEPTACION2');
  assert.equal(e.registro().estado, 'INCIERTO');
});

test('rechazo 422 se guarda y un intento confirmado puede volver a ejecutarse', async () => {
  const e = entorno({ fallo: Object.assign(Error('Validacion SUNAT'), { statusCode: 422 }) });
  await assert.rejects(e.service.aceptarPropuesta(parametros), (error) => error.statusCode === 422);
  assert.equal(e.registro().estado, 'RECHAZADO');
  const reintento = entorno({ previo: e.registro() });
  assert.equal((await reintento.service.aceptarPropuesta(parametros)).estado, 'ENVIADO');
});

test('ENVIANDO previo al reinicio bloquea duplicados', async () => {
  const e = entorno({ previo: { estado: 'ENVIANDO' } });
  await assert.rejects(e.service.aceptarPropuesta(parametros), (error) => error.statusCode === 409);
  assert.equal(e.llamadas(), 0);
});

function registroSunat(codigo, cambios = {}) {
  return { numTicket: 'ACEPTACION2', perTributario: '202409', codProceso: '2',
    codEstadoProceso: codigo, desEstadoProceso: 'Estado SUNAT', ...cambios };
}

test('solo 06 completa; 04 sigue pendiente y 03 rechaza', async () => {
  for (const [codigo, esperado] of [['01', 'ENVIADO'], ['04', 'ENVIADO'], ['05', 'ENVIADO'], ['06', 'TERMINADO'], ['03', 'RECHAZADO']]) {
    const e = entorno({ previo: { estado: 'ENVIADO', ticket_aceptacion: 'ACEPTACION2' },
      estadoSunat: [registroSunat(codigo)] });
    const r = await e.service.consultarEstado(parametros);
    assert.equal(r.estado, esperado);
    assert.equal(r.completado, codigo === '06');
  }
});

test('ignora otro ticket, periodo o proceso; no marca la descarga como aceptacion', async () => {
  for (const cambio of [{ numTicket: 'DESCARGA1' }, { perTributario: '202408' }, { codProceso: '10' }]) {
    const e = entorno({ previo: { estado: 'ENVIADO', ticket_aceptacion: 'ACEPTACION2' },
      estadoSunat: [registroSunat('06', cambio)] });
    const r = await e.service.consultarEstado(parametros);
    assert.equal(r.encontrado, false);
    assert.equal(r.estado, 'ENVIADO');
  }
});

test('proceso 39 y error de detalle se interpretan correctamente', async () => {
  const e = entorno({ previo: { estado: 'ENVIADO', ticket_aceptacion: 'ACEPTACION2' },
    estadoSunat: [registroSunat('06', { codProceso: '39', detalleTicket: { codEstadoEnvio: '03' } })] });
  assert.equal((await e.service.consultarEstado(parametros)).estado, 'RECHAZADO');
});

test('sin envio se puede leer; intento sin ticket no se consulta con el ticket de descarga', async () => {
  const e = entorno();
  assert.equal((await e.service.obtenerAceptacion(parametros)).estado, 'SIN_ENVIO');
  const incierto = entorno({ previo: { estado: 'INCIERTO', ticket_propuesta: 'DESCARGA1' } });
  await assert.rejects(incierto.service.consultarEstado(parametros), (error) => error.statusCode === 409);
  assert.equal(incierto.llamadas(), 0);
});

function clienteConFetch(fetch) {
  return cargar('../src/services/sire/sireSunatClient.service.js', {
    'node-fetch': fetch,
    '../../repositories/sire/sire.repository': {
      obtenerCredencialesSire: async () => ({ sire_id: 'ID', sire_secret: 'SECRET', sire_sol: 'SOL', sire_solpwd: 'PWD' }),
    },
  });
}
const respuesta = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => data, text: async () => typeof data === 'string' ? data : JSON.stringify(data),
});

test('cliente usa POST oficial sin body; consulta incluye libro, origen y ticket escapado', async () => {
  const llamadas = [];
  const cliente = clienteConFetch(async (url, options) => {
    llamadas.push({ url, options });
    if (url.includes('oauth2')) return respuesta({ access_token: 'TOKEN_SIMULADO' });
    if (url.includes('aceptapropuesta')) return respuesta({ numTicket: '202401000001' });
    return respuesta({ registros: [] });
  });
  assert.equal((await cliente.aceptarPropuestaRvieSire(parametros)).ticket, '202401000001');
  const post = llamadas.find((c) => c.url.includes('aceptapropuesta'));
  assert.ok(post.url.endsWith('/202409/aceptapropuesta'));
  assert.equal(post.options.method, 'POST');
  assert.equal(post.options.body, undefined);
  assert.equal(post.options.headers.Authorization, 'Bearer TOKEN_SIMULADO');
  await cliente.consultarEstadoTicketSire({ ...parametros, ticket: 'A&B' });
  const url = new URL(llamadas.find((c) => c.url.includes('consultaestadotickets')).url);
  assert.equal(url.searchParams.get('numTicket'), 'A&B');
  assert.equal(url.searchParams.get('codLibro'), '140000');
  assert.equal(url.searchParams.get('codOrigenEnvio'), '2');
});

test('cliente distingue rechazo definitivo de resultado incierto, y no reintenta', async () => {
  for (const [data, status, incierto] of [
    [{ msg: 'Validacion', errors: [{ cod: '1006' }] }, 422, false],
    [{ msg: 'Servidor' }, 500, true],
    [{}, 200, true],
    ['HTML no JSON', 200, true],
  ]) {
    let post = 0;
    const cliente = clienteConFetch(async (url) => {
      if (url.includes('oauth2')) return respuesta({ access_token: 'T' });
      post++;
      return respuesta(data, status);
    });
    await assert.rejects(cliente.aceptarPropuestaRvieSire(parametros),
      (error) => Boolean(error.resultadoIncierto) === incierto);
    assert.equal(post, 1);
  }
});

test('HTTP distingue solicitud pendiente, repetida y resultado incierto', async () => {
  let recibidos;
  const controller = cargar('../src/controllers/transporte/sireAceptacion.controller.js', {
    '../../services/transporte/sireAceptacion.service': {
      aceptarPropuesta: async (p) => { recibidos = p; return { success: true, reutilizado: false, estado: 'ENVIADO' }; },
    },
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.aceptarPropuestaSireTransporte({ body: {
    id_anfitrion: 'U', documento_id: '20123456789', periodo: '2024-09',
    id_propuesta: '7', ticket_propuesta: 'D', confirmar: true,
  } }, res);
  assert.equal(res.code, 202);
  assert.equal(recibidos.idPropuesta, '7');
  assert.equal(recibidos.confirmar, true);
  const rechazo = cargar('../src/controllers/transporte/sireAceptacion.controller.js', {
    '../../services/transporte/sireAceptacion.service': {
      aceptarPropuesta: async () => { throw Object.assign(Error('Incierto'), { statusCode: 503, estado: 'INCIERTO', ticketAceptacion: 'A' }); },
    },
  });
  await rechazo.aceptarPropuestaSireTransporte({ body: {} }, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.ticket_aceptacion, 'A');
});

test('candado ocupado libera conexion; fallo al liberar destruye la conexion', async () => {
  for (const ocupado of [true, false]) {
    const releases = [];
    const client = {
      query: async (sql) => {
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: !ocupado }] };
        throw Error('Error liberando');
      },
      release: (destruir) => releases.push(destruir),
    };
    const repo = cargar('../src/repositories/sire/sireAceptacion.repository.js', {
      '../../db': { connect: async () => client },
    });
    const candado = await repo.adquirirCandado(parametros);
    if (ocupado) assert.equal(candado, null);
    else await repo.liberarCandado(candado);
    assert.equal(releases.length, 1);
    assert.equal(releases[0], ocupado ? undefined : true);
  }
});

test('propuesta y credenciales pueden consultarse en la conexion que sostiene el candado', async () => {
  const queries = [];
  const db = { query: async (sql) => { queries.push(sql); return { rows: [] }; } };
  const pool = { query: () => { throw Error('No se debe tomar otra conexion del pool'); } };
  const propuestas = cargar('../src/repositories/transporte/sire.repository.js', { '../../db': pool });
  const tickets = cargar('../src/repositories/sire/sire.repository.js', { '../../db': pool });
  await propuestas.obtenerPropuestaGuardadaSireTransporteQuery({ ...parametros, ticket: '' }, db);
  await tickets.obtenerCredencialesSire(parametros, db);
  assert.equal(queries.length, 2);
});

test('repositorio de aceptacion no actualiza el ticket de descarga y serializa respuesta como JSON', async () => {
  let llamada;
  const repo = cargar('../src/repositories/sire/sireAceptacion.repository.js', { '../../db': {} });
  const db = { query: async (sql, values) => { llamada = { sql, values }; return { rows: [{ estado: 'ENVIADO' }] }; } };
  await repo.actualizarAceptacion({ ...parametros, idLibro: '140000' }, {
    estado: 'ENVIADO', ticket: 'A', respuesta: { numTicket: 'A' },
  }, db);
  assert.ok(llamada.sql.includes('UPDATE public.mve_sire_aceptacion'));
  assert.ok(!llamada.sql.includes('mct_contabilidadticket'));
  assert.equal(llamada.values[5], 'A');
  assert.equal(JSON.parse(llamada.values[8]).numTicket, 'A');
});

test('un reemplazo activo impide aceptar y libera el candado sin invocar SUNAT', async () => {
  for (const estado of ['ENVIANDO', 'ENVIADO', 'INCIERTO', 'TERMINADO']) {
    const e = entorno({ reemplazoActivo: { estado, ticket_reemplazo: 'REEMPLAZO3' } });
    await assert.rejects(e.service.aceptarPropuesta(parametros), (error) => error.statusCode === 409);
    assert.equal(e.llamadas(), 0);
    assert.equal(e.liberaciones(), 1);
  }
});

test('recupera y acepta con anfitrion correo de mas de 20 caracteres sin truncarlo', async () => {
  const idAnfitrion = 'luceliariveracdsl@gmail.com';
  const e = entorno();
  assert.equal((await e.service.obtenerAceptacion({ ...parametros, idAnfitrion })).estado, 'SIN_ENVIO');
  assert.equal(e.llamadas(), 0);
  await e.service.aceptarPropuesta({ ...parametros, idAnfitrion });
  assert.equal(e.registro().id_usuario, idAnfitrion);
  await assert.rejects(e.service.obtenerAceptacion({ ...parametros, idAnfitrion: 'x'.repeat(61) }),
    (error) => error.statusCode === 400);
});
