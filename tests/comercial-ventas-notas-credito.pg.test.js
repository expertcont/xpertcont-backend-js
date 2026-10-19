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
  ) + '\nthis.handlers = { obtenerTotalVentas, obtenerTotalRecaudacion, obtenerRegistroTodos };', context);

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

    await t.test('dia sin emisiones: total cero y desglose vacio', async () => {
      assert.equal(Number((await consultar('obtenerTotalVentas', '20')).total), 0);
      assert.equal((await consultar('obtenerTotalRecaudacion', '20')).data.length, 0);
    });
  } finally {
    await pg.close();
  }
});
