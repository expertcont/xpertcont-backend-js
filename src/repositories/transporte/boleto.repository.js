// PostgreSQL del boleto de transporte (tipo_operacion = 'B').
//
// A diferencia de la encomienda, el boleto no lleva destinatario, placa,
// licencia ni contrasena: el pasajero viaja desde la agencia hacia el destino
// de la ruta, y el precio sale del pasaje configurado en la ruta.
//
// La grabacion delega en la funcion PostgreSQL public.fve_transventa_grabar_boleto,
// igual que la encomienda delega en fve_transventa_grabar_encomienda. Esa funcion
// es la unica que fija el precio: aqui no se acepta ningun importe del frontend.
const pool = require('../../db');
const { columnasVentaTrans, columnasVentaTransDesde } = require('../transventaColumnas');

// Ruta de la empresa, solo si esta activa. La clave primaria de mve_transruta es
// (id_usuario, documento_id, id_ruta), asi que esta consulta devuelve como
// maximo una fila.
const obtenerRutaPorIdRuta = async ({ id_usuario, documento_id, id_ruta }) => {
  const query = `SELECT id_ruta, id_punto_venta, id_punto_venta_dest, nombre, precio_pasaje, activo FROM mve_transruta WHERE id_usuario = $1 AND documento_id = $2 AND id_ruta = $3 AND activo = true`;

  const result = await pool.query(query, [id_usuario, documento_id, id_ruta]);

  return result.rows[0] || null;
};

// Grabar boleto mediante la funcion PostgreSQL. Devuelve el jsonb con la fila
// insertada.
const grabarBoleto = async (data) => {
  const result = await pool.query(
    'SELECT public.fve_transventa_grabar_boleto($1::jsonb) AS data',
    [data]
  );

  return result.rows[0]?.data || null;
};

// Recupera un boleto anulado del mismo manifiesto antes de generar correlativo
// nuevo. Asi el manifiesto conserva sus numeros: si nadie ocupa ese lugar,
// registrado = 0 queda como anulado para que el RDI lo procese con su regla.
const recuperarBoletoLiberado = async (data) => {
  const query = `
    WITH boleto_liberado AS (
      SELECT periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento
        FROM mve_transventa
       WHERE id_usuario = $1
         AND documento_id = $2
         AND tipo_operacion = 'B'
         AND COALESCE(registrado, 1) = 0
         AND COALESCE(numero_rdi, '') = ''
         AND COALESCE(r_vfirmado, '') = ''
         AND id_ruta = $3
         AND r_fecemi = $4::date
         AND r_cod = $5
         AND r_serie = $6
         AND COALESCE(id_punto_venta, '') = COALESCE($7, COALESCE(id_punto_venta, ''))
         AND COALESCE(id_punto_venta_dest, '') = COALESCE($8, COALESCE(id_punto_venta_dest, ''))
         AND COALESCE(id_manifiesto::text, '') = COALESCE($9::text, '')
       ORDER BY CASE WHEN asiento ~ '^[0-9]+$' THEN asiento::integer END NULLS LAST, r_numero
       LIMIT 1
    )
    UPDATE mve_transventa tv
       SET registrado = 1,
           cliente_id_doc = $10,
           cliente_documento_id = $11,
           cliente = $12,
           cliente_telefono = $13,
           cliente_direccion_fact = $14,
           ref_pasajero_dni = $15,
           ref_pasajero_nombres = $16,
           id_manifiesto = $9::bigint,
           precio_neto = $17::numeric,
           r_gravado = 0,
           r_exonerado = $17::numeric,
           r_igv = 0,
           r_monto_total = $17::numeric,
           porc_igv = 0,
           ctrl_mod = CURRENT_TIMESTAMP,
           ctrl_mod_us = COALESCE($18, ctrl_mod_us)
      FROM boleto_liberado bl
     WHERE tv.periodo = bl.periodo
       AND tv.id_usuario = bl.id_usuario
       AND tv.documento_id = bl.documento_id
       AND tv.r_cod = bl.r_cod
       AND tv.r_serie = bl.r_serie
       AND tv.r_numero = bl.r_numero
       AND tv.elemento = bl.elemento
    RETURNING ${columnasVentaTransDesde('tv')}`;

  const result = await pool.query(query, [
    data.id_usuario,
    data.documento_id,
    data.id_ruta,
    data.r_fecemi,
    data.r_cod,
    data.r_serie,
    data.id_punto_venta || null,
    data.id_punto_venta_dest || null,
    data.id_manifiesto || null,
    data.id_documento,
    data.cliente_documento,
    data.cliente,
    data.cliente_telefono || null,
    data.cliente_direccion_fact || null,
    data.ref_pasajero_dni || null,
    data.ref_pasajero_nombres || null,
    data.precio_pasaje,
    data.ctrl_crea_us || null,
  ]);

  return result.rows[0] || null;
};

