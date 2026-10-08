// PostgreSQL del nucleo TransVenta.
//
// mve_transventa guarda dos tipos de operacion: 'E' encomienda y 'B' boleto. Este
// modulo es el nucleo comun de las dos, por eso se llama TransVenta y no
// encomienda. La grabacion de encomiendas sigue delegando en la funcion
// PostgreSQL public.fve_transventa_grabar_encomienda; la de boletos todavia no
// esta conectada.
//
// Todo el SQL del CRUD de transporte vive aqui. Las proyecciones se importan de
// repositories/transventaColumnas.js: no se duplican.
const pool = require('../../db');
const {
  columnasVentaTrans,
  columnasVentaTransDesde,
} = require('../transventaColumnas');

// JOIN reutilizado para traer el nombre de la ruta. Infraestructura SQL privada
// de este repository.
const joinNombreRuta = `
  LEFT JOIN (
    SELECT id_usuario AS ruta_id_usuario,
           documento_id AS ruta_documento_id,
           id_ruta AS ruta_id_ruta,
           nombre AS nombre_ruta
      FROM mve_transruta
  ) ruta
    ON ruta.ruta_id_usuario = id_usuario
   AND ruta.ruta_documento_id = documento_id
   AND ruta.ruta_id_ruta = id_ruta
`;

// La fecha del servidor en hora Lima. La usa la grabacion de encomiendas para
// fijar r_fecemi y el periodo.
const obtenerFechaServidorLima = async () => {
  const result = await pool.query(`
    SELECT TO_CHAR((now() AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD') AS fecha
  `);

  return result.rows[0]?.fecha || '';
};

// Grabar encomienda mediante la funcion PostgreSQL. Devuelve el jsonb que
// devuelve la funcion.
const grabarEncomienda = async (dataEncomienda) => {
  const result = await pool.query(
    'SELECT public.fve_transventa_grabar_encomienda($1::jsonb) AS data',
    [dataEncomienda]
  );

  return result.rows[0]?.data || null;
};

