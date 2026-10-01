// Capa de acceso a datos del Dashboard de Transporte.
//
// Aqui vive todo lo que habla con PostgreSQL: el texto SQL y el pool. No decide
// reglas ni permisos; solo ejecuta y devuelve las filas.
const pool = require('../../db');

// Condicion reutilizable para validar si el invitado esta dentro de
// alguno de sus turnos activos en mad_punto_venta_usuario.
const condicionTurnoPuntoVentaUsuario = `
  (
    (
      pvu.turno1_inicio IS NOT NULL
      AND pvu.turno1_fin IS NOT NULL
      AND (
        (
          pvu.turno1_inicio <= pvu.turno1_fin
          AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN pvu.turno1_inicio AND pvu.turno1_fin
        )
        OR (
          pvu.turno1_inicio > pvu.turno1_fin
          AND (
            (now() AT TIME ZONE 'America/Lima')::time >= pvu.turno1_inicio
            OR (now() AT TIME ZONE 'America/Lima')::time <= pvu.turno1_fin
          )
        )
      )
    )
    OR (
      pvu.turno2_inicio IS NOT NULL
      AND pvu.turno2_fin IS NOT NULL
      AND (
        (
          pvu.turno2_inicio <= pvu.turno2_fin
          AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN pvu.turno2_inicio AND pvu.turno2_fin
        )
        OR (
          pvu.turno2_inicio > pvu.turno2_fin
          AND (
            (now() AT TIME ZONE 'America/Lima')::time >= pvu.turno2_inicio
            OR (now() AT TIME ZONE 'America/Lima')::time <= pvu.turno2_fin
          )
        )
      )
    )
    OR (
      pvu.turno3_inicio IS NOT NULL
      AND pvu.turno3_fin IS NOT NULL
      AND (
        (
          pvu.turno3_inicio <= pvu.turno3_fin
          AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN pvu.turno3_inicio AND pvu.turno3_fin
        )
        OR (
          pvu.turno3_inicio > pvu.turno3_fin
          AND (
            (now() AT TIME ZONE 'America/Lima')::time >= pvu.turno3_inicio
            OR (now() AT TIME ZONE 'America/Lima')::time <= pvu.turno3_fin
          )
        )
      )
    )
  )
`;

const condicionPagoSql = "COALESCE(NULLIF(REGEXP_REPLACE(UPPER(COALESCE(tv.condicion_pago, '')), '[^A-Z]', '', 'g'), ''), 'PAGADO')";
const condicionPorCobrarSql = `${condicionPagoSql} = 'PORCOBRAR'`;

// ¿El invitado es superusuario? Lo decide el service para abrir el alcance.
const esSuperUsuarioQuery = async (idInvitado) => {
  const result = await pool.query(
    "SELECT 1 FROM mad_usuario WHERE id_usuario = $1 AND super = '1' LIMIT 1",
    [idInvitado]
  );

  return result.rows;
};

// Puntos de venta vigentes de un invitado convencional (con turno activo).
const obtenerPuntosVentaUsuarioQuery = async ({ id_anfitrion, documento_id, id_invitado }) => {
  const result = await pool.query(`
    SELECT pvu.id_punto_venta
      FROM mad_punto_venta_usuario pvu
      JOIN mad_punto_venta pv
        ON pv.id_usuario = pvu.id_usuario
       AND pv.documento_id = pvu.documento_id
       AND pv.id_punto_venta = pvu.id_punto_venta
     WHERE pvu.id_usuario = $1
       AND pvu.documento_id = $2
       AND pvu.id_invitado = $3
       AND pvu.activo = TRUE
       AND pv.activo = TRUE
       AND (pvu.sin_restriccion = TRUE OR ${condicionTurnoPuntoVentaUsuario})
     ORDER BY pv.nombre, pv.id_punto_venta
  `, [id_anfitrion, documento_id, id_invitado]);

  return result.rows;
};