// Relee la operacion recien creada con la proyeccion normalizada, la misma que
// usan el listado y el detalle. Es una lectura: la fila ya quedo escrita por la
// funcion PostgreSQL, no se vuelve a modificar.
const obtenerOperacionBoleto = async ({
  periodo, id_usuario, documento_id,
  r_cod, r_serie, r_numero, elemento,
}) => {
  const query = `
    SELECT ${columnasVentaTransDesde('tv')},
           punto_origen.nombre AS punto_venta_nombre,
           punto_destino.nombre AS punto_venta_dest_nombre
      FROM mve_transventa tv
      LEFT JOIN mad_punto_venta punto_origen
        ON punto_origen.id_usuario = tv.id_usuario
       AND punto_origen.documento_id = tv.documento_id
       AND punto_origen.id_punto_venta = tv.id_punto_venta
      LEFT JOIN mad_punto_venta punto_destino
        ON punto_destino.id_usuario = tv.id_usuario
       AND punto_destino.documento_id = tv.documento_id
       AND punto_destino.id_punto_venta = tv.id_punto_venta_dest
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.r_cod = $4
       AND tv.r_serie = $5
       AND tv.r_numero = $6
       AND tv.elemento = $7`;

  const result = await pool.query(query, [
    periodo,
    id_usuario,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento,
  ]);

  return result.rows;
};

const vincularBoletoAManifiesto = async ({
  periodo, id_usuario, documento_id,
  r_cod, r_serie, r_numero, elemento,
  id_manifiesto, asiento, ctrl_mod_us,
}) => {
  const result = await pool.query(
    `UPDATE mve_transventa
        SET id_manifiesto = $8::bigint,
            asiento = COALESCE($9, asiento),
            ctrl_mod = CURRENT_TIMESTAMP,
            ctrl_mod_us = COALESCE($10, ctrl_mod_us)
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
        AND tipo_operacion = 'B'
    RETURNING ${columnasVentaTrans}`,
    [
      periodo, id_usuario, documento_id,
      r_cod, r_serie, r_numero, elemento,
      id_manifiesto, asiento || null, ctrl_mod_us || null,
    ]
  );

  return result.rows[0] || null;
};

const actualizarBoleto = async ({
  periodo, id_usuario, documento_id,
  r_cod, r_serie, r_numero, elemento,
  r_fecemi,
  cliente_id_doc, cliente_documento_id, cliente, cliente_telefono,
  cliente_direccion_fact, ref_pasajero_dni, ref_pasajero_nombres,
  id_ruta, id_punto_venta, id_punto_venta_dest,
  asiento, id_manifiesto, ctrl_mod_us,
}) => {
  const result = await pool.query(
    `UPDATE mve_transventa
        SET r_fecemi = COALESCE(NULLIF($8, '')::date, r_fecemi),
            cliente_id_doc = COALESCE($9, cliente_id_doc),
            cliente_documento_id = COALESCE($10, cliente_documento_id),
            cliente = COALESCE($11, cliente),
            cliente_telefono = COALESCE($12, cliente_telefono),
            cliente_direccion_fact = COALESCE($13, cliente_direccion_fact),
            ref_pasajero_dni = COALESCE($14, ref_pasajero_dni),
            ref_pasajero_nombres = COALESCE($15, ref_pasajero_nombres),
            id_ruta = COALESCE($16, id_ruta),
            id_punto_venta = COALESCE($17, id_punto_venta),
            id_punto_venta_dest = COALESCE($18, id_punto_venta_dest),
            asiento = COALESCE($19, asiento),
            id_manifiesto = COALESCE($20::bigint, id_manifiesto),
            ctrl_mod = CURRENT_TIMESTAMP,
            ctrl_mod_us = COALESCE($21, ctrl_mod_us)
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
        AND tipo_operacion = 'B'
    RETURNING ${columnasVentaTrans}`,
    [
      periodo, id_usuario, documento_id,
      r_cod, r_serie, r_numero, elemento,
      r_fecemi || null,
      cliente_id_doc || null,
      cliente_documento_id || null,
      cliente || null,
      cliente_telefono || null,
      cliente_direccion_fact || null,
      ref_pasajero_dni || null,
      ref_pasajero_nombres || null,
      id_ruta || null,
      id_punto_venta || null,
      id_punto_venta_dest || null,
      asiento || null,
      id_manifiesto || null,
      ctrl_mod_us || null,
    ]
  );

  return result.rows;
};

// ===========================================================================
// Lo del MANIFIESTO vive en su propio modulo:
//   repositories/transporte/manifiesto.repository.js
// No esta aca porque el manifiesto es un concepto propio, con tabla y ciclo de
// vida propios, y no una sublista del boleto. Solo comparte los boletos, que es
// justamente lo que se enlaza desde ahi.
// ===========================================================================

module.exports = {
  obtenerRutaPorIdRuta,
  grabarBoleto,
  recuperarBoletoLiberado,
  obtenerOperacionBoleto,
  vincularBoletoAManifiesto,
  actualizarBoleto,
};
