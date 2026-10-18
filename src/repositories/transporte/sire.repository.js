const pool = require('../../db');
const { expresionesVenta } = require('../../utils/sireVentaDocumento.utils');
const documento = expresionesVenta();
const monto = campo => `CASE WHEN COALESCE(tv.registrado,1)=0 THEN 0
  WHEN ${documento.tipo}='07' THEN -ABS(COALESCE(${campo},0))
  WHEN ${documento.tipo}='08' THEN ABS(COALESCE(${campo},0)) ELSE COALESCE(${campo},0) END`;


// Registro de ventas SIRe para operaciones de transporte.
const obtenerRegistroSireTransporteQuery = async (params) => {
  const result = await pool.query(
    `
      SELECT
        CAST(${documento.fecha} AS varchar(10)) AS fecha_emision,
        ${documento.tipo} AS tipo_comprobante,
        ${documento.serie} AS serie,
        ${documento.numero} AS numero,
        tv.elemento,
        tv.tipo_operacion,
        tv.cliente_id_doc AS tipo_doc_cliente,
        tv.cliente_documento_id AS nro_doc_cliente,
        tv.cliente AS cliente,
        ${monto('tv.r_gravado')}::numeric AS base_gravada,
        ${monto('tv.r_exonerado')}::numeric AS exonerado,
        0::numeric AS inafecto,
        ${monto('tv.r_igv')}::numeric AS igv,
        ${monto('COALESCE(tv.r_monto_total,tv.precio_neto)')}::numeric AS total,
        COALESCE(NULLIF(to_jsonb(tv)->>'r_moneda', ''), 'PEN')::varchar AS moneda,
        CASE
          WHEN COALESCE(tv.registrado, 1) = 0 THEN 'ANULADO'
          WHEN COALESCE(tv.r_vfirmado, '') <> '' THEN 'ACEPTADO'
          WHEN COALESCE(tv.numero_rdi, '') = ''
           AND COALESCE(tv.cdr_descripcion, '') <> '' THEN 'RECHAZADO'
          WHEN ${documento.tipo} = '03'
           AND COALESCE(tv.numero_rdi, '') = '' THEN 'SIN ENVIO SUNAT'
          WHEN COALESCE(tv.numero_rdi, '') <> ''
           AND COALESCE(rdi.estado, '') = 'ACEPTADO'
           AND COALESCE(rdi.respuesta_codigo, '') = '0' THEN 'ACEPTADO'
          WHEN COALESCE(tv.numero_rdi, '') <> ''
           AND COALESCE(rdi.estado, '') = 'RECHAZADO' THEN 'RECHAZADO'
          WHEN COALESCE(tv.numero_rdi, '') <> ''
           AND COALESCE(rdi.estado, '') IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'INCIERTO', '') THEN 'RDI PENDIENTE CDR'
          WHEN ${documento.tipo} = '01'
           AND COALESCE(tv.r_vfirmado, '') <> '' THEN 'ACEPTADO'
          WHEN ${documento.tipo} = '01' THEN 'SIN ENVIO SUNAT'
          ELSE COALESCE(NULLIF(tv.estado_sunat, ''), 'PENDIENTE')
        END AS estado_sunat,
        CASE
          WHEN COALESCE(tv.numero_rdi, '') <> '' THEN 'RDI'
          WHEN COALESCE(tv.r_vfirmado, '') <> '' THEN 'Individual'
          ELSE ''
        END AS modo_envio,
        tv.numero_rdi,
        rdi.ticket,
        COALESCE(rdi.respuesta_codigo, tv.cdr_codigo, CASE WHEN COALESCE(tv.estado_sunat, '') = 'A' THEN '0' ELSE NULL END) AS codigo_cdr,
        COALESCE(rdi.respuesta_desc, tv.cdr_descripcion) AS descripcion_cdr,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND ${documento.tipo} = '03' AND COALESCE(tv.numero_rdi, '') = '' THEN 'Boleta sin RDI' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND ${documento.tipo} = '03' AND COALESCE(tv.numero_rdi, '') = '' THEN 'Sin envio SUNAT' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND COALESCE(tv.numero_rdi, '') <> '' AND rdi.numero_rdi IS NULL THEN 'Inconsistencia local: RDI no encontrado' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND COALESCE(tv.numero_rdi, '') <> '' AND COALESCE(rdi.estado, '') IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'INCIERTO', '') THEN 'RDI pendiente de CDR' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND (COALESCE(rdi.estado, '') = 'RECHAZADO' OR COALESCE(tv.cdr_nivel, '') = 'RECHAZADO' OR COALESCE(tv.cdr_descripcion, '') <> '' OR COALESCE(tv.estado_sunat, '') IN ('R', 'E')) THEN 'Rechazado/error SUNAT' END
        ], NULL) AS observaciones
      FROM public.mve_transventa tv
      LEFT JOIN public.mve_rdi_sunat rdi
        ON rdi.id_usuario = tv.id_usuario
       AND rdi.documento_id = tv.documento_id
       AND rdi.numero_rdi = tv.numero_rdi
      WHERE tv.periodo = $1::text
        AND tv.id_usuario = $2::text
        AND tv.documento_id = $3::text
        AND tv.tipo_operacion IN ('B', 'E')
        AND ${documento.tipo} IN ('01', '03', '07', '08')
      ORDER BY
        ${documento.fecha} ASC,
        ${documento.tipo} ASC,
        ${documento.serie} ASC,
        NULLIF(REGEXP_REPLACE(${documento.numero}, '\\D', '', 'g'), '')::bigint ASC NULLS LAST,
        tv.elemento ASC
    `,
    params
  );

  return result.rows;
};

