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

// Relee la operacion recien creada con la proyeccion normalizada, la misma que
// usan el listado y el detalle. Es una lectura: la fila ya quedo escrita por la
// funcion PostgreSQL, no se vuelve a modificar.
const obtenerOperacionBoleto = async ({
  periodo, id_usuario, documento_id,
  r_cod, r_serie, r_numero, elemento,
}) => {
  const query = `SELECT ${columnasVentaTrans} FROM mve_transventa WHERE periodo = $1 AND id_usuario = $2 AND documento_id = $3 AND r_cod = $4 AND r_serie = $5 AND r_numero = $6 AND elemento = $7`;

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
        SET id_manifiesto = $8,
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
  obtenerOperacionBoleto,
  vincularBoletoAManifiesto,
};
