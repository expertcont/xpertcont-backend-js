// ===========================================================================
// PostgreSQL del MANIFIESTO DE PASAJEROS (transmanifiesto).
//
// No reutiliza nada del manifiesto viejo (src/controllers/manifiesto.controllers.js,
// que apunta a otra base y es de otra version del sistema). Este se apoya en los
// boletos de mve_transventa, que es donde ya viven los pasajeros.
//
// Se llama "transmanifiesto" y no "manifiesto" para no confundirse con ese legado:
// el proyecto ya nombra asi a sus cosas de transporte (ventatrans, transruta,
// transplaca, transcaja) y el prefijo de ruta y de tabla tambien lo lleva.
//
// El manifiesto NO tiene tabla de detalle: su detalle son los boletos que lo
// apuntan con mve_transventa.id_manifiesto. Asi los datos del pasajero viven en un
// solo lugar y no hay que sincronizar nada entre dos tablas.
// ===========================================================================
const pool = require('../../db');
const { columnasVentaTrans, columnasVentaTransDesde } = require('../transventaColumnas');

// Boletos que todavia no se manifiesto a ningun manifiesto. Es el insumo para
// armar uno: son los pasajeros que todavia se pueden subir.
//
// Acota por periodo, que es obligatorio, y opcionalmente por fecha COMPLETA. Se
// llama fecha y no dia a proposito: el manifiesto tiene fecha, y armarla con
// periodo + dia admite dos convenciones que se mezclan mal.
const listarBoletosDisponibles = async ({
  periodo, id_usuario, documento_id, fecha, idPuntoVenta, destinoIdPuntoVenta,
}) => {
  const params = [periodo, id_usuario, documento_id];
  const condiciones = [
    'tv.periodo = $1',
    'tv.id_usuario = $2',
    'tv.documento_id = $3',
    `tv.tipo_operacion = 'B'`,
    'tv.id_manifiesto IS NULL',
  ];

  if (fecha) {
    params.push(fecha);
    condiciones.push(`tv.r_fecemi = $${params.length}`);
  }

  if (idPuntoVenta) {
    params.push(idPuntoVenta);
    condiciones.push(`tv.id_punto_venta = $${params.length}`);
  }

  if (destinoIdPuntoVenta) {
    params.push(destinoIdPuntoVenta);
    condiciones.push(`tv.id_punto_venta_dest = $${params.length}`);
  }

  const query = `SELECT ${columnasVentaTransDesde('tv')},
       ruta.nombre AS nombre_ruta,
       punto_origen.nombre AS punto_venta_nombre,
       punto_destino.nombre AS punto_venta_dest_nombre
  FROM mve_transventa tv
  LEFT JOIN (
    SELECT id_usuario AS ruta_id_usuario,
           documento_id AS ruta_documento_id,
           id_ruta AS ruta_id_ruta,
           nombre AS nombre_ruta
      FROM mve_transruta
  ) ruta
    ON ruta.ruta_id_usuario = tv.id_usuario
   AND ruta.ruta_documento_id = tv.documento_id
   AND ruta.ruta_id_ruta = tv.id_ruta
  LEFT JOIN mad_punto_venta punto_origen
    ON punto_origen.id_usuario = tv.id_usuario
   AND punto_origen.documento_id = tv.documento_id
   AND punto_origen.id_punto_venta = tv.id_punto_venta
  LEFT JOIN mad_punto_venta punto_destino
    ON punto_destino.id_usuario = tv.id_usuario
   AND punto_destino.documento_id = tv.documento_id
   AND punto_destino.id_punto_venta = tv.id_punto_venta_dest
 WHERE ${condiciones.join('\n   AND ')}
 ORDER BY COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp) DESC,
          NULLIF(REGEXP_REPLACE(tv.r_numero, '\\D', '', 'g'), '')::bigint DESC NULLS LAST,
          tv.r_serie DESC,
          tv.elemento DESC`;

  const result = await pool.query(query, params);

  return result.rows;
};