const obtenerComparacionSireTransporteQuery = async ({ idAnfitrion, documentoId, periodo, idLibro }) => {
  const vigente=await obtenerPropuestaGuardadaSireTransporteQuery({idAnfitrion,documentoId,periodo,idLibro,ticket:''});
  if (!vigente || !['PARSEADO','COMPARADO'].includes(vigente.estado)) throw Object.assign(
    new Error('Primero importa la propuesta SUNAT del ticket vigente antes de comparar.'),{statusCode:409});
  const tabla = await pool.query("SELECT to_regclass('public.mve_sire_reemplazo') AS tabla");
  if (tabla.rows[0]?.tabla) {
    const ultimo = await pool.query(`SELECT to_jsonb(r)->>'estado_actualizacion' AS actualizacion
      FROM public.mve_sire_reemplazo r WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text
        AND id_libro=$4::text AND estado='TERMINADO' ORDER BY fecha_preparacion DESC LIMIT 1`, [idAnfitrion,documentoId,periodo,idLibro]);
    if (ultimo.rows[0] && ultimo.rows[0].actualizacion !== 'ACTUALIZADO') throw Object.assign(
      new Error('El reemplazo termino. Actualiza la propuesta SUNAT antes de volver a comparar.'), { statusCode: 409 });
  }
  const result = await pool.query(
    `
      WITH propuesta AS (
        SELECT id_usuario, documento_id, periodo, ticket, nombre_archivo
          FROM public.mve_sire_propuesta_datos
         WHERE id_usuario = $1::text
           AND documento_id = $2::text
           AND periodo = $3::text
           AND id_libro = $4::text
           AND rubro = 'TRANSPORTE'
           AND estado IN ('PARSEADO', 'COMPARADO', 'DESCARGADO')
         ORDER BY fecha_descarga DESC NULLS LAST, fecha_generacion DESC, ticket DESC
         LIMIT 1
      ),
      sire_datos AS (
        SELECT
          CONCAT(d.r_cod,'-',d.r_serie,'-',d.r_numero)::varchar AS id_origen,
          'SIRE'::varchar(10) AS origen,
          d.linea,
          d.fecha_emision::date AS fecha_emision,
          d.r_cod AS tipo_comprobante,
          d.r_serie AS serie,
          d.r_numero AS numero,
          d.tipo_doc_cliente,
          d.nro_doc_cliente,
          d.cliente,
          COALESCE(d.base_gravada, 0)::numeric AS base_gravada,
          COALESCE(d.exonerado, 0)::numeric AS exonerado,
          COALESCE(d.inafecto, 0)::numeric AS inafecto,
          COALESCE(d.igv, 0)::numeric AS igv,
          COALESCE(d.total, 0)::numeric AS total,
          d.moneda,
          d.tipo_cambio,
          p.ticket,
          p.nombre_archivo,
          d.raw_linea
        FROM public.mve_sire_propuesta d
        JOIN propuesta p ON p.id_usuario=d.id_usuario AND p.documento_id=d.documento_id
          AND p.periodo=d.periodo AND p.ticket=d.ticket
      ),
      xpert_datos AS (
        SELECT
          CONCAT(tv.r_cod, '-', tv.r_serie, '-', tv.r_numero, '-', tv.elemento)::varchar AS id_origen,
          'XPERT'::varchar(10) AS origen,
          NULL::integer AS linea,
          ${documento.fecha}::date AS fecha_emision,
          ${documento.tipo}::varchar AS tipo_comprobante,
          ${documento.serie}::varchar AS serie,
          ${documento.numero}::varchar AS numero,
          tv.cliente_id_doc::varchar AS tipo_doc_cliente,
          tv.cliente_documento_id::varchar AS nro_doc_cliente,
          tv.cliente::varchar AS cliente,
          ${monto('tv.r_gravado')}::numeric AS base_gravada,
          ${monto('tv.r_exonerado')}::numeric AS exonerado,
          0::numeric AS inafecto,
          ${monto('tv.r_igv')}::numeric AS igv,
          ${monto('COALESCE(tv.r_monto_total,tv.precio_neto)')}::numeric AS total,
          COALESCE(NULLIF(to_jsonb(tv)->>'r_moneda', ''), 'PEN')::varchar AS moneda,
          COALESCE(NULLIF(to_jsonb(tv)->>'r_tc', '')::numeric, 1)::numeric AS tipo_cambio,
          NULL::varchar AS ticket,
          NULL::varchar AS nombre_archivo,
          NULL::text AS raw_linea,
          COALESCE(tv.registrado, 1)::integer AS registrado
        FROM public.mve_transventa tv
       WHERE tv.id_usuario = $1::text
         AND tv.documento_id = $2::text
         AND tv.periodo = $3::text
         AND tv.tipo_operacion IN ('B', 'E')
         AND ${documento.tipo} IN ('01', '03', '07', '08')
      ),
      -- Normalizar solo correlativos numericos; conservar el numero original para mostrarlo.
      sire_claves AS (
        SELECT s.*,
          CASE WHEN BTRIM(s.numero) ~ '^[0-9]+$'
            THEN COALESCE(NULLIF(LTRIM(BTRIM(s.numero), '0'), ''), '0')
            ELSE BTRIM(s.numero)
          END AS numero_clave
        FROM sire_datos s
      ),
      xpert_claves AS (
        SELECT x.*,
          CASE WHEN BTRIM(x.numero) ~ '^[0-9]+$'
            THEN COALESCE(NULLIF(LTRIM(BTRIM(x.numero), '0'), ''), '0')
            ELSE BTRIM(x.numero)
          END AS numero_clave
        FROM xpert_datos x
      ),
      sire AS (
        SELECT s.*, COUNT(*) OVER (
          PARTITION BY s.tipo_comprobante, s.serie, s.numero_clave
        ) AS duplicados_origen
        FROM sire_claves s
      ),
      xpert AS (
        SELECT x.*, COUNT(*) OVER (
          PARTITION BY x.tipo_comprobante, x.serie, x.numero_clave
        ) AS duplicados_origen
        FROM xpert_claves x
      ),
      base AS (
        SELECT
          'SIRE - XPERT'::varchar AS resultado,
          'CRITICO'::varchar AS severidad,
          'FALTANTE_XPERT'::varchar AS categoria,
          'Existe en SIRe, no existe en XPERT'::varchar AS observacion,
          s.id_origen, s.origen, s.linea, TO_CHAR(s.fecha_emision, 'YYYY/MM/DD') AS fecha_emision, s.tipo_comprobante, s.serie, s.numero,
          s.tipo_doc_cliente, s.nro_doc_cliente, s.cliente,
          s.base_gravada AS base_gravada_sire,
          NULL::numeric AS base_gravada_xpert,
          s.exonerado AS exonerado_sire,
          NULL::numeric AS exonerado_xpert,
          s.inafecto AS inafecto_sire,
          NULL::numeric AS inafecto_xpert,
          s.igv AS igv_sire,
          NULL::numeric AS igv_xpert,
          s.total AS total_sire,
          NULL::numeric AS total_xpert,
          s.total AS diferencia_total,
          s.moneda AS moneda_sire,
          NULL::varchar AS moneda_xpert,
          s.tipo_cambio AS tipo_cambio_sire,
          NULL::numeric AS tipo_cambio_xpert,
          s.ticket, s.nombre_archivo, s.raw_linea,
          TO_CHAR(s.fecha_emision, 'YYYY/MM/DD') AS fecha_emision_sire,
          NULL::text AS fecha_emision_xpert
          FROM sire s
         WHERE NOT EXISTS (
           SELECT 1
             FROM xpert x
            WHERE x.tipo_comprobante = s.tipo_comprobante
              AND x.serie = s.serie
              AND x.numero_clave = s.numero_clave
         )
        UNION ALL
        SELECT
          'XPERT - SIRE'::varchar AS resultado,
          CASE WHEN x.registrado = 0 THEN 'BAJO' ELSE 'CRITICO' END::varchar AS severidad,
          CASE WHEN x.registrado = 0 THEN 'ANULADO_SOLO_XPERT' ELSE 'FALTANTE_SIRE' END::varchar AS categoria,
          CASE WHEN x.registrado = 0 THEN 'Anulado en XPERT y no aparece en SIRe' ELSE 'Existe en XPERT, no existe en SIRe' END::varchar AS observacion,
          x.id_origen, x.origen, x.linea, TO_CHAR(x.fecha_emision, 'YYYY/MM/DD') AS fecha_emision, x.tipo_comprobante, x.serie, x.numero,
          x.tipo_doc_cliente, x.nro_doc_cliente, x.cliente,
          NULL::numeric, x.base_gravada,
          NULL::numeric, x.exonerado,
          NULL::numeric, x.inafecto,
          NULL::numeric, x.igv,
          NULL::numeric, x.total,
          (0 - x.total)::numeric AS diferencia_total,
          NULL::varchar, x.moneda,
          NULL::numeric, x.tipo_cambio,
          x.ticket, x.nombre_archivo, x.raw_linea,
          NULL::text AS fecha_emision_sire,
          TO_CHAR(x.fecha_emision, 'YYYY/MM/DD') AS fecha_emision_xpert
          FROM xpert x
         WHERE NOT EXISTS (
           SELECT 1
             FROM sire s
            WHERE s.tipo_comprobante = x.tipo_comprobante
              AND s.serie = x.serie
              AND s.numero_clave = x.numero_clave
         )
        UNION ALL
        SELECT
          'DIFERENCIA'::varchar AS resultado,
          CASE
            WHEN ABS(COALESCE(s.total, 0) - COALESCE(x.total, 0)) > 0.01 THEN 'CRITICO'
            WHEN ABS(COALESCE(s.igv, 0) - COALESCE(x.igv, 0)) > 0.01 THEN 'CRITICO'
            ELSE 'MEDIO'
          END::varchar AS severidad,
          CONCAT_WS(
            '+',
            CASE WHEN s.fecha_emision IS DISTINCT FROM x.fecha_emision THEN 'FECHA' END,
            CASE WHEN s.moneda IS DISTINCT FROM x.moneda THEN 'MONEDA' END,
            CASE WHEN ABS(COALESCE(s.total, 0) - COALESCE(x.total, 0)) > 0.01 THEN 'TOTAL' END,
            CASE WHEN ABS(COALESCE(s.igv, 0) - COALESCE(x.igv, 0)) > 0.01 THEN 'IGV' END,
            CASE WHEN ABS(COALESCE(s.base_gravada, 0) - COALESCE(x.base_gravada, 0)) > 0.01 THEN 'BASE' END,
            CASE WHEN ABS(COALESCE(s.exonerado, 0) - COALESCE(x.exonerado, 0)) > 0.01 THEN 'EXONERADO' END,
            CASE WHEN ABS(COALESCE(s.inafecto, 0) - COALESCE(x.inafecto, 0)) > 0.01 THEN 'INAFECTO' END
          )::varchar AS categoria,
          CONCAT_WS(
            '; ',
            CASE WHEN s.fecha_emision IS DISTINCT FROM x.fecha_emision THEN 'Fecha distinta' END,
            CASE WHEN s.moneda IS DISTINCT FROM x.moneda THEN 'Moneda distinta' END,
            CASE WHEN ABS(COALESCE(s.total, 0) - COALESCE(x.total, 0)) > 0.01 THEN 'Total distinto' END,
            CASE WHEN ABS(COALESCE(s.igv, 0) - COALESCE(x.igv, 0)) > 0.01 THEN 'IGV distinto' END,
            CASE WHEN ABS(COALESCE(s.base_gravada, 0) - COALESCE(x.base_gravada, 0)) > 0.01 THEN 'Base gravada distinta' END,
            CASE WHEN ABS(COALESCE(s.exonerado, 0) - COALESCE(x.exonerado, 0)) > 0.01 THEN 'Exonerado distinto' END,
            CASE WHEN ABS(COALESCE(s.inafecto, 0) - COALESCE(x.inafecto, 0)) > 0.01 THEN 'Inafecto distinto' END
          )::varchar AS observacion,
          s.id_origen, 'AMBOS'::varchar AS origen,
          s.linea,
          TO_CHAR(COALESCE(s.fecha_emision, x.fecha_emision), 'YYYY/MM/DD') AS fecha_emision,
          s.tipo_comprobante,
          s.serie,
          s.numero,
          COALESCE(s.tipo_doc_cliente, x.tipo_doc_cliente) AS tipo_doc_cliente,
          COALESCE(s.nro_doc_cliente, x.nro_doc_cliente) AS nro_doc_cliente,
          COALESCE(s.cliente, x.cliente) AS cliente,
          s.base_gravada, x.base_gravada,
          s.exonerado, x.exonerado,
          s.inafecto, x.inafecto,
          s.igv, x.igv,
          s.total, x.total,
          (COALESCE(s.total, 0) - COALESCE(x.total, 0))::numeric AS diferencia_total,
          s.moneda, x.moneda,
          s.tipo_cambio, x.tipo_cambio,
          s.ticket,
          s.nombre_archivo,
          s.raw_linea,
          TO_CHAR(s.fecha_emision, 'YYYY/MM/DD') AS fecha_emision_sire,
          TO_CHAR(x.fecha_emision, 'YYYY/MM/DD') AS fecha_emision_xpert
        FROM sire s
        JOIN xpert x
          ON x.tipo_comprobante = s.tipo_comprobante
         AND x.serie = s.serie
         AND x.numero_clave = s.numero_clave
        WHERE s.fecha_emision IS DISTINCT FROM x.fecha_emision
           OR s.moneda IS DISTINCT FROM x.moneda
           OR ABS(COALESCE(s.total, 0) - COALESCE(x.total, 0)) > 0.01
           OR ABS(COALESCE(s.igv, 0) - COALESCE(x.igv, 0)) > 0.01
           OR ABS(COALESCE(s.base_gravada, 0) - COALESCE(x.base_gravada, 0)) > 0.01
           OR ABS(COALESCE(s.exonerado, 0) - COALESCE(x.exonerado, 0)) > 0.01
           OR ABS(COALESCE(s.inafecto, 0) - COALESCE(x.inafecto, 0)) > 0.01
        UNION ALL
        SELECT
          'DUPLICADO'::varchar AS resultado,
          'MEDIO'::varchar AS severidad,
          'DUPLICADO_SIRE'::varchar AS categoria,
          'Comprobante duplicado en SIRe'::varchar AS observacion,
          s.id_origen, s.origen, s.linea, TO_CHAR(s.fecha_emision, 'YYYY/MM/DD') AS fecha_emision, s.tipo_comprobante, s.serie, s.numero,
          s.tipo_doc_cliente, s.nro_doc_cliente, s.cliente,
          s.base_gravada, NULL::numeric,
          s.exonerado, NULL::numeric,
          s.inafecto, NULL::numeric,
          s.igv, NULL::numeric,
          s.total, NULL::numeric,
          s.total AS diferencia_total,
          s.moneda, NULL::varchar,
          s.tipo_cambio, NULL::numeric,
          s.ticket, s.nombre_archivo, s.raw_linea,
          TO_CHAR(s.fecha_emision, 'YYYY/MM/DD') AS fecha_emision_sire,
          NULL::text AS fecha_emision_xpert
          FROM sire s
         WHERE s.duplicados_origen > 1
        UNION ALL
        SELECT
          'DUPLICADO'::varchar AS resultado,
          'MEDIO'::varchar AS severidad,
          'DUPLICADO_XPERT'::varchar AS categoria,
          'Comprobante duplicado en XPERT'::varchar AS observacion,
          x.id_origen, x.origen, x.linea, TO_CHAR(x.fecha_emision, 'YYYY/MM/DD') AS fecha_emision, x.tipo_comprobante, x.serie, x.numero,
          x.tipo_doc_cliente, x.nro_doc_cliente, x.cliente,
          NULL::numeric, x.base_gravada,
          NULL::numeric, x.exonerado,
          NULL::numeric, x.inafecto,
          NULL::numeric, x.igv,
          NULL::numeric, x.total,
          (0 - x.total)::numeric AS diferencia_total,
          NULL::varchar, x.moneda,
          NULL::numeric, x.tipo_cambio,
          x.ticket, x.nombre_archivo, x.raw_linea,
          NULL::text AS fecha_emision_sire,
          TO_CHAR(x.fecha_emision, 'YYYY/MM/DD') AS fecha_emision_xpert
          FROM xpert x
         WHERE x.duplicados_origen > 1
      )
      SELECT *
        FROM base
       ORDER BY
         CASE severidad WHEN 'CRITICO' THEN 1 WHEN 'MEDIO' THEN 2 ELSE 3 END,
         fecha_emision NULLS LAST,
         tipo_comprobante,
         serie,
         numero,
         categoria
    `,
    [idAnfitrion, documentoId, periodo, idLibro]
  );

  return result.rows;
};

