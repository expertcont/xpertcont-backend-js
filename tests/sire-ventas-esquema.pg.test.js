const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// Solo PostgreSQL efimero: no carga src/db ni consulta SUNAT.
test('SIRE Ventas: esquema nuevo, notas, aceptacion y reemplazo', {
  skip: !process.env.SIRE_PGLITE_MODULE,
}, async () => {
  const { PGlite } = require(process.env.SIRE_PGLITE_MODULE);
  const pg = new PGlite();
  const query = async (sql, params) => {
    try {
      if (!params && sql.includes(';')) {
        const result = await pg.exec(sql);
        return result.at(-1) || { rows: [] };
      }
      const result = await pg.query(sql, params);
      result.rows = result.rows.map(row => Object.fromEntries(Object.entries(row)
        .map(([k, v]) => [k, v instanceof Uint8Array ? Buffer.from(v) : v])));
      return result;
    } catch (error) {
      error.message += ' [SQL: ' + sql.slice(0, 160) + ']';
      delete error.query; delete error.params; throw error;
    }
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const root = path.resolve(__dirname, '..');
  const cache = new Map();
  let aceptaciones = 0;
  const sunat = {
    normalizarIdLibroSire: v => v === '014' ? '140000' : v,
    aceptarPropuestaRvieSire: async () => { aceptaciones++; return { ticket: 'A1' }; },
  };
  function cargar(relative) {
    const filename = path.resolve(root, relative);
    if (filename === path.join(root, 'src/db.js')) return pool;
    if (filename === path.join(root, 'src/services/sire/sireSunatClient.service.js')) return sunat;
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, mod);
    const realRequire = Module.createRequire(filename);
    mod.require = id => {
      const resolved = realRequire.resolve(id);
      return resolved.startsWith(path.join(root, 'src') + path.sep)
        ? cargar(resolved) : realRequire(id);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename);
    return mod.exports;
  }
  const p = { idAnfitrion: 'contador@example.com', documentoId: '20123456789', periodo: '2024-09', idLibro: '140000' };
  const contexto = [p.idAnfitrion, p.documentoId, p.periodo];
  const documentos = [
    ['01', 'F001', '123', '01', '100.00', '18.00', '118.00'],
    ['07', 'FC01', '1', '03', '-10.00', '-1.80', '-11.80'],
    ['07', 'FC01', '2', '04', '-20.00', '-3.60', '-23.60'],
    ['08', 'FD01', '1', '05', '5.00', '0.90', '5.90'],
    ['07', 'FC02', '9', '06', '-2.00', '-0.36', '-2.36'],
  ];
  const archivo = () => {
    const filas = documentos.map(([tipo, serie, numero, dia, base, igv, total]) => {
      const r = Array(33).fill('');
      Object.assign(r, { 0: p.documentoId, 1: 'EMPRESA', 2: '202409', 3: 'CAR' + numero,
        4: dia + '/09/2024', 6: tipo, 7: serie, 8: numero, 10: '6', 11: '20999999999',
        12: 'CLIENTE', 14: base, 16: igv, 25: total, 26: 'PEN', 27: '1' });
      if (tipo === '07' || tipo === '08') Object.assign(r, { 28: '01/09/2024', 29: '01', 30: 'F001', 31: '123' });
      return r.join('|');
    });
    return Buffer.from('RUC|' + Array(32).fill('CABECERA').join('|') + '\r\n' + filas.join('\r\n'));
  };
  try {
    await pg.exec(fs.readFileSync(path.join(root, 'docs/sql/sire_recrear_cabecera_detalle.sql'), 'utf8'));
    await pg.exec(`CREATE TABLE mct_contabilidadticket(id_usuario CHAR(60),documento_id CHAR(20),periodo CHAR(10),id_libro CHAR(6),sire_tpropuesta VARCHAR(50),sire_tpropuesta_fecha_generacion TIMESTAMPTZ);
      CREATE TABLE mad_usuario(id_usuario VARCHAR(50),rubro VARCHAR(20));
      CREATE TABLE mad_usuariocontabilidad(id_usuario VARCHAR(50),documento_id VARCHAR(20),razon_social TEXT);
      CREATE TABLE mve_transventa(id_usuario VARCHAR(50),documento_id VARCHAR(20),periodo VARCHAR(10),r_cod VARCHAR(2),r_serie VARCHAR(5),r_numero VARCHAR(22),elemento INTEGER,
        r_fecemi DATE,r_fecemi_ref DATE,r_cod_ref VARCHAR(2),r_serie_ref VARCHAR(5),r_numero_ref VARCHAR(22),registrado INTEGER,tipo_operacion CHAR(1),cliente_id_doc VARCHAR(2),cliente_documento_id VARCHAR(20),cliente TEXT,
        r_gravado NUMERIC(14,2),r_exonerado NUMERIC(14,2),r_igv NUMERIC(14,2),r_monto_total NUMERIC(14,2),precio_neto NUMERIC(14,2),r_moneda VARCHAR(5),r_tc NUMERIC(10,4),
        r_vfirmado TEXT,numero_rdi TEXT,cdr_descripcion TEXT,cdr_codigo TEXT,cdr_nivel TEXT,estado_sunat TEXT);
      CREATE TABLE mve_rdi_sunat(id_usuario VARCHAR(50),documento_id VARCHAR(20),numero_rdi TEXT,ticket TEXT,estado TEXT,respuesta_codigo TEXT,respuesta_desc TEXT);`);
    await query('INSERT INTO mct_contabilidadticket VALUES($1,$2,$3,$4,$5,clock_timestamp())', [...contexto, p.idLibro, 'T1']);
    await query('INSERT INTO mad_usuariocontabilidad VALUES($1,$2,$3)', [p.idAnfitrion, p.documentoId, 'EMPRESA']);
    await query("INSERT INTO mad_usuario VALUES($1,'TRANSPORTE')", [p.idAnfitrion]);
    for (let i = 0; i < documentos.length; i++) {
      const [tipo, serie, numero, dia, base, igv, total] = documentos[i];
      const directa = i === 0 || i === 4;
      await query(`INSERT INTO mve_transventa(id_usuario,documento_id,periodo,r_cod,r_serie,r_numero,elemento,r_fecemi,r_cod_ref,r_serie_ref,r_numero_ref,r_fecemi_ref,
        registrado,tipo_operacion,cliente_id_doc,cliente_documento_id,cliente,r_gravado,r_exonerado,r_igv,r_monto_total,precio_neto,r_moneda,r_tc)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,'E','6','20999999999','CLIENTE',$13,0,$14,$15,$15,'PEN',1)`,
      [...contexto, directa ? tipo : '01', directa ? serie : 'F001', directa ? numero : '123', i + 1,
        directa ? '2024-09-' + dia : '2024-09-01', i === 0 ? null : directa ? '01' : tipo,
        i === 0 ? null : directa ? 'F001' : serie, i === 0 ? null : directa ? '123' : numero,
        i === 0 ? null : directa ? '2024-09-01' : '2024-09-' + dia,
        Math.abs(Number(base)), Math.abs(Number(igv)), Math.abs(Number(total))]);
    }
    const store = cargar('src/services/sire/sirePropuestaStore.service.js');
    const repo = cargar('src/repositories/transporte/sire.repository.js');
    const service = cargar('src/services/transporte/sire.service.js');
    const bytes = archivo();
    const importacion = await store.guardarPropuestaVentasSire({ ...p, ticket: 'T1', nombreArchivo: 'rvie.txt', buffer: bytes });
    assert.equal(importacion.id_propuesta, 'T1');
    assert.equal(importacion.cantidad_registros, 5);
    assert.equal((await repo.obtenerComparacionSireTransporteQuery(p)).length, 0);
    const registro = await repo.obtenerRegistroSireTransporteQuery([p.periodo, p.idAnfitrion, p.documentoId]);
    assert.equal(registro.filter(r => r.tipo_comprobante === '07').length, 3);
    assert.ok(registro.filter(r => r.tipo_comprobante === '07').every(r => Number(r.total) < 0));
    assert.equal((await service.obtenerUltimaPropuestaSireTransporte(p)).importacion.id_propuesta, 'T1');
    const aceptacion = cargar('src/services/transporte/sireAceptacion.service.js');
    const entrada = { ...p, ticketPropuesta: 'T1', idPropuesta: 'T1', confirmar: true };
    assert.equal((await aceptacion.aceptarPropuesta(entrada)).estado, 'ENVIADO');
    await aceptacion.aceptarPropuesta(entrada);
    assert.equal(aceptaciones, 1);
    await query("UPDATE mve_sire_aceptacion SET estado='RECHAZADO'");
    const reemplazo = cargar('src/services/transporte/sireReemplazo.service.js');
    const preparado = await reemplazo.prepararReemplazo(p);
    assert.equal(preparado.cantidad_registros, 5);
    const replRepo = cargar('src/repositories/sire/sireReemplazo.repository.js');
    let control = await replRepo.obtenerUltimo(p);
    control = await replRepo.actualizar(p, control, { estado: 'TERMINADO', ticket: 'R3' }, pool);
    await replRepo.invalidarPropuestas(p, control, pool);
    control = await replRepo.guardarActualizacion(p, control, { estado: 'PENDIENTE', ticket: 'T2' }, pool);
    await query("UPDATE mct_contabilidadticket SET sire_tpropuesta='T2'");
    await store.guardarPropuestaVentasSire({ ...p, ticket: 'T2', nombreArchivo: 'rvie.txt', buffer: bytes });
    await replRepo.guardarActualizacion(p, control, { estado: 'ACTUALIZADO', ticket: 'T2' }, pool);
    assert.equal((await repo.obtenerComparacionSireTransporteQuery(p)).length, 0);
    assert.equal((await service.obtenerUltimaPropuestaSireTransporte(p)).ticket, 'T2');
    assert.deepEqual((await service.descargarPropuestaSireTransporte({ ...p, ticket: 'T1' })).buffer, bytes);
    await store.guardarPropuestaVentasSire({ ...p, ticket: 'T2', nombreArchivo: 'rvie.txt', buffer: bytes });
    assert.equal((await query('SELECT count(*)::int AS n FROM mve_sire_propuesta')).rows[0].n, 5);
    assert.equal((await query('SELECT count(*)::int AS n FROM mve_sire_propuesta_datos')).rows[0].n, 2);
    assert.equal(await repo.obtenerPropuestaGuardadaSireTransporteQuery({ ...p, idAnfitrion: 'otro', ticket: 'T2' }), null);
    // El mismo periodo y RUC comercial debe leer mve_venta, con correlativos rellenados.
    // La fuente de Transporte se elimina para detectar cualquier cruce accidental.
    await pg.exec(`CREATE TABLE mve_venta AS SELECT id_usuario,documento_id,periodo,r_cod,r_serie,
      LPAD(r_numero,10,'0')::varchar AS r_numero,elemento,r_fecemi,r_fecemi_ref,r_cod_ref,r_serie_ref,
      CASE WHEN r_numero_ref IS NULL THEN NULL ELSE LPAD(r_numero_ref,10,'0') END AS r_numero_ref,
      registrado,cliente_id_doc AS r_id_doc,cliente_documento_id AS r_documento_id,cliente AS r_razon_social,
      r_gravado AS r_base002,r_exonerado AS r_base003,0::numeric AS r_base004,r_igv AS r_igv002,
      r_monto_total,r_moneda,r_tc,r_vfirmado,numero_rdi,cdr_descripcion,cdr_codigo,cdr_nivel,
      'ACEPTADO'::varchar AS estado FROM mve_transventa;
      UPDATE mad_usuario SET rubro='COMERCIAL';
      TRUNCATE mve_transventa;`);
    const comercial = await repo.obtenerRegistroSireTransporteQuery([p.periodo,p.idAnfitrion,p.documentoId]);
    assert.equal(comercial.length,5);
    assert.equal((await repo.obtenerComparacionSireTransporteQuery(p)).length,0);
    // Las diferencias reales siguen apareciendo aunque la identidad coincida sin ceros.
    await query("UPDATE mve_venta SET r_monto_total=r_monto_total+1 WHERE r_cod='01' AND elemento=1");
    const diferencias = await repo.obtenerComparacionSireTransporteQuery(p);
    assert.equal(diferencias.length,1);
    assert.ok(diferencias[0].categoria.includes('TOTAL'));
  } finally { await pg.close(); }
});