// KPI principales de caja. Los fragmentos de filtro los arma el service.
const obtenerResumenQuery = async ({
  params,
  filtros,
  filtrosCaja,
  filtroAgenciaOrigen,
  filtroAgenciaDestino,
  filtroMontoTotal,
  filtroEfectivoAgencia,
  filtroPendienteCobroEntrega,
}) => {
  const result = await pool.query(`
    WITH base AS (
      SELECT tv.*
      FROM mve_transventa tv
      WHERE tv.periodo = $1
        AND tv.id_usuario = $2
        AND tv.documento_id = $3
        AND tv.tipo_operacion IN ('B', 'E')
        ${filtros.join('\n')}
    )
    SELECT
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'E' ${filtroAgenciaOrigen}), 0)::integer AS encomiendas,
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'B' ${filtroAgenciaOrigen}), 0)::integer AS boletos,
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'E' AND tv.entrega_fecha IS NULL ${filtroAgenciaOrigen}), 0)::integer AS encomiendas_por_entregar,
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'E' AND tv.entrega_fecha IS NOT NULL ${filtroAgenciaOrigen}), 0)::integer AS encomiendas_entregadas,
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (
        WHERE tv.tipo_operacion IN ('B', 'E')
          AND COALESCE(tv.r_vfirmado, '') = ''
          AND COALESCE(tv.numero_rdi, '') = ''
          AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03'
          ${filtroAgenciaOrigen}
      ), 0)::integer AS sunat_pendientes,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'E' ${filtroAgenciaOrigen}), 0)::numeric AS monto_encomiendas_facturado,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'B' ${filtroAgenciaOrigen}), 0)::numeric AS monto_boletos,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)) FILTER (WHERE ${filtroMontoTotal}), 0)::numeric AS monto_total,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)) FILTER (
        WHERE tv.tipo_operacion = 'E'
          AND ${condicionPorCobrarSql}
          AND tv.entrega_fecha IS NULL
          AND ${filtroPendienteCobroEntrega}
      ), 0)::numeric AS monto_por_cobrar_pendiente_entrega,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)) FILTER (
        WHERE tv.tipo_operacion = 'E'
          AND NOT (${condicionPorCobrarSql})
          ${filtroAgenciaOrigen}
      ), 0)::numeric AS monto_efectivo_origen_agencia,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)) FILTER (
        WHERE tv.tipo_operacion = 'E'
          AND ${condicionPorCobrarSql}
          AND tv.entrega_fecha IS NOT NULL
          ${filtroAgenciaDestino}
      ), 0)::numeric AS monto_efectivo_destino_entregado,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)) FILTER (
        WHERE tv.tipo_operacion = 'E'
          AND ${filtroEfectivoAgencia}
          AND NOT (${condicionPorCobrarSql})
      ), 0)::numeric AS monto_efectivo_agencia,
      (
        SELECT COALESCE(SUM(c.importe * COALESCE(c.registrado, 1)), 0)::numeric
          FROM mve_transcaja c
         WHERE c.periodo = $1
           AND c.id_usuario = $2
           AND c.documento_id = $3
           AND c.tipo_movimiento = 'S'
           ${filtrosCaja.join('\n')}
      ) AS monto_caja_manual
    FROM base tv
  `, params);

  return result.rows;
};

// Documentos por franjas de 2 horas.
const obtenerProductividadQuery = async ({ params, filtros }) => {
  const result = await pool.query(`
    SELECT
      CONCAT(LPAD((FLOOR(EXTRACT(HOUR FROM COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp)) / 2) * 2)::text, 2, '0'), '-',
             LPAD(((FLOOR(EXTRACT(HOUR FROM COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp)) / 2) * 2) + 2)::text, 2, '0')) AS hora,
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'E'), 0)::integer AS encomiendas,
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'B'), 0)::integer AS boletos,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto_total
    FROM mve_transventa tv
    WHERE tv.periodo = $1
      AND tv.id_usuario = $2
      AND tv.documento_id = $3
      AND tv.tipo_operacion IN ('B', 'E')
      ${filtros}
    GROUP BY 1
    ORDER BY 1
  `, params);

  return result.rows;
};

