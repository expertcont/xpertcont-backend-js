// Capa de acceso a datos de SUNAT / Resumen Diario de transporte.
//
// Aqui vive el SQL y el pool. No conoce handlers HTTP ni reglas de negocio:
// solo ejecuta y devuelve filas.
const pool = require('../../db');

// ------------------------------------------------------------------
// Consultas que ya venian completas del controller legacy
// ------------------------------------------------------------------

const obtenerDatosResumenSunatTransporte = async (idUsuario, documentoId) => {
  const datosQuery = await pool.query(
    `
      SELECT *
        FROM mad_usuariocontabilidad
       WHERE id_usuario = $1
         AND documento_id = $2
         AND tipo = 'ADMIN'
    `,
    [idUsuario, documentoId]
  );

  const datos = datosQuery.rows[0];
  if (!datos) {
    throw new Error('CONTABILIDAD NO ENCONTRADA');
  }

  return datos;
};

const obtenerRdiSunatTransporte = async ({ idUsuario, documentoId, numeroRdi, fechaResumen, origenResumen }) => {
  const params = [idUsuario, documentoId];
  let query = `
    SELECT *
      FROM public.mve_rdi_sunat
     WHERE id_usuario = $1
       AND documento_id = $2
  `;

  if (numeroRdi) {
    params.push(numeroRdi);
    query += ` AND numero_rdi = $${params.length} `;
  } else {
    params.push(fechaResumen, origenResumen);
    query += `
       AND fecha = $${params.length - 1}::date
       AND origen = $${params.length}
    `;
  }

  query += ' ORDER BY secuencia DESC LIMIT 1';
  const rdiQuery = await pool.query(query, params);
  return rdiQuery.rows[0] || null;
};

const obtenerPrimerRdiPendienteSunatTransporte = async ({ idUsuario, documentoId, fechaResumen, origenResumen }) => {
  const rdiQuery = await pool.query(
    `
      SELECT *
        FROM public.mve_rdi_sunat
       WHERE id_usuario = $1
         AND documento_id = $2
         AND fecha = $3::date
         AND origen = $4
         AND COALESCE(estado, 'PENDIENTE') IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'INCIERTO')
       ORDER BY secuencia ASC
       LIMIT 1
    `,
    [idUsuario, documentoId, fechaResumen, origenResumen]
  );

  return rdiQuery.rows[0] || null;
};

const actualizarRdiSunatTransporte = async ({
  idUsuario,
  documentoId,
  numeroRdi,
  estado,
  ticket = null,
  respuestaCodigo = null,
  respuestaDesc = null,
}) => {
  await pool.query(
    `
      UPDATE public.mve_rdi_sunat
         SET estado = $4,
             ticket = COALESCE($5, ticket),
             respuesta_codigo = $6,
             respuesta_desc = $7,
             ctrl_actualiza = CURRENT_TIMESTAMP
       WHERE id_usuario = $1
         AND documento_id = $2
         AND numero_rdi = $3
    `,
    [idUsuario, documentoId, numeroRdi, estado, ticket, respuestaCodigo, respuestaDesc]
  );
};

const estadoSunatTransportePorNivel = (nivel) => {
  if (nivel === 'ACEPTADO') return 'A';
  if (nivel === 'PENDIENTE') return 'P';
  if (nivel === 'RECHAZADO') return 'R';
  return 'E';
};

// ------------------------------------------------------------------
// Consultas que estaban dentro de otras funciones
// ------------------------------------------------------------------

const obtenerContabilidadAdminResumenQuery = async (params) => {
  const result = await pool.query(
    `
    SELECT *
      FROM mad_usuariocontabilidad
     WHERE id_usuario = $1
       AND documento_id = $2
       AND tipo = 'ADMIN'
    `,
    params
  );
  return result.rows;
};

const obtenerBoletasResumenQuery = async (query, params) => {
  const result = await pool.query(query, params);
  return result.rows;
};