const obtenerPropuestaGuardadaSireTransporteQuery = async ({ idAnfitrion, documentoId, periodo, idLibro, ticket }, db = pool) => {
  const result = await db.query(
    `SELECT ticket AS id_propuesta, ticket, nombre_archivo, estado, cantidad_registros, fecha_generacion
       FROM public.mve_sire_propuesta_datos
      WHERE id_usuario = $1::text AND documento_id = $2::text AND periodo = $3::text AND id_libro = $4::text
        AND rubro = 'TRANSPORTE'
        AND estado IN ('GENERADO','PARSEADO','COMPARADO','DESCARGADO')
        AND ($5::text = '' OR ticket = $5::text)
        AND ticket=COALESCE(NULLIF((SELECT sire_tpropuesta FROM public.mct_contabilidadticket t
          WHERE t.id_usuario=$1::text AND t.documento_id=$2::text AND t.periodo=$3::text AND t.id_libro=$4::text LIMIT 1),''),ticket)
      ORDER BY fecha_generacion DESC, fecha_descarga DESC NULLS LAST, ticket DESC
      LIMIT 1`,
    [idAnfitrion, documentoId, periodo, idLibro, ticket]
  );
  return result.rows[0] || null;
};

const obtenerReemplazoTerminadoQuery = async ({ idAnfitrion, documentoId, periodo, idLibro }) => {
  const tabla = await pool.query("SELECT to_regclass('public.mve_sire_reemplazo') AS tabla");
  if (!tabla.rows[0]?.tabla) return null;
  const result = await pool.query(`SELECT ticket_actualizacion,estado_actualizacion FROM public.mve_sire_reemplazo
    WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro=$4::text AND estado='TERMINADO'
    ORDER BY fecha_preparacion DESC LIMIT 1`, [idAnfitrion,documentoId,periodo,idLibro]);
  return result.rows[0] || null;
};
module.exports = {
  obtenerReemplazoTerminadoQuery,
  obtenerPropuestaGuardadaSireTransporteQuery,
  obtenerRegistroSireTransporteQuery,
  obtenerComparacionSireTransporteQuery,
};
