const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Ventas y recaudacion: NC segun la fecha de referencia diaria o mensual', {
  skip: !process.env.SIRE_PGLITE_MODULE,
}, async (t) => {
  const { PGlite } = require(process.env.SIRE_PGLITE_MODULE);
  const pg = new PGlite();
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/venta.controllers.js'), 'utf8');
  const context = vm.createContext({ pool: pg, console });
  vm.runInContext(source.slice(
    source.indexOf('const obtenerRegistroTodos ='),
    source.indexOf('const obtenerRegistro ='),
  ) + source.slice(
    source.indexOf('const filtroNotasCreditoVentasSQL ='),
    source.indexOf('const obtenerTotalUnidades ='),
  ) + '\nthis.handlers = { obtenerTotalVentas, obtenerTotalRecaudacion, obtenerTotalVentasUsuario, obtenerRegistroTodos };', context);

  const consultar = async (handler, dia, periodo = '2026-10') => {
    let status = 200;
    let body;
    await context.handlers[handler]({ params: {
      periodo, id_anfitrion: 'empresa', id_invitado: 'empresa',
      documento_id: 'ruc', dia,
    } }, {
      status(value) { status = value; return this; },
      json(value) { body = value; },
    }, (error) => { throw error; });
    assert.equal(status, 200);
    return body;
  };

  try {
    await pg.exec(`CREATE TABLE mve_venta (
      periodo text, id_usuario text, documento_id text, registrado integer,
      r_cod text, r_fecemi date, r_fecemi_ref date, r_monto_total numeric,
      efectivo numeric, forma_pago2 text, efectivo2 numeric
    )`);
    // Columnas leidas por el endpoint real del listado que alimenta el Excel.
    await pg.exec(`ALTER TABLE mve_venta
      ADD r_cod_ref text, ADD r_serie text, ADD r_numero text,
      ADD r_serie_ref text, ADD r_numero_ref text, ADD r_fecvcto date,
      ADD r_id_doc text, ADD r_documento_id text, ADD r_razon_social text,
      ADD r_base001 numeric, ADD r_base002 numeric, ADD r_base003 numeric,
      ADD r_base004 numeric, ADD r_igv002 numeric, ADD r_monto_icbp numeric,
      ADD r_monto_otros numeric, ADD r_moneda text, ADD r_tc numeric,
      ADD glosa text, ADD r_vfirmado text, ADD cdr_descripcion text,
      ADD cdr_nivel text, ADD numero_rdi text, ADD gre_vfirmado text,
      ADD gre_cod text, ADD gre_serie text, ADD gre_numero text,
      ADD ctrl_crea_us text, ADD ctrl_crea text, ADD cdr_pendiente text,
      ADD elemento integer`);
    await pg.exec(`CREATE TABLE mve_ventadet (
      periodo text, id_usuario text, documento_id text, r_cod text, r_serie text,
      r_numero text, elemento integer, item integer, id_producto text,
      descripcion text, cantidad numeric
    ) PARTITION BY RANGE (periodo);
    CREATE TABLE mve_ventadet_202609 PARTITION OF mve_ventadet FOR VALUES FROM ('2026-09') TO ('2026-10');
    CREATE TABLE mve_ventadet_202610 PARTITION OF mve_ventadet FOR VALUES FROM ('2026-10') TO ('2026-11');`);

    const casos = [
      ['dia: referencia del mismo dia', '19', '2026-10-19', true],
      ['dia: referencia de otro dia', '19', '2026-10-15', false],
      ['dia: referencia de otro mes', '19', '2026-09-19', false],
      ['mes: referencia del mismo dia', '*', '2026-10-19', true],
      ['mes: referencia de otro dia del mes', '*', '2026-10-15', true],
      ['mes: referencia de otro mes', '*', '2026-09-19', false],
      ['mes: referencia del mismo mes de otro anio', '*', '2025-10-19', false],
      ['dia: referencia sin fecha', '19', null, false],
      ['mes: referencia sin fecha', '*', null, false],
    ];

    for (const [nombre, dia, referencia, descuenta] of casos) {
      await t.test(nombre, async () => {
        await pg.exec('TRUNCATE mve_venta');
        await pg.exec(`INSERT INTO mve_venta
          (periodo,id_usuario,documento_id,registrado,r_cod,r_fecemi,r_fecemi_ref,r_monto_total,efectivo,forma_pago2,efectivo2) VALUES
          ('2026-10', 'empresa', 'ruc', 1, '01', '2026-10-19', NULL, 1000, 600, 'TARJETA', 400),
          ('2026-10', 'empresa', 'ruc', 1, 'NP', '2026-10-19', NULL, 9999, 9999, 'TARJETA', 0),
          ('2026-10', 'otra-empresa', 'ruc', 1, '01', '2026-10-19', NULL, 9999, 9999, 'TARJETA', 0),
          ('2026-09', 'empresa', 'ruc', 1, '01', '2026-09-19', NULL, 9999, 9999, 'TARJETA', 0)`);
        await pg.query(`INSERT INTO mve_venta
          (periodo,id_usuario,documento_id,registrado,r_cod,r_fecemi,r_fecemi_ref,r_monto_total,efectivo,forma_pago2,efectivo2) VALUES
          ('2026-10', 'empresa', 'ruc', 1, '07', '2026-10-19', $1, -100, -60, 'TARJETA', -40)`, [referencia]);

        const total = await consultar('obtenerTotalVentas', dia);
        assert.equal(Number(total.total), descuenta ? 900 : 1000);
        const detalle = await consultar('obtenerTotalRecaudacion', dia);
        const montos = Object.fromEntries(detalle.data.map(row => [row.recaudacion, Number(row.monto)]));
        assert.equal(montos.EFECTIVO, descuenta ? 500 : 600);
        assert.equal(montos.TARJETA, 400);
        assert.equal(montos.EFECTIVO + montos.TARJETA, Number(total.total));
        const records = await consultar('obtenerTotalVentasUsuario', dia);
        assert.equal(records.data.reduce((suma, row) => suma + Number(row.monto), 0), Number(total.total));
      });
    }

    for (const [nombre, dia, referencia, descuenta] of casos) {
      await t.test(`NC en r_cod_ref: ${nombre}`, async () => {
        await pg.exec('TRUNCATE mve_venta');
        await pg.exec(`INSERT INTO mve_venta
          (periodo,id_usuario,documento_id,r_cod,r_fecemi,r_monto_total)
          VALUES ('2026-10','empresa','ruc','01','2026-10-19',1000)`);
        await pg.query(`INSERT INTO mve_venta
          (periodo,id_usuario,documento_id,r_cod,r_cod_ref,r_fecemi,r_fecemi_ref,r_monto_total,forma_pago2,efectivo2)
          VALUES ('2026-10','empresa','ruc','01','07','2026-10-19',$1,100,'TARJETA',40)`, [referencia]);
        const total = Number((await consultar('obtenerTotalVentas', dia)).total);
        assert.equal(total, descuenta ? 900 : 1000);
        const detalle = await consultar('obtenerTotalRecaudacion', dia);
        assert.equal(detalle.data.reduce((suma, row) => suma + Number(row.monto), 0), total);
        const records = await consultar('obtenerTotalVentasUsuario', dia);
        assert.equal(records.data.reduce((suma, row) => suma + Number(row.monto), 0), total);
      });
    }

    await t.test('septiembre: Excel real, caption y clic coinciden aunque los pagos esten incompletos', async () => {
      await pg.exec('TRUNCATE mve_venta');
      await pg.exec(`INSERT INTO mve_venta
        (periodo,id_usuario,documento_id,registrado,r_cod,r_cod_ref,r_fecemi,r_fecemi_ref,r_monto_total,efectivo,forma_pago2,efectivo2) VALUES
        ('2026-09','empresa','ruc',1,'01',NULL,'2026-09-10',NULL,1000,0,NULL,NULL),
        ('2026-09','empresa','ruc',1,'03',NULL,'2026-09-15',NULL,500,350,'TARJETA',200),
        ('2026-09','empresa','ruc',1,'07','01','2026-09-19','2026-09-10',-100,NULL,NULL,NULL),
        ('2026-09','empresa','ruc',1,'01','07','2026-09-20','2026-09-15',50,0,'TARJETA',20),
        ('2026-09','empresa','ruc',0,'NV',NULL,'2026-09-21',NULL,75,NULL,NULL,NULL)`);
      const listadoExcel = await consultar('obtenerRegistroTodos', '*', '2026-09');
      const sumaExcel = listadoExcel.reduce((suma, row) => suma + Number(row.r_monto_total), 0);
      const total = Number((await consultar('obtenerTotalVentas', '*', '2026-09')).total);
      const detalle = await consultar('obtenerTotalRecaudacion', '*', '2026-09');
      assert.equal(sumaExcel, 1425);
      assert.equal(total, sumaExcel);
      assert.equal(detalle.data.reduce((suma, row) => suma + Number(row.monto), 0), sumaExcel);
      const montos = Object.fromEntries(detalle.data.map(row => [row.recaudacion, Number(row.monto)]));
      assert.equal(montos.TARJETA, 200);
      assert.equal(montos.EFECTIVO, 1225);
    });

    await t.test('NC: solo r_monto_total, sin depender del signo almacenado ni de campos de pago', async () => {
      for (const [cod, codRef, monto] of [
        ['07', '01', 100], ['07', '01', -100],
        ['01', '07', 100], ['01', '07', -100],
      ]) {
        for (const [efectivo, pago2, efectivo2] of [
          [null, null, null], [0, null, 0], [999, 'TARJETA', 888],
        ]) {
          await pg.exec('TRUNCATE mve_venta');
          await pg.exec(`INSERT INTO mve_venta
            (periodo,id_usuario,documento_id,r_cod,r_fecemi,r_monto_total,efectivo,forma_pago2,efectivo2)
            VALUES ('2026-09','empresa','ruc','01','2026-09-19',1000,600,'TARJETA',400)`);
          await pg.query(`INSERT INTO mve_venta
            (periodo,id_usuario,documento_id,r_cod,r_cod_ref,r_fecemi,r_fecemi_ref,r_monto_total,efectivo,forma_pago2,efectivo2)
            VALUES ('2026-09','empresa','ruc',$1,$2,'2026-09-19','2026-09-19',$3,$4,$5,$6)`,
          [cod, codRef, monto, efectivo, pago2, efectivo2]);
          for (const dia of ['19', '*']) {
            const listado = await consultar('obtenerRegistroTodos', dia, '2026-09');
            assert.equal(listado.reduce((suma, row) => suma + Number(row.r_monto_total), 0), 900);
            assert.equal(Number((await consultar('obtenerTotalVentas', dia, '2026-09')).total), 900);
            const detalle = await consultar('obtenerTotalRecaudacion', dia, '2026-09');
            const montos = Object.fromEntries(detalle.data.map(row => [row.recaudacion, Number(row.monto)]));
            assert.equal(montos.EFECTIVO, 500);
            assert.equal(montos.TARJETA, 400);
          }
        }
      }
    });

    for (const tipo of ['elemento', 'directa']) {
      for (const [nombre, periodoOriginal, fechaOriginal, totalMes, totalDia29, totalDia30] of [
        ['caso reportado: factura 29/09 y NC 30/09', '2026-09', '2026-09-29', 0, 75, 0],
        ['factura y NC del mismo dia', '2026-09', '2026-09-30', 0, 0, 0],
        ['factura de agosto y NC de septiembre', '2026-08', '2026-08-29', 0, 0, 0],
      ]) {
        await t.test(`fecha de referencia nula (${tipo}): ${nombre}`, async () => {
          await pg.exec('TRUNCATE mve_venta');
          await pg.query(`INSERT INTO mve_venta
            (periodo,id_usuario,documento_id,r_cod,r_serie,r_numero,elemento,r_fecemi,r_monto_total,efectivo,efectivo2)
            VALUES ($1,'empresa','ruc','01','F001','0000420',1,$2,75,0,75)`,
          [periodoOriginal, fechaOriginal]);
          const esElemento = tipo === 'elemento';
          await pg.query(`INSERT INTO mve_venta
            (periodo,id_usuario,documento_id,r_cod,r_serie,r_numero,elemento,r_cod_ref,r_serie_ref,r_numero_ref,r_fecemi,r_fecemi_ref,r_monto_total,forma_pago2)
            VALUES ('2026-09','empresa','ruc',$1,'F001',$2,$3,$4,'F001',$5,'2026-09-30',NULL,75,'YAPE')`,
          [esElemento ? '01' : '07', esElemento ? '0000420' : '0000007', esElemento ? 2 : 1,
            esElemento ? '07' : '01', esElemento ? '0000007' : '0000420']);

          for (const [dia, esperado] of [['*', totalMes], ['29', totalDia29], ['30', totalDia30]]) {
            const total = Number((await consultar('obtenerTotalVentas', dia, '2026-09')).total);
            assert.equal(total, esperado);
            const detalle = await consultar('obtenerTotalRecaudacion', dia, '2026-09');
            assert.equal(detalle.data.reduce((suma, row) => suma + Number(row.monto), 0), esperado);
            const records = await consultar('obtenerTotalVentasUsuario', dia, '2026-09');
            assert.equal(records.data.reduce((suma, row) => suma + Number(row.monto), 0), esperado);
          }
          // Si la factura tambien es del dia 30, las dos filas participan y se cancelan.
          // Si es del 29 o de agosto, la NC se excluye del dia 30 por la regla diaria.
          const detalle30 = await consultar('obtenerTotalRecaudacion', '30', '2026-09');
          assert.equal(detalle30.data.length, fechaOriginal === '2026-09-30' ? 1 : 0);
        });
      }
    }

    await t.test('fecha original: no usar otra empresa ni reemplazar una referencia explicita', async () => {
      await pg.exec('TRUNCATE mve_venta');
      await pg.exec(`INSERT INTO mve_venta
        (periodo,id_usuario,documento_id,r_cod,r_serie,r_numero,elemento,r_cod_ref,r_fecemi,r_fecemi_ref,r_monto_total) VALUES
        ('2026-09','otra-empresa','ruc','01','F001','0000420',1,NULL,'2026-09-29',NULL,75),
        ('2026-09','empresa','otro-ruc','01','F001','0000420',1,NULL,'2026-09-29',NULL,75),
        ('2026-09','empresa','ruc','01','F001','0000420',2,'07','2026-09-30',NULL,75)`);
      assert.equal(Number((await consultar('obtenerTotalVentas', '*', '2026-09')).total), 0);
      await pg.exec(`INSERT INTO mve_venta
        (periodo,id_usuario,documento_id,r_cod,r_serie,r_numero,elemento,r_fecemi,r_monto_total)
        VALUES ('2026-09','empresa','ruc','01','F001','0000420',1,'2026-09-29',75)`);
      await pg.exec("UPDATE mve_venta SET r_fecemi_ref='2026-08-29' WHERE elemento=2");
      assert.equal(Number((await consultar('obtenerTotalVentas', '*', '2026-09')).total), 75);
    });

    await t.test('RECORDS: agrupar por correo de registro y descontar la NC del usuario que la registro', async () => {
      await pg.exec('TRUNCATE mve_venta');
      await pg.exec(`INSERT INTO mve_venta
        (periodo,id_usuario,documento_id,r_cod,r_serie,r_numero,elemento,r_cod_ref,r_fecemi,r_monto_total,ctrl_crea_us) VALUES
        ('2026-09','empresa','ruc','01','F001','0000001',1,NULL,'2026-09-29',100,'ana@example.com'),
        ('2026-09','empresa','ruc','01','F001','0000002',1,NULL,'2026-09-29',200,'luis@example.com'),
        ('2026-09','empresa','ruc','01','F001','0000420',1,NULL,'2026-09-29',75,'ana@example.com'),
        ('2026-09','empresa','ruc','01','F001','0000420',2,'07','2026-09-30',75,'luis@example.com')`);
      const montosPorCorreo = async (dia) => {
        const records = await consultar('obtenerTotalVentasUsuario', dia, '2026-09');
        const total = Number((await consultar('obtenerTotalVentas', dia, '2026-09')).total);
        assert.equal(records.data.reduce((suma, row) => suma + Number(row.monto), 0), total);
        return Object.fromEntries(records.data.map(row => [row.recaudacion, Number(row.monto)]));
      };
      assert.deepEqual(await montosPorCorreo('*'), { 'ana@example.com': 175, 'luis@example.com': 125 });
      assert.deepEqual(await montosPorCorreo('29'), { 'ana@example.com': 175, 'luis@example.com': 200 });
      assert.deepEqual(await montosPorCorreo('30'), {});

      // Si la factura es del mismo dia, la NC tambien descuenta en el filtro diario.
      await pg.exec("UPDATE mve_venta SET r_fecemi='2026-09-30' WHERE elemento=1 AND r_numero='0000420'");
      assert.deepEqual(await montosPorCorreo('30'), { 'ana@example.com': 75, 'luis@example.com': -75 });

      // Si la factura es del mes anterior, la NC no afecta RECORDS de septiembre.
      await pg.exec("UPDATE mve_venta SET periodo='2026-08', r_fecemi='2026-08-29' WHERE elemento=1 AND r_numero='0000420'");
      assert.deepEqual(await montosPorCorreo('*'), { 'ana@example.com': 100, 'luis@example.com': 200 });
    });

    await t.test('dia sin emisiones: total cero y desglose vacio', async () => {
      assert.equal(Number((await consultar('obtenerTotalVentas', '20')).total), 0);
      assert.equal((await consultar('obtenerTotalRecaudacion', '20')).data.length, 0);
    });
    await t.test('resumen: limita a dos items, busca todos y poda las otras particiones', async () => {
      await pg.exec(`TRUNCATE mve_venta, mve_ventadet;
        INSERT INTO mve_venta (periodo,id_usuario,documento_id,r_cod,r_serie,r_numero,elemento,r_fecemi,r_monto_total,r_cod_ref) VALUES
        ('2026-10','empresa','ruc','01','F001','1',1,'2026-10-19',100,NULL),
        ('2026-10','empresa','ruc','01','F001','1',2,'2026-10-19',20,'07'),
        ('2026-10','empresa','ruc','01','F001','2',1,'2026-10-18',50,NULL);
        INSERT INTO mve_ventadet VALUES
        ('2026-10','empresa','ruc','01','F001','1',1,3,'P003','Arena',5),
        ('2026-10','empresa','ruc','01','F001','1',1,1,'P001','Cemento',2),
        ('2026-10','empresa','ruc','01','F001','1',1,2,'P002','Ladrillos',10),
        ('2026-10','empresa','ruc','01','F001','1',2,1,'NC','Devolución',1),
        ('2026-10','empresa','ruc','01','F001','2',1,1,'OTRODIA','Otro día',1),
        ('2026-09','empresa','ruc','01','F001','1',1,1,'OTROMES','Otro mes',1),
        ('2026-10','otra-empresa','ruc','01','F001','1',1,1,'OTROUSUARIO','Otro usuario',1),
        ('2026-10','empresa','otro-ruc','01','F001','1',1,1,'OTRORUC','Otra empresa',1);`);
      let consulta;
      context.pool = { query: async (sql, params) => { consulta = { sql, params }; return pg.query(sql, params); } };
      const rows = await consultar('obtenerRegistroTodos', '19');
      context.pool = pg;
      assert.equal(rows.length, 2);
      const venta = rows.find(row => row.elemento === 1);
      assert.equal(venta.detalle_cantidad, 3);
      assert.deepEqual(venta.detalle_resumen, [
        { descripcion: 'Cemento', cantidad: 2 }, { descripcion: 'Ladrillos', cantidad: 10 },
      ]);
      assert.equal(venta.detalle_busqueda, 'P001 Cemento P002 Ladrillos P003 Arena');
      assert.equal(rows.find(row => row.elemento === 2).detalle_busqueda, 'NC Devolución');
      assert.equal(Number(venta.r_monto_total), 100);
      const plan = JSON.stringify((await pg.query(`EXPLAIN (FORMAT JSON) ${consulta.sql}`, consulta.params)).rows);
      assert.match(plan, /mve_ventadet_202610/);
      assert.doesNotMatch(plan, /mve_ventadet_202609/);
      const mes = await consultar('obtenerRegistroTodos', '*');
      assert.equal(mes.find(row => row.r_numero === '2').detalle_busqueda, 'OTRODIA Otro día');
    });
  } finally {
    await pg.close();
  }
});