const obtenerComprobantesPorRdiQuery = async (query, params) => {
  const result = await pool.query(query, params);
  return result.rows;
};

const crearResumenDiarioQuery = async (params) => {
  const result = await pool.query(
      `
        SELECT creado, numero_rdi, secuencia, cantidad, mensaje
        FROM public.fve_crear_resumen_diario($1, $2, $3::date, $4, $5)
      `,
    params
  );
  return result.rows;
};

const obtenerContabilidadTicketQuery = async (params) => {
  const result = await pool.query(
        `
        SELECT documento_id, razon_social, modo
          FROM mad_usuariocontabilidad
         WHERE id_usuario = $1
           AND documento_id = $2
           AND tipo = 'ADMIN'
        `,
    params
  );
  return result.rows;
};

const obtenerResumenesRdiQuery = async (params) => {
  const result = await pool.query(
      `
        SELECT
          r.id_usuario,
          r.documento_id,
          CAST(r.fecha AS varchar(10)) AS fecha,
          r.numero_rdi,
          r.secuencia,
          r.origen,
          COALESCE(r.estado, 'PENDIENTE') AS estado,
          COALESCE(r.estado_reproceso, '') AS estado_reproceso,
          r.ticket,
          r.respuesta_codigo,
          r.respuesta_desc,
          rdi_reproceso.numero_rdi AS rdi_reproceso_numero,
          CONCAT(r.documento_id, '-RC-', to_char(r.fecha, 'YYYYMMDD'), '-', r.secuencia)::varchar AS nombre_archivo,
          NULL::varchar AS ruta_xml,
          NULL::varchar AS ruta_cdr,
          NULL::timestamp AS ultimo_intento,
          0::integer AS intentos,
          CAST(r.ctrl_insercion AS varchar(30)) AS ctrl_insercion,
          CAST(r.ctrl_actualiza AS varchar(30)) AS ctrl_actualiza,
          COALESCE(COUNT(tv.*), 0)::integer AS cantidad_boletas
        FROM public.mve_rdi_sunat r
        LEFT JOIN public.mve_transventa tv
          ON tv.id_usuario = r.id_usuario
         AND tv.documento_id = r.documento_id
         AND tv.numero_rdi = r.numero_rdi
         AND tv.tipo_operacion = $5
        LEFT JOIN LATERAL (
          SELECT nr.numero_rdi
            FROM public.mve_rdi_sunat nr
           WHERE nr.id_usuario = r.id_usuario
             AND nr.documento_id = r.documento_id
             AND nr.fecha = r.fecha
             AND nr.origen = r.origen
             AND nr.secuencia > r.secuencia
             AND COALESCE(nr.estado_reproceso, '') <> 'REPROCESADO'
             AND COALESCE(nr.estado, 'PENDIENTE') IN ('ACEPTADO', 'ENVIADO', 'PENDIENTE', 'GENERADO')
           ORDER BY nr.secuencia ASC
           LIMIT 1
        ) rdi_reproceso ON TRUE
        WHERE r.id_usuario = $1
          AND r.documento_id = $2
          AND to_char(r.fecha, 'YYYY-MM') = $3
          AND r.origen = $4
        GROUP BY
          r.id_usuario,
          r.documento_id,
          r.fecha,
          r.numero_rdi,
          r.secuencia,
          r.origen,
          r.estado,
          r.estado_reproceso,
          r.ticket,
          r.respuesta_codigo,
          r.respuesta_desc,
          rdi_reproceso.numero_rdi,
          r.ctrl_insercion,
          r.ctrl_actualiza
        ORDER BY r.fecha DESC, r.secuencia DESC
      `,
    params
  );
  return result.rows;
};

