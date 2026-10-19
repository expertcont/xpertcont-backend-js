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
    source.indexOf('const filtroNotasCreditoVentasSQL ='),
    source.indexOf('const obtenerTotalUnidades ='),
  ) + '\nthis.handlers = { obtenerTotalVentas, obtenerTotalRecaudacion };', context);

  const consultar = async (handler, dia) => {
    let status;
    let body;
    await context.handlers[handler]({ params: {
      periodo: '2026-10', id_anfitrion: 'empresa', id_invitado: 'empresa',
      documento_id: 'ruc', dia,
    } }, {
      status(value) { status = value; return this; },
      json(value) { body = value; },
    });
    assert.equal(status, 200);
    return body;
  };

  try {
    await pg.exec(`CREATE TABLE mve_venta (
      periodo text, id_usuario text, documento_id text, registrado integer,
      r_cod text, r_fecemi date, r_fecemi_ref date, r_monto_total numeric,
      efectivo numeric, forma_pago2 text, efectivo2 numeric
    )`);

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
        await pg.exec(`INSERT INTO mve_venta VALUES
          ('2026-10', 'empresa', 'ruc', 1, '01', '2026-10-19', NULL, 1000, 600, 'TARJETA', 400),
          ('2026-10', 'empresa', 'ruc', 1, 'NP', '2026-10-19', NULL, 9999, 9999, 'TARJETA', 0),
          ('2026-10', 'empresa', 'ruc', 0, '01', '2026-10-19', NULL, 9999, 9999, 'TARJETA', 0),
          ('2026-10', 'empresa', 'ruc', 1, '01', '2026-09-19', NULL, 9999, 9999, 'TARJETA', 0)`);
        await pg.query(`INSERT INTO mve_venta VALUES
          ('2026-10', 'empresa', 'ruc', 1, '07', '2026-10-19', $1, -100, -60, 'TARJETA', -40)`, [referencia]);

        const total = await consultar('obtenerTotalVentas', dia);
        assert.equal(Number(total.total), descuenta ? 900 : 1000);
        const detalle = await consultar('obtenerTotalRecaudacion', dia);
        const montos = Object.fromEntries(detalle.data.map(row => [row.recaudacion, Number(row.monto)]));
        assert.equal(montos.EFECTIVO, descuenta ? 540 : 600);
        assert.equal(montos.TARJETA, descuenta ? 360 : 400);
        assert.equal(montos.EFECTIVO + montos.TARJETA, Number(total.total));
      });
    }

    await t.test('dia sin emisiones: total cero y desglose vacio', async () => {
      assert.equal(Number((await consultar('obtenerTotalVentas', '20')).total), 0);
      assert.equal((await consultar('obtenerTotalRecaudacion', '20')).data.length, 0);
    });
  } finally {
    await pg.close();
  }
});