// Estado tributario de boletas de transporte.
const obtenerSunatQuery = async ({ params, filtros }) => {
  const result = await pool.query(`
    SELECT
      tv.tipo_operacion,
      CASE
        WHEN COALESCE(tv.numero_rdi, '') <> '' THEN 'RDI'
        WHEN COALESCE(tv.r_vfirmado, '') <> '' THEN 'FIRMADO'
        ELSE 'PENDIENTE'
      END AS estado_sunat,
      COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS documentos,
      COALESCE(SUM(tv.r_gravado * COALESCE(tv.registrado, 1)), 0)::numeric AS base_gravada,
      COALESCE(SUM(tv.r_exonerado * COALESCE(tv.registrado, 1)), 0)::numeric AS base_exonerada,
      COALESCE(SUM(tv.r_igv * COALESCE(tv.registrado, 1)), 0)::numeric AS igv,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto_total
    FROM mve_transventa tv
    WHERE tv.periodo = $1
      AND tv.id_usuario = $2
      AND tv.documento_id = $3
      AND tv.tipo_operacion IN ('B', 'E')
      AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03'
      ${filtros}
    GROUP BY tv.tipo_operacion, 2
    ORDER BY tv.tipo_operacion, 2
  `, params);

  return result.rows;
};

// Rutas con mas movimiento (top 8).
const obtenerRutasQuery = async ({ params, filtros }) => {
  const result = await pool.query(`
    SELECT
      COALESCE(ruta.nombre, 'Sin ruta') AS ruta,
      tv.id_ruta,
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'B'), 0)::integer AS boletos,
      COALESCE(SUM(COALESCE(tv.registrado, 1)) FILTER (WHERE tv.tipo_operacion = 'E'), 0)::integer AS encomiendas,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto_total
    FROM mve_transventa tv
    LEFT JOIN mve_transruta ruta
      ON ruta.id_usuario = tv.id_usuario
     AND ruta.documento_id = tv.documento_id
     AND ruta.id_ruta = tv.id_ruta
    WHERE tv.periodo = $1
      AND tv.id_usuario = $2
      AND tv.documento_id = $3
      AND tv.tipo_operacion IN ('B', 'E')
      ${filtros}
    GROUP BY tv.id_ruta, COALESCE(ruta.nombre, 'Sin ruta')
    ORDER BY monto_total DESC, ruta
    LIMIT 8
  `, params);

  return result.rows;
};

// Compara los ultimos periodos en cantidad de encomiendas.
// Usa UNION ALL para consultar cada periodo por separado; esto ayuda cuando
// mve_transventa esta particionada por periodo y el SaaS mueve varias empresas.
// Este indicador ignora ?fecha porque su objetivo es mensual.
const obtenerComparativoMensualQuery = async ({
  periodos,
  params,
  puntoVentaParam,
  puntosVentaParam,
  usuarioOperacionParam,
}) => {
  const query = periodos.map((_, index) => {
    const periodoParam = index + 3;
    const filtroPuntoVenta = puntoVentaParam ? `AND tv.id_punto_venta = $${puntoVentaParam}` : '';
    const filtroPuntosVenta = puntosVentaParam ? `AND tv.id_punto_venta = ANY($${puntosVentaParam}::varchar[])` : '';
    const filtroUsuarioOperacion = usuarioOperacionParam ? `AND tv.ctrl_crea_us = $${usuarioOperacionParam}` : '';

    return `
      SELECT
        $${periodoParam}::text AS periodo,
        COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS encomiendas,
        COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto_total
      FROM mve_transventa tv
      WHERE tv.periodo = $${periodoParam}
        AND tv.id_usuario = $1
        AND tv.documento_id = $2
        AND tv.tipo_operacion = 'E'
        ${filtroPuntoVenta}
        ${filtroPuntosVenta}
        ${filtroUsuarioOperacion}
    `;
  }).join('\nUNION ALL\n');

  const result = await pool.query(query, params);

  return result.rows;
};