const obtenerPendientesResumenQuery = async (params) => {
  const result = await pool.query(
      `
        SELECT
          CAST(tv.r_fecemi AS varchar(10)) AS fecha,
          COUNT(*)::integer AS cantidad
        FROM public.mve_transventa tv
        WHERE tv.id_usuario = $1
          AND tv.documento_id = $2
          AND tv.periodo = $3
          AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03'
          AND tv.tipo_operacion = $4
          AND COALESCE(tv.numero_rdi, '') = ''
          AND COALESCE(tv.r_vfirmado, '') = ''
          AND NOT EXISTS (
            SELECT 1
              FROM public.mve_rdi_sunat r
             WHERE r.id_usuario = tv.id_usuario
               AND r.documento_id = tv.documento_id
               AND r.fecha = tv.r_fecemi
               AND r.origen = CASE WHEN $4 = 'B' THEN 'TRANS_BOLETO' ELSE 'TRANS_ENCOMIENDA' END
               AND COALESCE(r.estado, '') = 'ACEPTADO'
               AND COALESCE(r.respuesta_codigo, '') = '0'
               AND COALESCE(r.ctrl_actualiza, r.ctrl_insercion) >= COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp)
          )
        GROUP BY tv.r_fecemi
        ORDER BY tv.r_fecemi ASC
      `,
    params
  );
  return result.rows;
};

const obtenerRegistroSireTransporteQuery = async (params) => {
  const result = await pool.query(
    `
      SELECT
        CAST(tv.r_fecemi AS varchar(10)) AS fecha_emision,
        COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) AS tipo_comprobante,
        COALESCE(NULLIF(tv.r_serie_ref, ''), tv.r_serie) AS serie,
        COALESCE(NULLIF(tv.r_numero_ref, ''), tv.r_numero) AS numero,
        tv.elemento,
        tv.tipo_operacion,
        tv.cliente_id_doc AS tipo_doc_cliente,
        tv.cliente_documento_id AS nro_doc_cliente,
        tv.cliente AS cliente,
        COALESCE(tv.r_gravado, 0)::numeric AS base_gravada,
        COALESCE(tv.r_exonerado, 0)::numeric AS exonerado,
        0::numeric AS inafecto,
        COALESCE(tv.r_igv, 0)::numeric AS igv,
        COALESCE(tv.r_monto_total, tv.precio_neto, 0)::numeric AS total,
        'PEN'::varchar AS moneda,
        CASE
          WHEN COALESCE(tv.registrado, 1) = 0
           AND COALESCE(tv.numero_rdi, '') <> ''
           AND COALESCE(rdi.estado, '') = 'ACEPTADO'
           AND COALESCE(rdi.respuesta_codigo, '') = '0' THEN 'ACEPTADO'
          WHEN COALESCE(tv.registrado, 1) = 0
           AND COALESCE(tv.r_vfirmado, '') <> '' THEN 'ACEPTADO'
          WHEN COALESCE(tv.registrado, 1) = 0 THEN 'ANULADO LOCAL'
          WHEN COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03'
           AND COALESCE(tv.numero_rdi, '') = '' THEN 'SIN ENVIO SUNAT'
          WHEN COALESCE(tv.numero_rdi, '') <> ''
           AND COALESCE(rdi.estado, '') = 'ACEPTADO'
           AND COALESCE(rdi.respuesta_codigo, '') = '0' THEN 'ACEPTADO'
          WHEN COALESCE(tv.numero_rdi, '') <> ''
           AND COALESCE(rdi.estado, '') = 'RECHAZADO' THEN 'RECHAZADO'
          WHEN COALESCE(tv.numero_rdi, '') <> ''
           AND COALESCE(rdi.estado, '') IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'INCIERTO', '') THEN 'RDI PENDIENTE CDR'
          WHEN COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '01'
           AND COALESCE(tv.r_vfirmado, '') <> '' THEN 'ACEPTADO'
          WHEN COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '01' THEN 'SIN ENVIO SUNAT'
          ELSE COALESCE(NULLIF(tv.estado_sunat, ''), 'PENDIENTE')
        END AS estado_sunat,
        CASE
          WHEN COALESCE(tv.numero_rdi, '') <> '' THEN 'RDI'
          WHEN COALESCE(tv.r_vfirmado, '') <> '' THEN 'Individual'
          ELSE ''
        END AS modo_envio,
        tv.numero_rdi,
        rdi.ticket,
        COALESCE(rdi.respuesta_codigo, CASE WHEN COALESCE(tv.estado_sunat, '') = 'A' THEN '0' ELSE NULL END) AS codigo_cdr,
        COALESCE(rdi.respuesta_desc, tv.cdr_descripcion) AS descripcion_cdr,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03' AND COALESCE(tv.numero_rdi, '') = '' THEN 'Boleta sin RDI' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03' AND COALESCE(tv.numero_rdi, '') = '' THEN 'Sin envio SUNAT' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.numero_rdi, '') <> '' AND rdi.numero_rdi IS NULL THEN 'Inconsistencia local: RDI no encontrado' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.numero_rdi, '') <> '' AND COALESCE(rdi.estado, '') IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'INCIERTO', '') THEN 'RDI pendiente de CDR' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND (COALESCE(rdi.estado, '') = 'RECHAZADO' OR COALESCE(tv.estado_sunat, '') IN ('R', 'E')) THEN 'Rechazado/error SUNAT' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') LIKE 'RDI:%' AND COALESCE(tv.numero_rdi, '') = '' THEN 'Inconsistencia local: firma RDI sin numero RDI' END
        ], NULL) AS observaciones
      FROM public.mve_transventa tv
      LEFT JOIN public.mve_rdi_sunat rdi
        ON rdi.id_usuario = tv.id_usuario
       AND rdi.documento_id = tv.documento_id
       AND rdi.numero_rdi = tv.numero_rdi
      WHERE tv.periodo = $1
        AND tv.id_usuario = $2
        AND tv.documento_id = $3
        AND tv.tipo_operacion IN ('B', 'E')
        AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) IN ('01', '03', '07', '08')
      ORDER BY
        tv.r_fecemi ASC,
        COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) ASC,
        COALESCE(NULLIF(tv.r_serie_ref, ''), tv.r_serie) ASC,
        NULLIF(REGEXP_REPLACE(COALESCE(NULLIF(tv.r_numero_ref, ''), tv.r_numero), '\\D', '', 'g'), '')::bigint ASC NULLS LAST,
        tv.elemento ASC
    `,
    params
  );

  return result.rows;
};