// Lee la operacion recien creada con la proyeccion normalizada, la misma que
// usan el listado y el detalle.
//
// Antes esto era un UPDATE que volvia a escribir precio_chofer y contra y
// devolvia `RETURNING columnasVentaTrans`. Se cambio por esta lectura porque
// fve_transventa_grabar_encomienda ya escribe ambas columnas en su INSERT: la
// escritura era redundante y lo unico que hacia falta era la proyeccion.
//
// La clave de busqueda es la misma que usaba ese UPDATE, para que se localize
// exactamente la operacion recien insertada.
const obtenerOperacionCreada = async ({
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

// Listado de operaciones. El estado decide si se filtran las anuladas; dia = '*'
// no acota por fecha e idPuntoVenta, cuando viene, acota por punto de venta.
//
// tipoOperacion es opcional: si no se pasa, el SQL queda exactamente igual al de
// siempre, que sirve tanto a encomienda como a boleto. Lo usa el listado propio de
// boletos para no traer las encomiendas y que el frontend las descarte.
const obtenerOperaciones = async ({
  periodo, id_anfitrion, documento_id, estadoListado, dia, idPuntoVenta,
  tipoOperacion,
}) => {
    let query = `
      SELECT ${columnasVentaTransDesde('tv')},
             ruta.nombre_ruta,
             rdi.estado AS rdi_estado,
             rdi.ticket AS rdi_ticket
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
        LEFT JOIN public.mve_rdi_sunat rdi
          ON rdi.id_usuario = tv.id_usuario
         AND rdi.documento_id = tv.documento_id
         AND rdi.numero_rdi = tv.numero_rdi
       WHERE tv.periodo = $1
         AND tv.id_usuario = $2
         AND tv.documento_id = $3
    `;

    const params = [periodo, id_anfitrion, documento_id];

    if (['anulado', 'anulados', 'anuladas', '0'].includes(estadoListado)) {
      query += ` AND COALESCE(tv.registrado, 1) = 0 `;
    } else if (!['todos', 'all', '*'].includes(estadoListado)) {
      query += ` AND COALESCE(tv.registrado, 1) = 1 `;
    }

    if (tipoOperacion) {
      params.push(tipoOperacion);
      query += ` AND tv.tipo_operacion = $${params.length} `;
    }

    if (dia !== '*') {
      params.push(`${periodo}-${dia}`);
      query += ` AND tv.r_fecemi = $${params.length} `;
    }

    if (idPuntoVenta) {
      params.push(idPuntoVenta);
      query += ` AND tv.id_punto_venta = $${params.length} `;
    }

    query += `
      ORDER BY COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp) DESC,
               NULLIF(REGEXP_REPLACE(tv.r_numero, '\\D', '', 'g'), '')::bigint DESC NULLS LAST,
               tv.r_serie DESC,
               tv.elemento DESC
    `;

  const result = await pool.query(query, params);

  return result.rows;
};

// Una operacion por clave, con el nombre de su ruta.
const obtenerOperacion = async ({ periodo, id_anfitrion, documento_id, cod, serie, num, elem }) => {
  const query = `
      SELECT ${columnasVentaTrans},
             ruta.nombre_ruta
        FROM mve_transventa
        ${joinNombreRuta}
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `;

  const result = await pool.query(query, [
    periodo, id_anfitrion, documento_id,
    cod, serie, num, elem
  ]);

  return result.rows;
};

// Estado frente a SUNAT de una operacion. Es lo unico que se necesita para
// decidir si se puede modificar o eliminar, asi que no se carga la fila entera.
const obtenerEstadoSunat = async ({
  periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento,
}) => {
  const query = `
      SELECT numero_rdi, r_vfirmado
        FROM mve_transventa
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `;

  const result = await pool.query(query, [
    periodo, id_usuario, documento_id,
    r_cod, r_serie, r_numero, elemento,
  ]);

  return result.rows;
};

// Ruta de la empresa. Devuelve null si no se pasa la clave completa.
const obtenerRuta = async ({ id_anfitrion, documento_id, id_ruta }) => {
  if (!id_anfitrion || !documento_id || !id_ruta) {
    return null;
  }

  const result = await pool.query(`
    SELECT id_ruta, id_punto_venta, id_punto_venta_dest
      FROM mve_transruta
     WHERE id_usuario = $1
       AND documento_id = $2
       AND id_ruta = $3
  `, [id_anfitrion, documento_id, id_ruta]);

  return result.rows[0] || null;
};

// Actualizacion parcial de la operacion. Los nombres de los argumentos son los
// mismos que usa el arreglo de parametros del legacy para no renombrar $1..$47.
const actualizarOperacion = async (datos) => {
  const {
    periodo, idUsuarioFinal, documento_id,
    r_cod, r_serie, r_numero, elemento,
    r_fecemi, tipo_operacion,
    r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
    clienteIdDocFinal, cliente, clienteDocumentoIdFinal, cliente_telefono,
    cliente_direccion_fact,
    ref_pasajero_dni, ref_pasajero_nombres,
    idPuntoVentaFinal, clienteZonaFinal, clienteDireccionFinal,
    id_ruta, descripcion,
    placa, licencia,
    asiento, pasajero_edad,
    destinatario_id_doc, destinatario, destinatarioDocumentoIdFinal,
    destinatario_telefono, idPuntoVentaDestFinal,
    destinatario_zona, destinatario_direccion,
    tributosFinales,
    precio_chofer,
    condicion_pago, llegada_aprox, numero_rdi, estado_sunat, ctrlModUsFinal, contra,
  } = datos;

  const query = `
      UPDATE mve_transventa
         SET r_fecemi = COALESCE(NULLIF($8, '')::date, r_fecemi),
             tipo_operacion = COALESCE($9, tipo_operacion),
             r_cod_ref = COALESCE($10, r_cod_ref),
             r_serie_ref = COALESCE($11, r_serie_ref),
             r_numero_ref = COALESCE($12, r_numero_ref),
             r_fecemi_ref = COALESCE(NULLIF($13, '')::date, r_fecemi_ref),
             cliente_id_doc = COALESCE($14, cliente_id_doc),
             cliente = COALESCE($15, cliente),
             cliente_documento_id = COALESCE($16, cliente_documento_id),
             cliente_telefono = COALESCE($17, cliente_telefono),
             cliente_direccion_fact = COALESCE($18, cliente_direccion_fact),
             id_punto_venta = COALESCE($19, id_punto_venta),
             cliente_zona = COALESCE($20, cliente_zona),
             cliente_direccion = COALESCE($21, cliente_direccion),
             id_ruta = COALESCE($22, id_ruta),
             descripcion = COALESCE($23, descripcion),
             placa = COALESCE($24, placa),
             licencia = COALESCE($25, licencia),
             asiento = COALESCE($26, asiento),
             pasajero_edad = COALESCE($27::integer, pasajero_edad),
             destinatario_id_doc = COALESCE($28, destinatario_id_doc),
             destinatario = COALESCE($29, destinatario),
             destinatario_documento_id = COALESCE($30, destinatario_documento_id),
             destinatario_telefono = COALESCE($31, destinatario_telefono),
             id_punto_venta_dest = COALESCE($32, id_punto_venta_dest),
             destinatario_zona = COALESCE($33, destinatario_zona),
             destinatario_direccion = COALESCE($34, destinatario_direccion),
             precio_neto = COALESCE($35::numeric, precio_neto),
             r_gravado = COALESCE($36::numeric, r_gravado),
             r_exonerado = COALESCE($37::numeric, r_exonerado),
             r_igv = COALESCE($38::numeric, r_igv),
             r_monto_total = COALESCE($39::numeric, r_monto_total),
             precio_chofer = COALESCE($40::numeric, precio_chofer),
             porc_igv = COALESCE($41::numeric, porc_igv),
             condicion_pago = COALESCE($42, condicion_pago),
             llegada_aprox = COALESCE(NULLIF($43, '')::time, llegada_aprox),
             numero_rdi = COALESCE($44, numero_rdi),
             estado_sunat = COALESCE($45, estado_sunat),
             contra = COALESCE($47, contra),
             ref_pasajero_dni = COALESCE($48, ref_pasajero_dni),
             ref_pasajero_nombres = COALESCE($49, ref_pasajero_nombres),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($46, ctrl_mod_us)
      WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
       RETURNING ${columnasVentaTrans}
    `;

  const params = [
      periodo, idUsuarioFinal, documento_id,
      r_cod, r_serie, r_numero, elemento,
      r_fecemi, tipo_operacion,
      r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
      clienteIdDocFinal, cliente, clienteDocumentoIdFinal, cliente_telefono,
      cliente_direccion_fact,
      idPuntoVentaFinal, clienteZonaFinal, clienteDireccionFinal,
      id_ruta, descripcion,
      placa, licencia,
      asiento, pasajero_edad,
      destinatario_id_doc, destinatario, destinatarioDocumentoIdFinal,
      destinatario_telefono, idPuntoVentaDestFinal,
      destinatario_zona, destinatario_direccion,
      tributosFinales.precio_neto,
      tributosFinales.r_gravado,
      tributosFinales.r_exonerado,
      tributosFinales.r_igv,
      tributosFinales.r_monto_total,
      precio_chofer,
      tributosFinales.porc_igv,
      condicion_pago, llegada_aprox, numero_rdi, estado_sunat, ctrlModUsFinal,
      contra, ref_pasajero_dni, ref_pasajero_nombres
  ];

  const result = await pool.query(query, params);

  return result.rows;
};

// Borrado fisico. Solo se llega aqui si la operacion no esta bloqueada por SUNAT.
const eliminarOperacion = async ({
  periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento,
}) => {
  const query = `
      DELETE FROM mve_transventa
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
       RETURNING r_cod, r_serie, r_numero, elemento
    `;

  const result = await pool.query(query, [
    periodo, id_usuario, documento_id,
    r_cod, r_serie, r_numero, elemento
  ]);

  return result.rows;
};

// Anulacion logica: la operacion sigue existiendo pero con registrado = 0.
const anularOperacion = async ({
  periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento, ctrlModUs,
}) => {
  const query = `
      UPDATE mve_transventa
         SET registrado = 0,
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($8, ctrl_mod_us)
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
       RETURNING ${columnasVentaTrans}
    `;

  const result = await pool.query(query, [
    periodo, id_usuario, documento_id,
    r_cod, r_serie, r_numero, elemento, ctrlModUs || null
  ]);

  return result.rows;
};

module.exports = {
  obtenerFechaServidorLima,
  grabarEncomienda,
  obtenerOperacionCreada,
  obtenerOperaciones,
  obtenerOperacion,
  obtenerEstadoSunat,
  obtenerRuta,
  actualizarOperacion,
  eliminarOperacion,
  anularOperacion,
};
