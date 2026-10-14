const pool = require('../../db');

// Registro de ventas SIRe para operaciones de transporte.
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
        CASE WHEN COALESCE(tv.registrado, 1) = 0 THEN 0 ELSE COALESCE(tv.r_gravado, 0) END::numeric AS base_gravada,
        CASE WHEN COALESCE(tv.registrado, 1) = 0 THEN 0 ELSE COALESCE(tv.r_exonerado, 0) END::numeric AS exonerado,
        0::numeric AS inafecto,
        CASE WHEN COALESCE(tv.registrado, 1) = 0 THEN 0 ELSE COALESCE(tv.r_igv, 0) END::numeric AS igv,
        CASE WHEN COALESCE(tv.registrado, 1) = 0 THEN 0 ELSE COALESCE(tv.r_monto_total, tv.precio_neto, 0) END::numeric AS total,
        'PEN'::varchar AS moneda,
        CASE
          WHEN COALESCE(tv.registrado, 1) = 0 THEN 'ANULADO'
          WHEN COALESCE(tv.r_vfirmado, '') <> '' THEN 'ACEPTADO'
          WHEN COALESCE(tv.numero_rdi, '') = ''
           AND COALESCE(tv.cdr_descripcion, '') <> '' THEN 'RECHAZADO'
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
        COALESCE(rdi.respuesta_codigo, tv.cdr_codigo, CASE WHEN COALESCE(tv.estado_sunat, '') = 'A' THEN '0' ELSE NULL END) AS codigo_cdr,
        COALESCE(rdi.respuesta_desc, tv.cdr_descripcion) AS descripcion_cdr,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03' AND COALESCE(tv.numero_rdi, '') = '' THEN 'Boleta sin RDI' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03' AND COALESCE(tv.numero_rdi, '') = '' THEN 'Sin envio SUNAT' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND COALESCE(tv.numero_rdi, '') <> '' AND rdi.numero_rdi IS NULL THEN 'Inconsistencia local: RDI no encontrado' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND COALESCE(tv.numero_rdi, '') <> '' AND COALESCE(rdi.estado, '') IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'INCIERTO', '') THEN 'RDI pendiente de CDR' END,
          CASE WHEN COALESCE(tv.registrado, 1) = 1 AND COALESCE(tv.r_vfirmado, '') = '' AND (COALESCE(rdi.estado, '') = 'RECHAZADO' OR COALESCE(tv.cdr_nivel, '') = 'RECHAZADO' OR COALESCE(tv.cdr_descripcion, '') <> '' OR COALESCE(tv.estado_sunat, '') IN ('R', 'E')) THEN 'Rechazado/error SUNAT' END
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

module.exports = {
  obtenerRegistroSireTransporteQuery,
};