const actualizarOperacionesRdiQuery = async (params) => {
  const result = await pool.query(
    `
      UPDATE public.mve_transventa
         SET r_vfirmado = CASE
               WHEN $7 = 'ACEPTADO' THEN COALESCE(r_vfirmado, $4)
               WHEN r_vfirmado = $4 THEN NULL
               ELSE r_vfirmado
             END,
             cdr_descripcion = $5,
             estado_sunat = $8,
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($6, ctrl_mod_us)
       WHERE id_usuario = $1
         AND documento_id = $2
         AND numero_rdi = $3
    `,
    params
  );
  return result.rows;
};

const incrementarIntentoRdiQuery = async (params) => {
  const result = await pool.query(
      `
        UPDATE public.mve_rdi_sunat
           SET estado = 'GENERADO',
               intentos = COALESCE(intentos, 0) + 1,
               ultimo_intento = CURRENT_TIMESTAMP,
               ctrl_actualiza = CURRENT_TIMESTAMP
         WHERE id_usuario = $1
           AND documento_id = $2
           AND numero_rdi = $3
      `,
    params
  );
  return result.rows;
};

const incrementarIntentoRdiFallbackQuery = async (params) => {
  const result = await pool.query(
      `
        UPDATE public.mve_rdi_sunat
           SET estado = 'GENERADO',
               ctrl_actualiza = CURRENT_TIMESTAMP
         WHERE id_usuario = $1
           AND documento_id = $2
           AND numero_rdi = $3
      `,
    params
  );
  return result.rows;
};