// Los pasajeros de un manifiesto: los boletos activos que lo apuntan. Usa la misma
// proyeccion que el listado del nucleo, para que el pasajero se vea igual que en
// cualquier otra pantalla. No hace falta el LEFT JOIN de RDI porque el boleto no
// es documento fiscal. Los registrado = 0 quedan dentro del manifiesto como
// anulados para RDI/recuperacion, pero no ocupan asiento visualmente.
const obtenerPasajerosDelManifiesto = async ({ id_manifiesto }) => {
  const result = await pool.query(
    `SELECT ${columnasVentaTransDesde('tv')},
            ruta.nombre_ruta,
            punto_origen.nombre AS punto_venta_nombre,
            punto_destino.nombre AS punto_venta_dest_nombre
       FROM mve_transventa tv
       LEFT JOIN (
         SELECT id_usuario AS ruta_id_usuario,
                documento_id AS ruta_documento_id,
                id_ruta AS ruta_id_ruta,
                nombre AS nombre_ruta
           FROM mve_transruta
       ) ruta
         ON ruta.ruta_id_usuario = tv.id_usuario
        AND ruta.ruta_documento_id = tv.documento_id
        AND ruta.ruta_id_ruta = tv.id_ruta
       LEFT JOIN mad_punto_venta punto_origen
         ON punto_origen.id_usuario = tv.id_usuario
        AND punto_origen.documento_id = tv.documento_id
        AND punto_origen.id_punto_venta = tv.id_punto_venta
       LEFT JOIN mad_punto_venta punto_destino
         ON punto_destino.id_usuario = tv.id_usuario
        AND punto_destino.documento_id = tv.documento_id
        AND punto_destino.id_punto_venta = tv.id_punto_venta_dest
      WHERE tv.id_manifiesto = $1
        AND tv.tipo_operacion = 'B'
        AND COALESCE(tv.registrado, 1) = 1
      ORDER BY COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp) DESC,
               NULLIF(REGEXP_REPLACE(tv.r_numero, '\\D', '', 'g'), '')::bigint DESC NULLS LAST,
               tv.r_serie DESC,
               tv.elemento DESC`,
    [id_manifiesto]
  );

  return result.rows;
};

// Manifiestos de una empresa. Los filtros de fecha y estado son opcionales.
const obtenerManifiestos = async ({ id_usuario, documento_id, periodo, fecha, estado, idPuntoVenta }) => {
  const params = [id_usuario, documento_id];
  const condiciones = ['m.id_usuario = $1', 'm.documento_id = $2'];

  if (periodo) {
    params.push(periodo);
    condiciones.push(`m.periodo = $${params.length}`);
  }

  if (fecha) {
    params.push(fecha);
    condiciones.push(`m.fecha = $${params.length}`);
  }

  if (estado) {
    params.push(estado);
    condiciones.push(`m.estado = $${params.length}`);
  }

  if (idPuntoVenta) {
    params.push(idPuntoVenta);
    condiciones.push(`m.id_punto_venta = $${params.length}`);
  }

  const query = `SELECT m.*,
       (SELECT COUNT(*)::integer
          FROM mve_transventa tv
         WHERE tv.id_manifiesto = m.id_manifiesto
           AND tv.tipo_operacion = 'B'
           AND COALESCE(tv.registrado, 1) = 1) AS total_pasajeros
  FROM mve_transmanifiesto m
 WHERE ${condiciones.join('\n   AND ')}
 ORDER BY m.fecha DESC, m.id_manifiesto DESC`;

  const result = await pool.query(query, params);

  return result.rows;
};

// Un manifiesto con su lista de pasajeros.
const obtenerManifiesto = async ({ id_manifiesto }) => {
  const result = await pool.query(
    `SELECT m.*,
       (SELECT COUNT(*)::integer
          FROM mve_transventa tv
         WHERE tv.id_manifiesto = m.id_manifiesto
           AND tv.tipo_operacion = 'B'
           AND COALESCE(tv.registrado, 1) = 1) AS total_pasajeros
  FROM mve_transmanifiesto m
 WHERE m.id_manifiesto = $1`,
    [id_manifiesto]
  );

  return result.rows[0] || null;
};

const crearManifiesto = async (datos) => {
  const {
    id_usuario, documento_id, periodo, fecha, hora_salida,
    id_ruta, id_punto_venta, id_punto_venta_dest,
    placa, licencia, observacion, ctrl_crea_us,
  } = datos;

  const result = await pool.query(
    `INSERT INTO mve_transmanifiesto (
       id_usuario, documento_id, periodo, fecha, hora_salida,
       id_ruta, id_punto_venta, id_punto_venta_dest,
       placa, licencia, observacion,
       estado, ctrl_crea, ctrl_crea_us
     )
     VALUES ($1,$2,$3,$4::date,NULLIF($5, '')::time,$6,$7,$8,$9,$10,$11,'ABIERTO',CURRENT_TIMESTAMP,$12)
     RETURNING *`,
    [
      id_usuario, documento_id, periodo, fecha, hora_salida || null,
      id_ruta, id_punto_venta, id_punto_venta_dest || null,
      placa || null, licencia || null, observacion || null,
      ctrl_crea_us || null,
    ]
  );

  return result.rows[0] || null;
};