// Recaudacion por agencia.
const obtenerRecaudacionAgenciasQuery = async ({
  params,
  filtrosVentaOrigen,
  filtrosVentaDestino,
  filtrosFechaCaja,
  filtrosPuntoVenta,
}) => {
  const result = await pool.query(`
    WITH ventas AS (
      SELECT tv.*
        FROM mve_transventa tv
       WHERE tv.periodo = $1
         AND tv.id_usuario = $2
         AND tv.documento_id = $3
         AND tv.tipo_operacion = 'E'
    )
    SELECT
      pv.id_punto_venta,
      pv.nombre AS agencia,
      COALESCE(origen_total.encomiendas, 0)::integer AS encomiendas_facturadas,
      COALESCE(origen_total.monto, 0)::numeric AS monto_facturado,
      COALESCE(por_pagar.encomiendas, 0)::integer AS encomiendas_por_pagar,
      COALESCE(por_pagar.monto, 0)::numeric AS monto_por_pagar,
      COALESCE(salidas.encomiendas, 0)::integer AS encomiendas_salidas_dinero,
      COALESCE(salidas.monto, 0)::numeric AS monto_salidas_dinero,
      COALESCE(caja_manual.monto, 0)::numeric AS monto_caja_manual,
      GREATEST(
        COALESCE(origen_total.monto, 0) + COALESCE(salidas.monto, 0) - COALESCE(caja_manual.monto, 0),
        0
      )::numeric AS monto_recaudado,
      GREATEST(
        COALESCE(origen_total.monto, 0) + COALESCE(salidas.monto, 0) - COALESCE(caja_manual.monto, 0),
        0
      )::numeric AS monto_efectivo
    FROM mad_punto_venta pv
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS encomiendas,
        COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto
      FROM ventas tv
      WHERE tv.id_punto_venta = pv.id_punto_venta
        AND NOT (${condicionPorCobrarSql})
        ${filtrosVentaOrigen.join('\n')}
    ) origen_total ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS encomiendas,
        COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto
      FROM ventas tv
      WHERE tv.id_punto_venta = pv.id_punto_venta
        AND ${condicionPorCobrarSql}
        AND tv.entrega_fecha IS NULL
        ${filtrosVentaOrigen.join('\n')}
    ) por_pagar ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS encomiendas,
        COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto
      FROM ventas tv
      WHERE tv.id_punto_venta_dest = pv.id_punto_venta
        AND ${condicionPorCobrarSql}
        AND tv.entrega_fecha IS NOT NULL
        ${filtrosVentaDestino.join('\n')}
    ) salidas ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(c.importe * COALESCE(c.registrado, 1)), 0)::numeric AS monto
        FROM mve_transcaja c
       WHERE c.id_usuario = pv.id_usuario
         AND c.documento_id = pv.documento_id
         AND c.periodo = $1
         AND c.id_punto_venta = pv.id_punto_venta
         AND c.tipo_movimiento = 'S'
         ${filtrosFechaCaja.join('\n')}
    ) caja_manual ON TRUE
    WHERE pv.id_usuario = $2
      AND pv.documento_id = $3
      AND pv.activo = TRUE
      ${filtrosPuntoVenta.join('\n')}
    ORDER BY monto_efectivo DESC, monto_facturado DESC, pv.nombre
  `, params);

  return result.rows;
};

// Usuarios que registraron movimiento en el filtro actual.
const obtenerUsuariosQuery = async ({ params, filtros }) => {
  const result = await pool.query(`
    SELECT tv.ctrl_crea_us AS id_usuario,
           tv.ctrl_crea_us AS nombre,
           COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS documentos,
           COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto_total
      FROM mve_transventa tv
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.tipo_operacion IN ('B', 'E')
       AND COALESCE(tv.ctrl_crea_us, '') <> ''
       ${filtros}
     GROUP BY tv.ctrl_crea_us
     ORDER BY nombre, id_usuario
  `, params);

  return result.rows;
};

module.exports = {
  esSuperUsuarioQuery,
  obtenerPuntosVentaUsuarioQuery,
  obtenerResumenQuery,
  obtenerProductividadQuery,
  obtenerSunatQuery,
  obtenerRutasQuery,
  obtenerComparativoMensualQuery,
  obtenerRecaudacionAgenciasQuery,
  obtenerUsuariosQuery,
};