// La transaccion completa vive aqui: BEGIN + SELECT ... FOR UPDATE + los dos
// UPDATE + COMMIT. No se puede partir en varias consultas sueltas porque el
// FOR UPDATE debe seguir Protecting las mismas filas del RDI.
//
// esRechazo se recibe como callback para que la regla siga siendo del service,
// pero se evalue con la fila ya bloqueada.
const corregirRdiRechazadoTransaccion = async ({ idUsuario, documentoId, numeroRdi, ctrlModUs, esRechazo }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const rdiQuery = await client.query(
      `
        SELECT *
          FROM public.mve_rdi_sunat
         WHERE id_usuario = $1
           AND documento_id = $2
           AND numero_rdi = $3
         FOR UPDATE
      `,
      [idUsuario, documentoId, numeroRdi]
    );
    const rdi = rdiQuery.rows[0];

    if (!rdi) {
      await client.query('ROLLBACK');
      return { resultado: 'NO_ENCONTRADO' };
    }

    if (!esRechazo(rdi)) {
      await client.query('ROLLBACK');
      return { resultado: 'NO_CORREGIBLE' };
    }

    const liberadosQuery = await client.query(
      `
        UPDATE public.mve_transventa
           SET numero_rdi = NULL,
               r_vfirmado = NULL,
               estado_sunat = NULL,
               cdr_descripcion = NULL,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($4, ctrl_mod_us)
         WHERE id_usuario = $1
           AND documento_id = $2
           AND numero_rdi = $3
        RETURNING r_cod, r_serie, r_numero, elemento
      `,
      [idUsuario, documentoId, numeroRdi, ctrlModUs]
    );

    const nota = `Liberado manualmente para regenerar RDI. Comprobantes liberados: ${liberadosQuery.rowCount}.`;

    await client.query(
      `
        UPDATE public.mve_rdi_sunat
           SET estado = 'RECHAZADO',
               estado_reproceso = 'REPROCESADO',
               respuesta_desc = LEFT(CONCAT(COALESCE(respuesta_desc, ''), CASE WHEN COALESCE(respuesta_desc, '') = '' THEN '' ELSE ' | ' END, $4::text), 500),
               ctrl_actualiza = CURRENT_TIMESTAMP
         WHERE id_usuario = $1
           AND documento_id = $2
           AND numero_rdi = $3
      `,
      [idUsuario, documentoId, numeroRdi, nota]
    );

    await client.query('COMMIT');

    return { resultado: 'CORREGIDO', liberados: liberadosQuery.rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Candado consultivo de PostgreSQL para que dos envios del mismo RDI no se
// pisen. Se mantiene una conexion dedicada durante la llamada a SUNAT.
const adquirirCandadoRdi = async (lockKey) => {
  const client = await pool.connect();

  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [lockKey]
    );

    return { client, lockAcquired: lockResult.rows[0]?.locked === true };
  } catch (error) {
    // El service todavia no entro en su try/finally: se libera aqui para no
    // dejar la conexion colgada.
    client.release();
    throw error;
  }
};

const liberarCandadoRdi = async (client, lockKey, lockAcquired) => {
  if (lockAcquired) {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
  }
  client.release();
};
module.exports = {
  obtenerDatosResumenSunatTransporte,
  obtenerRdiSunatTransporte,
  obtenerPrimerRdiPendienteSunatTransporte,
  actualizarRdiSunatTransporte,
  estadoSunatTransportePorNivel,
  obtenerContabilidadAdminResumenQuery,
  obtenerBoletasResumenQuery,
  obtenerComprobantesPorRdiQuery,
  crearResumenDiarioQuery,
  obtenerContabilidadTicketQuery,
  obtenerResumenesRdiQuery,
  obtenerPendientesResumenQuery,
  obtenerRegistroSireTransporteQuery,
  corregirRdiRechazadoTransaccion,
  adquirirCandadoRdi,
  liberarCandadoRdi,
  actualizarOperacionesRdiQuery,
  incrementarIntentoRdiQuery,
  incrementarIntentoRdiFallbackQuery,
};