// A que manifiesto pertenece un boleto, o null si el boleto no existe. Lo usa el
// service para distinguir "el boleto no existe" de "ya esta en otro manifiesto",
// que el UPDATE de abajo no puede diferenciar.
const obtenerManifiestoDeBoleto = async (clave) => {
  const result = await pool.query(
    `SELECT id_manifiesto
       FROM mve_transventa
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
        AND tipo_operacion = 'B'`,
    [
      clave.periodo, clave.id_usuario, clave.documento_id,
      clave.r_cod, clave.r_serie, clave.r_numero, clave.elemento,
    ]
  );

  return result.rows[0] || null;
};

// Sube un boleto al manifiesto.
//
// La guarda del WHERE es lo importante: sin ella, un UPDATE por clave moveria al
// pasajero de un manifiesto a otro sin avisar. Con ella, el UPDATE solo toca el
// boleto si esta libre o si ya estaba en ESTE manifiesto (agregar dos veces el
// mismo pasajero no es un error, es lo mismo).
const vincularPasajero = async ({
  periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento,
  id_manifiesto, ctrl_mod_us,
}) => {
  const result = await pool.query(
    `UPDATE mve_transventa
        SET id_manifiesto = $8,
            ctrl_mod = CURRENT_TIMESTAMP,
            ctrl_mod_us = COALESCE($9, ctrl_mod_us)
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
        AND tipo_operacion = 'B'
        AND (id_manifiesto IS NULL OR id_manifiesto = $8)
    RETURNING ${columnasVentaTrans},
              id_manifiesto`,
    [
      periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento,
      id_manifiesto, ctrl_mod_us || null,
    ]
  );

  return result.rows[0] || null;
};

// Saca un boleto del manifiesto. Solo tiene sentido mientras este abierto.
const desvincularPasajero = async ({
  periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento,
  id_manifiesto, ctrl_mod_us,
}) => {
  const result = await pool.query(
    `UPDATE mve_transventa
        SET id_manifiesto = NULL,
            ctrl_mod = CURRENT_TIMESTAMP,
            ctrl_mod_us = COALESCE($9, ctrl_mod_us)
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
        AND id_manifiesto = $8
    RETURNING ${columnasVentaTrans}`,
    [
      periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento,
      id_manifiesto, ctrl_mod_us || null,
    ]
  );

  return result.rows[0] || null;
};

const cerrarManifiesto = async ({ id_manifiesto, placa, licencia, ctrl_mod_us }) => {
  const result = await pool.query(
    `UPDATE mve_transmanifiesto
        SET estado = 'CERRADO',
            placa = COALESCE(NULLIF($2, ''), placa),
            licencia = COALESCE(NULLIF($3, ''), licencia),
            ctrl_mod = CURRENT_TIMESTAMP,
            ctrl_mod_us = COALESCE($4, ctrl_mod_us)
      WHERE id_manifiesto = $1
    RETURNING *`,
    [id_manifiesto, placa || null, licencia || null, ctrl_mod_us || null]
  );

  return result.rows[0] || null;
};

const reabrirManifiesto = async ({ id_manifiesto, ctrl_mod_us }) => {
  const result = await pool.query(
    `UPDATE mve_transmanifiesto
        SET estado = 'ABIERTO',
            ctrl_mod = CURRENT_TIMESTAMP,
            ctrl_mod_us = COALESCE($2, ctrl_mod_us)
      WHERE id_manifiesto = $1
    RETURNING *`,
    [id_manifiesto, ctrl_mod_us || null]
  );

  return result.rows[0] || null;
};

const eliminarManifiesto = async ({ id_manifiesto }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE mve_transventa
          SET id_manifiesto = NULL,
              ctrl_mod = CURRENT_TIMESTAMP
        WHERE id_manifiesto = $1`,
      [id_manifiesto]
    );

    const result = await client.query(
      `DELETE FROM mve_transmanifiesto
        WHERE id_manifiesto = $1
      RETURNING *`,
      [id_manifiesto]
    );

    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listarBoletosDisponibles,
  obtenerPasajerosDelManifiesto,
  obtenerManifiestos,
  obtenerManifiesto,
  crearManifiesto,
  obtenerManifiestoDeBoleto,
  vincularPasajero,
  desvincularPasajero,
  cerrarManifiesto,
  reabrirManifiesto,
  eliminarManifiesto,
};
