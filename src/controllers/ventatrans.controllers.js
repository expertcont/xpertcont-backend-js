const pool = require('../db');
const fetch = require('node-fetch');

const columnasVentaTrans = `
  CAST(r_fecemi AS VARCHAR(50)) AS r_fecemi,
  r_cod,
  r_serie,
  r_numero,
  elemento,
  tipo_operacion,
  r_cod_ref,
  r_serie_ref,
  r_numero_ref,
  CAST(r_fecemi_ref AS VARCHAR(50)) AS r_fecemi_ref,
  cliente_id_doc AS id_documento,
  cliente_id_doc,
  cliente,
  cliente_documento_id AS cliente_documento,
  cliente_documento_id,
  cliente_telefono,
  cliente_direccion_fact,
  id_punto_venta,
  cliente_zona AS remitente_zona,
  cliente_zona,
  cliente_direccion AS remitente_direccion,
  cliente_direccion,
  id_ruta,
  descripcion,
  placa,
  licencia,
  asiento,
  pasajero_edad,
  destinatario_id_doc,
  destinatario,
  destinatario_documento_id AS destinatario_documento,
  destinatario_documento_id,
  destinatario_telefono,
  id_punto_venta_dest,
  destinatario_zona,
  destinatario_direccion,
  CAST(entrega_fecha AS VARCHAR(50)) AS entrega_fecha,
  entrega_documento_id AS entrega_documento,
  entrega_documento_id,
  entrega_nombres,
  entrega_ctrl_us,
  1 AS cantidad,
  precio_neto AS precio_unitario,
  precio_neto,
  r_gravado,
  r_exonerado,
  r_igv,
  r_monto_total,
  porc_igv,
  condicion_pago,
  CAST(llegada_aprox AS VARCHAR(50)) AS llegada_aprox,
  numero_rdi,
  estado_sunat,
  ctrl_crea,
  ctrl_crea_us,
  ctrl_mod,
  ctrl_mod_us
`;

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

const validarTipoOperacion = (tipoOperacion) => ['B', 'E'].includes(tipoOperacion);

const toIsoDate = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return String(value).split('T')[0].split(' ')[0];
};

const toIsoTime = (value) => {
  if (!value) return new Date().toISOString().split('T')[1].split('.')[0];
  if (value instanceof Date) {
    return value.toISOString().split('T')[1].split('.')[0];
  }
  const text = String(value);
  if (text.includes('T')) return text.split('T')[1].split('.')[0];
  if (text.includes(' ')) return text.split(' ')[1].split('.')[0];
  return text.split('.')[0];
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizarErrorSunatTransporte = (responseData, fallbackMessage = 'Error en la API SUNAT') => {
  const data = responseData?.error || responseData?.data || responseData || {};
  const nivel = data.nivel || 'ERROR';
  const descripcion = data.respuesta_sunat_descripcion || data.mensaje || data.message || fallbackMessage;

  const tituloPorNivel = {
    RECHAZADO: 'Comprobante rechazado',
    PENDIENTE: 'CDR pendiente',
    ERROR: 'No se pudo enviar a SUNAT'
  };

  const mensajePorNivel = {
    RECHAZADO: 'SUNAT rechazo el comprobante. Revise el motivo antes de emitir otro.',
    PENDIENTE: 'SUNAT recibio el comprobante, pero aun no entrega el CDR.',
    ERROR: 'No pudimos procesar el comprobante con SUNAT.'
  };

  return {
    success: false,
    estado: data.estado === true,
    nivel,
    codigo: data.codigo || 'ERROR_SUNAT',
    titulo_usuario: data.titulo_usuario || tituloPorNivel[nivel] || tituloPorNivel.ERROR,
    mensaje_usuario: data.mensaje_usuario || mensajePorNivel[nivel] || mensajePorNivel.ERROR,
    respuesta_sunat_descripcion: descripcion,
    detalle_tecnico: data.detalle_sunat || data.detalleSunat || descripcion,
    permite_reintento: data.permite_reintento ?? data.permiteReintento ?? true,
    cdr_pendiente: data.cdr_pendiente || '0',
    consumio_correlativo: data.consumio_correlativo ?? data.consumioCorrelativo ?? false,
    ruta_xml: data.ruta_xml || 'error',
    ruta_cdr: data.ruta_cdr || 'error',
    ruta_pdf: data.ruta_pdf || 'error',
    codigo_hash: data.codigo_hash || null
  };
};

const leerRespuestaSunat = async (apiResponse) => {
  const raw = await apiResponse.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    return { message: raw };
  }
};

const estadoSunatTransportePorNivel = (nivel) => {
  if (nivel === 'ACEPTADO') return 'A';
  if (nivel === 'PENDIENTE') return 'P';
  if (nivel === 'RECHAZADO') return 'R';
  return 'E';
};

const obtenerUltimosPeriodos = (periodo, cantidad = 3) => {
  const match = String(periodo || '').match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return [periodo].filter(Boolean);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, 1));

  return Array.from({ length: cantidad }, (_, index) => {
    const periodoDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - index, 1));
    return [
      periodoDate.getUTCFullYear(),
      String(periodoDate.getUTCMonth() + 1).padStart(2, '0')
    ].join('-');
  });
};

const generarNumeroVentaTrans = async ({
  id_anfitrion,
  documento_id,
  periodo,
  r_cod,
  r_serie,
}) => {
  const query = `
    SELECT LPAD((COALESCE(MAX(r_numero::integer), 0) + 1)::text, 10, '0') AS r_numero
      FROM mve_transventa
     WHERE id_usuario = $1
       AND documento_id = $2
       AND periodo = $3
       AND r_cod = $4
       AND r_serie = $5
       AND r_numero ~ '^[0-9]+$'
  `;

  const result = await pool.query(query, [
    id_anfitrion,
    documento_id,
    periodo,
    r_cod,
    r_serie,
  ]);

  return result.rows[0]?.r_numero || '0000000001';
};

const obtenerRutaTransporte = async ({
  id_anfitrion,
  documento_id,
  id_ruta,
}) => {
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

const calcularTributosTransporte = ({
  tipo_operacion,
  cantidad,
  precio_unitario,
  precio_neto,
  r_gravado,
  r_exonerado,
  r_igv,
  r_monto_total,
  porc_igv,
}) => {
  const cantidadNum = Number(cantidad || 1);
  const precioUnitarioNum = Number(precio_unitario || 0);
  const total = Number(precio_neto ?? r_monto_total ?? (cantidadNum * precioUnitarioNum));
  const igvPorcentaje = Number(porc_igv ?? 18);

  if (
    r_gravado !== undefined ||
    r_exonerado !== undefined ||
    r_igv !== undefined
  ) {
    return {
      precio_neto: precio_neto ?? total,
      r_gravado: r_gravado ?? 0,
      r_exonerado: r_exonerado ?? 0,
      r_igv: r_igv ?? 0,
      r_monto_total: r_monto_total ?? total,
      porc_igv: porc_igv ?? (tipo_operacion === 'E' ? igvPorcentaje : 0),
    };
  }

  if (tipo_operacion === 'E') {
    const base = Number((total / (1 + igvPorcentaje / 100)).toFixed(2));
    const igv = Number((total - base).toFixed(2));

    return {
      precio_neto: total,
      r_gravado: base,
      r_exonerado: 0,
      r_igv: igv,
      r_monto_total: total,
      porc_igv: igvPorcentaje,
    };
  }

  return {
    precio_neto: total,
    r_gravado: 0,
    r_exonerado: total,
    r_igv: 0,
    r_monto_total: total,
    porc_igv: 0,
  };
};

// Lee los parametros comunes del dashboard.
// Se permite consultar todo el periodo o un dia puntual con ?fecha=YYYY-MM-DD.
const resolverFiltroDashboardTransporte = (req) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;
  const fecha = req.query.fecha || (dia && dia !== '*' ? `${periodo}-${String(dia).padStart(2, '0')}` : null);
  const idPuntoVenta = req.query.id_punto_venta || null;
  const idInvitado = req.query.id_invitado || null;
  const superUsuario = req.query.super_usuario || req.query.super || null;

  return {
    periodo,
    id_anfitrion,
    documento_id,
    fecha,
    id_punto_venta: idPuntoVenta,
    id_invitado: idInvitado,
    super_usuario: superUsuario,
    acceso_total: !idInvitado || id_anfitrion === idInvitado || String(superUsuario) === '1',
    id_usuario_operacion: null,
    id_puntos_venta: null,
  };
};

// Valida lo minimo para que todas las consultas apunten a una empresa/periodo real.
const validarFiltroDashboardTransporte = ({ periodo, id_anfitrion, documento_id }) => (
  periodo && id_anfitrion && documento_id
);

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

const obtenerPuntosVentaDashboardUsuario = async ({ id_anfitrion, documento_id, id_invitado }) => {
  if (!id_anfitrion || !documento_id || !id_invitado) {
    return [];
  }

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

  return result.rows.map((item) => item.id_punto_venta).filter(Boolean);
};

const resolverAccesoDashboardTransporte = async (filtro) => {
  if (!filtro.id_invitado || filtro.id_anfitrion === filtro.id_invitado) {
    return {
      ...filtro,
      acceso_total: true,
      id_usuario_operacion: null,
      id_puntos_venta: null,
    };
  }

  if (String(filtro.super_usuario) === '1') {
    return {
      ...filtro,
      acceso_total: true,
      id_usuario_operacion: null,
      id_puntos_venta: null,
    };
  }

  const superQuery = await pool.query(
    "SELECT 1 FROM mad_usuario WHERE id_usuario = $1 AND super = '1' LIMIT 1",
    [filtro.id_invitado]
  );

  if (superQuery.rows.length > 0) {
    return {
      ...filtro,
      acceso_total: true,
      id_usuario_operacion: null,
      id_puntos_venta: null,
    };
  }

  const puntosVentaPermitidos = await obtenerPuntosVentaDashboardUsuario(filtro);
  const idPuntoVenta = filtro.id_punto_venta && puntosVentaPermitidos.includes(filtro.id_punto_venta)
    ? filtro.id_punto_venta
    : null;
  const puntosVentaFiltro = idPuntoVenta ? null : (puntosVentaPermitidos.length > 0 ? puntosVentaPermitidos : ['__SIN_PUNTO_VENTA__']);

  return {
    ...filtro,
    acceso_total: false,
    id_punto_venta: idPuntoVenta,
    id_puntos_venta: puntosVentaFiltro,
    id_usuario_operacion: filtro.id_invitado,
    puntos_venta_permitidos: puntosVentaPermitidos,
  };
};

// Agrega filtros opcionales reutilizables sin duplicar SQL en cada indicador.
const agregarFiltroDashboardTransporte = ({ params, fecha, id_punto_venta, id_puntos_venta, id_usuario_operacion }) => {
  const filtros = [];

  if (fecha) {
    params.push(fecha);
    filtros.push(`AND tv.r_fecemi = $${params.length}::date`);
  }

  if (id_punto_venta) {
    params.push(id_punto_venta);
    filtros.push(`AND tv.id_punto_venta = $${params.length}`);
  }

  if (Array.isArray(id_puntos_venta) && id_puntos_venta.length > 0) {
    params.push(id_puntos_venta);
    filtros.push(`AND tv.id_punto_venta = ANY($${params.length}::varchar[])`);
  }

  if (id_usuario_operacion) {
    params.push(id_usuario_operacion);
    filtros.push(`AND tv.ctrl_crea_us = $${params.length}`);
  }

  return filtros.join('\n');
};

const condicionPagoSql = "COALESCE(NULLIF(REGEXP_REPLACE(UPPER(COALESCE(tv.condicion_pago, '')), '[^A-Z]', '', 'g'), ''), 'PAGADO')";
const condicionPorCobrarSql = `${condicionPagoSql} = 'PORCOBRAR'`;

// Calcula los KPI principales: encomiendas, boletos, entregas, SUNAT y ventas.
const obtenerResumenDashboardTransporteData = async (filtro) => {
  const params = [filtro.periodo, filtro.id_anfitrion, filtro.documento_id];
  const filtros = [];

  if (filtro.fecha) {
    params.push(filtro.fecha);
    filtros.push(`AND tv.r_fecemi = $${params.length}::date`);
  }

  if (filtro.id_usuario_operacion) {
    params.push(filtro.id_usuario_operacion);
    filtros.push(`AND tv.ctrl_crea_us = $${params.length}`);
  }

  let filtroAgenciaOrigen = '';
  let filtroAgenciaDestino = 'AND FALSE';
  let filtroMontoTotal = 'TRUE';
  let filtroEfectivoAgencia = "TRUE";
  let filtroPendienteCobroEntrega = "TRUE";

  if (filtro.id_punto_venta) {
    params.push(filtro.id_punto_venta);
    filtroAgenciaOrigen = `AND tv.id_punto_venta = $${params.length}`;
    filtroAgenciaDestino = `AND tv.id_punto_venta_dest = $${params.length}`;
    filtroMontoTotal = `tv.id_punto_venta = $${params.length}`;
    filtroEfectivoAgencia = `(tv.id_punto_venta = $${params.length} OR (tv.entrega_fecha IS NOT NULL AND tv.id_punto_venta_dest = $${params.length}))`;
    filtroPendienteCobroEntrega = `tv.id_punto_venta_dest = $${params.length}`;
  }

  if (Array.isArray(filtro.id_puntos_venta) && filtro.id_puntos_venta.length > 0) {
    params.push(filtro.id_puntos_venta);
    filtroAgenciaOrigen = `AND tv.id_punto_venta = ANY($${params.length}::varchar[])`;
    filtroAgenciaDestino = `AND tv.id_punto_venta_dest = ANY($${params.length}::varchar[])`;
    filtroMontoTotal = `tv.id_punto_venta = ANY($${params.length}::varchar[])`;
    filtroEfectivoAgencia = `(tv.id_punto_venta = ANY($${params.length}::varchar[]) OR (tv.entrega_fecha IS NOT NULL AND tv.id_punto_venta_dest = ANY($${params.length}::varchar[])))`;
    filtroPendienteCobroEntrega = `tv.id_punto_venta_dest = ANY($${params.length}::varchar[])`;
  }

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
          AND COALESCE(tv.estado_sunat, '') NOT IN ('A', 'P', 'R')
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
          AND FALSE
          ${filtroAgenciaDestino}
      ), 0)::numeric AS monto_efectivo_destino_entregado,
      COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)) FILTER (
        WHERE tv.tipo_operacion = 'E'
          AND ${filtroEfectivoAgencia}
          AND NOT (${condicionPorCobrarSql})
      ), 0)::numeric AS monto_efectivo_agencia
    FROM base tv
  `, params);

  const row = result.rows[0] || {};
  const encomiendas = Number(row.encomiendas || 0);
  const entregadas = Number(row.encomiendas_entregadas || 0);

  return {
    encomiendas,
    boletos: Number(row.boletos || 0),
    encomiendas_por_entregar: Number(row.encomiendas_por_entregar || 0),
    encomiendas_entregadas: entregadas,
    entrega_efectiva: encomiendas > 0 ? Number(((entregadas / encomiendas) * 100).toFixed(2)) : 0,
    sunat_pendientes: Number(row.sunat_pendientes || 0),
    monto_encomiendas: Number(row.monto_encomiendas_facturado || 0),
    monto_encomiendas_facturado: Number(row.monto_encomiendas_facturado || 0),
    monto_efectivo_origen_agencia: Number(row.monto_efectivo_origen_agencia || 0),
    monto_efectivo_destino_entregado: Number(row.monto_efectivo_destino_entregado || 0),
    monto_efectivo_cancelado_agencia: Number(row.monto_efectivo_origen_agencia || 0),
    monto_efectivo_porpagar_entregado: Number(row.monto_efectivo_destino_entregado || 0),
    monto_por_cobrar: Number(row.monto_por_cobrar_pendiente_entrega || 0),
    monto_por_cobrar_pendiente_entrega: Number(row.monto_por_cobrar_pendiente_entrega || 0),
    monto_efectivo_agencia: Number(row.monto_efectivo_agencia || 0),
    monto_boletos: Number(row.monto_boletos || 0),
    monto_total: Number(row.monto_total || 0),
  };
};

// Agrupa documentos por franjas de 2 horas para medir productividad del turno.
const obtenerProductividadDashboardTransporteData = async (filtro) => {
  const params = [filtro.periodo, filtro.id_anfitrion, filtro.documento_id];
  const filtros = agregarFiltroDashboardTransporte({
    params,
    fecha: filtro.fecha,
    id_punto_venta: filtro.id_punto_venta,
    id_puntos_venta: filtro.id_puntos_venta,
    id_usuario_operacion: filtro.id_usuario_operacion,
  });

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

  const mayorTotal = result.rows.reduce((max, item) => {
    const total = Number(item.encomiendas || 0) + Number(item.boletos || 0);
    return Math.max(max, total);
  }, 0);

  return result.rows.map((item) => {
    const encomiendas = Number(item.encomiendas || 0);
    const boletos = Number(item.boletos || 0);
    const total = encomiendas + boletos;

    return {
      hora: item.hora,
      encomiendas,
      boletos,
      documentos: total,
      monto_total: Number(item.monto_total || 0),
      avance: mayorTotal > 0 ? Number(((total / mayorTotal) * 100).toFixed(2)) : 0,
    };
  });
};

// Resume el estado tributario de boletas de transporte listas o pendientes para SUNAT.
const obtenerSunatDashboardTransporteData = async (filtro) => {
  const params = [filtro.periodo, filtro.id_anfitrion, filtro.documento_id];
  const filtros = agregarFiltroDashboardTransporte({
    params,
    fecha: filtro.fecha,
    id_punto_venta: filtro.id_punto_venta,
    id_puntos_venta: filtro.id_puntos_venta,
    id_usuario_operacion: filtro.id_usuario_operacion,
  });

  const result = await pool.query(`
    SELECT
      tv.tipo_operacion,
      COALESCE(tv.estado_sunat, '') AS estado_sunat,
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
    GROUP BY tv.tipo_operacion, COALESCE(tv.estado_sunat, '')
    ORDER BY tv.tipo_operacion, COALESCE(tv.estado_sunat, '')
  `, params);

  return result.rows.map((item) => ({
    tipo_operacion: item.tipo_operacion,
    estado_sunat: item.estado_sunat,
    documentos: Number(item.documentos || 0),
    base_gravada: Number(item.base_gravada || 0),
    base_exonerada: Number(item.base_exonerada || 0),
    igv: Number(item.igv || 0),
    monto_total: Number(item.monto_total || 0),
  }));
};

// Muestra las rutas con mas movimiento, combinando boletos y encomiendas.
const obtenerRutasDashboardTransporteData = async (filtro) => {
  const params = [filtro.periodo, filtro.id_anfitrion, filtro.documento_id];
  const filtros = agregarFiltroDashboardTransporte({
    params,
    fecha: filtro.fecha,
    id_punto_venta: filtro.id_punto_venta,
    id_puntos_venta: filtro.id_puntos_venta,
    id_usuario_operacion: filtro.id_usuario_operacion,
  });

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

  const mayorDocumentos = result.rows.reduce((max, item) => {
    const total = Number(item.boletos || 0) + Number(item.encomiendas || 0);
    return Math.max(max, total);
  }, 0);

  return result.rows.map((item) => {
    const boletos = Number(item.boletos || 0);
    const encomiendas = Number(item.encomiendas || 0);
    const documentos = boletos + encomiendas;

    return {
      id_ruta: item.id_ruta,
      ruta: item.ruta,
      boletos,
      encomiendas,
      documentos,
      monto_total: Number(item.monto_total || 0),
      ocupacion: mayorDocumentos > 0 ? Number(((documentos / mayorDocumentos) * 100).toFixed(2)) : 0,
    };
  });
};

// Compara los 3 ultimos periodos en cantidad de encomiendas.
// Usa UNION ALL para consultar cada periodo por separado; esto ayuda cuando
// mve_transventa esta particionada por periodo y el SaaS mueve varias empresas.
// Este indicador ignora ?fecha porque su objetivo es mensual.
const obtenerComparativoMensualEncomiendasDashboardTransporteData = async (filtro) => {
  const periodos = obtenerUltimosPeriodos(filtro.periodo, 3).reverse();
  const params = [filtro.id_anfitrion, filtro.documento_id, ...periodos];
  let puntoVentaParam = null;

  if (filtro.id_punto_venta) {
    params.push(filtro.id_punto_venta);
    puntoVentaParam = params.length;
  }

  let puntosVentaParam = null;
  if (Array.isArray(filtro.id_puntos_venta) && filtro.id_puntos_venta.length > 0) {
    params.push(filtro.id_puntos_venta);
    puntosVentaParam = params.length;
  }

  let usuarioOperacionParam = null;
  if (filtro.id_usuario_operacion) {
    params.push(filtro.id_usuario_operacion);
    usuarioOperacionParam = params.length;
  }

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

  const rowsPorPeriodo = result.rows.reduce((acc, item) => {
    acc[item.periodo] = item;
    return acc;
  }, {});

  const mayor = periodos.reduce((max, periodo) => {
    const item = rowsPorPeriodo[periodo];
    return Math.max(max, Number(item?.encomiendas || 0));
  }, 0);

  return periodos.map((periodo) => {
    const item = rowsPorPeriodo[periodo] || {};
    const encomiendas = Number(item.encomiendas || 0);

    return {
      periodo,
      encomiendas,
      monto_total: Number(item.monto_total || 0),
      avance: mayor > 0 ? Number(((encomiendas / mayor) * 100).toFixed(2)) : 0,
    };
  });
};

// Recaudacion por cada agencia registrada.
const obtenerRecaudacionAgenciasDashboardTransporteData = async (filtro) => {
  const params = [filtro.periodo, filtro.id_anfitrion, filtro.documento_id];
  const filtrosFecha = [];

  if (filtro.fecha) {
    params.push(filtro.fecha);
    filtrosFecha.push(`AND tv.r_fecemi = $${params.length}::date`);
  }

  if (filtro.id_usuario_operacion) {
    params.push(filtro.id_usuario_operacion);
    filtrosFecha.push(`AND tv.ctrl_crea_us = $${params.length}`);
  }

  const filtrosPuntoVenta = [];
  if (filtro.id_punto_venta) {
    params.push(filtro.id_punto_venta);
    filtrosPuntoVenta.push(`AND pv.id_punto_venta = $${params.length}`);
  }

  if (Array.isArray(filtro.id_puntos_venta) && filtro.id_puntos_venta.length > 0) {
    params.push(filtro.id_puntos_venta);
    filtrosPuntoVenta.push(`AND pv.id_punto_venta = ANY($${params.length}::varchar[])`);
  }

  const result = await pool.query(`
    WITH ventas AS (
      SELECT tv.*
        FROM mve_transventa tv
       WHERE tv.periodo = $1
         AND tv.id_usuario = $2
         AND tv.documento_id = $3
         AND tv.tipo_operacion = 'E'
         ${filtrosFecha.join('\n')}
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
      GREATEST(
        COALESCE(origen_total.monto, 0) - COALESCE(por_pagar.monto, 0) - COALESCE(salidas.monto, 0),
        0
      )::numeric AS monto_recaudado,
      GREATEST(
        COALESCE(origen_total.monto, 0) - COALESCE(por_pagar.monto, 0) - COALESCE(salidas.monto, 0),
        0
      )::numeric AS monto_efectivo
    FROM mad_punto_venta pv
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS encomiendas,
        COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto
      FROM ventas tv
      WHERE tv.id_punto_venta = pv.id_punto_venta
    ) origen_total ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS encomiendas,
        COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto
      FROM ventas tv
      WHERE tv.id_punto_venta = pv.id_punto_venta
        AND ${condicionPorCobrarSql}
        AND tv.entrega_fecha IS NULL
    ) por_pagar ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(COALESCE(tv.registrado, 1)), 0)::integer AS encomiendas,
        COALESCE(SUM(tv.r_monto_total * COALESCE(tv.registrado, 1)), 0)::numeric AS monto
      FROM ventas tv
      WHERE tv.id_punto_venta_dest = pv.id_punto_venta
        AND tv.entrega_fecha IS NOT NULL
        AND FALSE
    ) salidas ON TRUE
    WHERE pv.id_usuario = $2
      AND pv.documento_id = $3
      AND pv.activo = TRUE
      ${filtrosPuntoVenta.join('\n')}
    ORDER BY monto_efectivo DESC, monto_facturado DESC, pv.nombre
  `, params);

  return result.rows.map((item) => ({
    id_punto_venta: item.id_punto_venta,
    agencia: item.agencia,
    encomiendas_facturadas: Number(item.encomiendas_facturadas || 0),
    monto_facturado: Number(item.monto_facturado || 0),
    encomiendas_por_pagar: Number(item.encomiendas_por_pagar || 0),
    monto_por_pagar: Number(item.monto_por_pagar || 0),
    encomiendas_salidas_dinero: Number(item.encomiendas_salidas_dinero || 0),
    monto_salidas_dinero: Number(item.monto_salidas_dinero || 0),
    encomiendas_destino_entregadas: Number(item.encomiendas_salidas_dinero || 0),
    monto_destino_entregado: Number(item.monto_salidas_dinero || 0),
    monto_recaudado: Number(item.monto_recaudado || 0),
    monto_efectivo: Number(item.monto_efectivo || 0),
  }));
};

// Endpoint para probar solo la fila superior de KPI del dashboard.
const obtenerResumenDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para el resumen del dashboard'
    });
  }

  try {
    const filtroFinal = await resolverAccesoDashboardTransporte(filtro);
    const data = await obtenerResumenDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener resumen del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo el bloque de productividad por hora.
const obtenerProductividadDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para la productividad del dashboard'
    });
  }

  try {
    const filtroFinal = await resolverAccesoDashboardTransporte(filtro);
    const data = await obtenerProductividadDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener productividad del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo el bloque de resumen SUNAT.
const obtenerSunatDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para SUNAT del dashboard'
    });
  }

  try {
    const filtroFinal = await resolverAccesoDashboardTransporte(filtro);
    const data = await obtenerSunatDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener SUNAT del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo el bloque de rendimiento por ruta.
const obtenerRutasDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para rutas del dashboard'
    });
  }

  try {
    const filtroFinal = await resolverAccesoDashboardTransporte(filtro);
    const data = await obtenerRutasDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener rutas del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint para probar solo el comparativo mensual de encomiendas.
const obtenerComparativoMensualEncomiendasDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para el comparativo mensual del dashboard'
    });
  }

  try {
    const filtroFinal = await resolverAccesoDashboardTransporte(filtro);
    const data = await obtenerComparativoMensualEncomiendasDashboardTransporteData(filtroFinal);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener comparativo mensual del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

// Endpoint principal: devuelve todos los datos que necesita el dashboard en una sola llamada.
const obtenerDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para el dashboard de transporte'
    });
  }

  try {
    const filtroFinal = await resolverAccesoDashboardTransporte(filtro);
    const [resumen, productividad, sunat, rutas, comparativoMensual, recaudacionAgencias] = await Promise.all([
      obtenerResumenDashboardTransporteData(filtroFinal),
      obtenerProductividadDashboardTransporteData(filtroFinal),
      obtenerSunatDashboardTransporteData(filtroFinal),
      obtenerRutasDashboardTransporteData(filtroFinal),
      obtenerComparativoMensualEncomiendasDashboardTransporteData(filtroFinal),
      obtenerRecaudacionAgenciasDashboardTransporteData(filtroFinal),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        filtros: filtroFinal,
        resumen,
        productividad,
        sunat,
        rutas,
        comparativo_mensual_encomiendas: comparativoMensual,
        recaudacion_agencias: recaudacionAgencias,
      }
    });
  } catch (error) {
    console.error('Error al obtener dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const generaJsonPrevioCPEexpertcontTransporte = async (
  p_periodo,
  p_id_usuario,
  p_documento_id,
  p_r_cod,
  p_r_serie,
  p_r_numero,
  p_elemento
) => {
  const datosQuery = await pool.query(
    `
    SELECT *
      FROM mad_usuariocontabilidad
     WHERE id_usuario = $1
       AND documento_id = $2
       AND tipo = 'ADMIN'
    `,
    [p_id_usuario, p_documento_id]
  );
  const datos = datosQuery.rows[0];

  if (!datos) {
    throw new Error('CONTABILIDAD NO ENCONTRADA');
  }

  const ventaQuery = await pool.query(
    `
    SELECT tv.*,
           ruta.nombre AS nombre_ruta
      FROM mve_transventa tv
      LEFT JOIN mve_transruta ruta
        ON ruta.id_usuario = tv.id_usuario
       AND ruta.documento_id = tv.documento_id
       AND ruta.id_ruta = tv.id_ruta
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.r_cod = $4
       AND tv.r_serie = $5
       AND tv.r_numero = $6
       AND tv.elemento = $7
    `,
    [p_periodo, p_id_usuario, p_documento_id, p_r_cod, p_r_serie, p_r_numero, p_elemento]
  );
  const venta = ventaQuery.rows[0];

  if (!venta) {
    throw new Error('ENCOMIENDA NO ENCONTRADA');
  }

  if (String(venta.tipo_operacion || '').trim() !== 'E') {
    throw new Error('Solo se puede enviar a SUNAT una operacion de encomienda');
  }

  const baseGravada = toNumber(venta.r_gravado);
  const baseExonerada = toNumber(venta.r_exonerado);
  const totalIgv = toNumber(venta.r_igv);
  const total = toNumber(venta.r_monto_total || venta.precio_neto);
  const porcIgv = toNumber(venta.porc_igv, baseGravada > 0 ? 18 : 0);
  const tipoIgvCodigo = baseGravada > 0 ? '10' : '20';
  const precioBase = baseGravada > 0 ? baseGravada : baseExonerada || total;
  const descripcion = [
    venta.descripcion || 'SERVICIO DE TRANSPORTE DE ENCOMIENDA',
    venta.nombre_ruta ? `Ruta: ${venta.nombre_ruta}` : '',
    venta.destinatario ? `Destinatario: ${venta.destinatario}` : ''
  ].filter(Boolean).join(' | ');

  const jsonPayload = {
    empresa: {
      ruc: datos.documento_id,
      razon_social: datos.razon_social,
      nombre_comercial: datos.razon_social,
      domicilio_fiscal: datos.direccion,
      ubigeo: datos.ubigeo,
      distrito: datos.distrito,
      provincia: datos.provincia,
      departamento: datos.departamento,
      modo: datos.modo,
    },
    cliente: {
      razon_social_nombres: venta.cliente,
      documento_identidad: venta.cliente_documento_id,
      tipo_identidad: venta.cliente_id_doc,
      cliente_direccion: venta.cliente_direccion_fact || venta.cliente_direccion || '',
    },
    venta: {
      codigo: venta.r_cod_ref || venta.r_cod,
      serie: venta.r_serie_ref || venta.r_serie,
      numero: venta.r_numero_ref || venta.r_numero,
      fecha_emision: toIsoDate(venta.r_fecemi),
      hora_emision: toIsoTime(venta.ctrl_crea),
      fecha_vencimiento: '',
      moneda_id: 'PEN',
      forma_pago_id: venta.condicion_pago || 'Contado',
      efectivo2: 0,
      forma_pago2: '',
      base_gravada: baseGravada,
      base_exonerada: baseExonerada,
      base_inafecta: '',
      base_gratuita: 0,
      total_igv: totalIgv,
      vendedor: '',
      nota: venta.numero_rdi ? `RDI: ${venta.numero_rdi}` : '',
      ref_codigo: venta.r_cod_ref ? venta.r_cod : '',
      ref_serie: venta.r_serie_ref ? venta.r_serie : '',
      ref_numero: venta.r_numero_ref ? venta.r_numero : '',
      motivo_id: '01',
      motivo: 'Anulacion de la Operacion',
      r_vfirmado: ''
    },
    items: [
      {
        producto: descripcion,
        cantidad: 1,
        precio_base: precioBase,
        precio_neto: total,
        codigo_sunat: '-',
        codigo_producto: 'SERV-TRANS',
        codigo_unidad: 'ZZ',
        tipo_igv_codigo: tipoIgvCodigo,
        porc_igv: porcIgv,
      }
    ],
  };

  return JSON.stringify(jsonPayload, null, 2);
};

const generaJsonResumenCPEexpertcontTransporte = async ({
  periodo,
  id_usuario,
  documento_id,
  fecha_documentos,
  correlativo = 1,
  id_punto_venta,
  tipo_operacion,
}) => {
  // RESUMEN DIARIO SUNAT - VERSION JSON DEL ANTIGUO SFS/TRD
  // Paso 1: obtener datos del emisor.
  // Equivale a los datos de empresa/certificado que antes rodeaban al archivo
  // SFS: RUC, razon social, direccion, ubigeo y modo de envio.
  const datosQuery = await pool.query(
    `
    SELECT *
      FROM mad_usuariocontabilidad
     WHERE id_usuario = $1
       AND documento_id = $2
       AND tipo = 'ADMIN'
    `,
    [id_usuario, documento_id]
  );
  const datos = datosQuery.rows[0];

  if (!datos) {
    throw new Error('CONTABILIDAD NO ENCONTRADA');
  }

  // Paso 2: seleccionar las boletas del dia que formaran el resumen.
  // Equivale a elegir los comprobantes que antes se listaban en el TRD.
  // E = encomienda gravada con IGV.
  // B = boleto de viaje exonerado.
  // Se excluyen A/P/R para no volver a resumir comprobantes ya tratados.
  let query = `
    SELECT tv.*,
           CAST(tv.r_fecemi AS VARCHAR(10)) AS fecha_emision
      FROM mve_transventa tv
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.r_fecemi = $4::date
       AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03'
       AND tv.tipo_operacion IN ('B', 'E')
       AND COALESCE(tv.estado_sunat, '') NOT IN ('A', 'P', 'R')
  `;
  const params = [periodo, id_usuario, documento_id, fecha_documentos];

  if (id_punto_venta) {
    params.push(id_punto_venta);
    query += ` AND tv.id_punto_venta = $${params.length} `;
  }

  if (tipo_operacion && ['B', 'E'].includes(tipo_operacion)) {
    params.push(tipo_operacion);
    query += ` AND tv.tipo_operacion = $${params.length} `;
  }

  query += `
     ORDER BY tv.tipo_operacion, tv.r_serie, tv.r_numero, tv.elemento
  `;

  const ventaQuery = await pool.query(query, params);

  if (ventaQuery.rows.length === 0) {
    throw new Error('No hay boletas de transporte pendientes para resumir en la fecha indicada.');
  }

  const comprobantes = ventaQuery.rows.map((venta) => {
    // Paso 3: convertir cada boleta a una linea tributaria del resumen.
    // Equivale a las columnas monetarias del TRD:
    // r_gravado   -> total_gravada   -> InstructionID 01.
    // r_exonerado -> total_exonerada -> InstructionID 02.
    // r_igv       -> total_igv       -> TaxTotal 1000 IGV VAT.
    // Para boletos de viaje el IGV debe viajar como 0.00.
    const baseGravada = toNumber(venta.r_gravado);
    const baseExonerada = toNumber(venta.r_exonerado);
    const baseInafecta = 0;
    const baseGratuita = 0;
    const totalIgv = toNumber(venta.r_igv);
    const total = toNumber(venta.r_monto_total || venta.precio_neto);

    return {
      tipo_documento: venta.r_cod_ref || venta.r_cod,
      serie: venta.r_serie_ref || venta.r_serie,
      numero: venta.r_numero_ref || venta.r_numero,
      cliente_numero_documento: venta.cliente_documento_id || '-',
      cliente_tipo_documento: venta.cliente_id_doc || '0',
      status: '1',
      moneda_id: 'PEN',
      total_a_pagar: total,
      total_gravada: baseGravada,
      total_exonerada: baseExonerada,
      total_inafecta: baseInafecta,
      total_gratuita: baseGratuita,
      total_igv: totalIgv,
      tipo_operacion: venta.tipo_operacion,
      origen: {
        periodo: venta.periodo,
        r_cod: venta.r_cod,
        r_serie: venta.r_serie,
        r_numero: venta.r_numero,
        elemento: venta.elemento,
      }
    };
  });

  // Paso 4: armar el payload final que reemplaza al archivo TRD.
  // El backend API SUNAT lo transformara a XML UBL SummaryDocuments.
  const payload = {
    empresa: {
      ruc: datos.documento_id,
      razon_social: datos.razon_social,
      nombre_comercial: datos.razon_social,
      domicilio_fiscal: datos.direccion,
      ubigeo: datos.ubigeo,
      distrito: datos.distrito,
      provincia: datos.provincia,
      departamento: datos.departamento,
      modo: datos.modo,
    },
    resumen: {
      numero: fecha_documentos.replace(/-/g, ''),
      correlativo: String(correlativo),
      fecha_documentos,
      fecha_resumen: toIsoDate(new Date()),
    },
    comprobantes,
  };

  return {
    payload,
    operaciones: ventaQuery.rows
  };
};

const crearVentaTrans = async (req, res) => {
  const tipoOperacionBody = req.body?.tipo_operacion;

  if (!validarTipoOperacion(tipoOperacionBody)) {
    return res.status(400).json({
      success: false,
      message: 'Tipo de operacion no valido. Use B=Boleto o E=Encomienda'
    });
  }

  if (tipoOperacionBody === 'E') {
    try {
      const result = await pool.query(
        'SELECT public.fve_transventa_grabar_encomienda($1::jsonb) AS data',
        [req.body]
      );

      return res.status(200).json({
        success: true,
        data: result.rows[0]?.data || null
      });
    } catch (error) {
      console.error('Error al crear encomienda de transporte:', error);

      return res.status(500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  }

  // Boletos se conectaran a su propia funcion PostgreSQL.
  return res.status(501).json({
    success: false,
    message: 'La funcion PostgreSQL para boletos aun no esta conectada'
  });
};

const obtenerVentasTrans = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || dia === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener operaciones de transporte'
    });
  }

  try {
    let query = `
      SELECT ${columnasVentaTrans},
             ruta.nombre_ruta
        FROM mve_transventa
        ${joinNombreRuta}
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
    `;

    const params = [periodo, id_anfitrion, documento_id];

    if (dia !== '*') {
      query += ` AND r_fecemi = $4 `;
      params.push(`${periodo}-${dia}`);
    }

    query += `
      ORDER BY r_fecemi DESC, r_serie, r_numero DESC, elemento
    `;

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error al obtener operaciones de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerVentaTrans = async (req, res) => {
  const {
    periodo, id_usuario, id_anfitrion, id_invitado, documento_id,
    cod, serie, num, elem
  } = req.params;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !cod || !serie || !num || elem === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener operacion de transporte'
    });
  }

  try {
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

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Operacion de transporte no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al obtener operacion de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const clonarEncomienda = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const { id_punto_venta, limit } = req.query;
  const limite = Math.min(Math.max(Number(limit || 80), 1), 150);

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para buscar encomiendas clonables'
    });
  }

  try {
    const periodos = obtenerUltimosPeriodos(periodo, 3);
    const params = [
      ...periodos,
      id_anfitrion,
      documento_id,
      limite
    ];
    const idUsuarioParam = periodos.length + 1;
    const documentoParam = periodos.length + 2;
    const limiteParam = periodos.length + 3;
    let puntoVentaParam = null;

    if (id_punto_venta) {
      params.push(id_punto_venta);
      puntoVentaParam = params.length;
    }

    const joinRutaClonar = `
      LEFT JOIN (
        SELECT id_usuario AS ruta_id_usuario,
               documento_id AS ruta_documento_id,
               id_ruta AS ruta_id_ruta,
               nombre AS nombre_ruta
          FROM mve_transruta
      ) ruta
        ON ruta.ruta_id_usuario = venta.id_usuario
       AND ruta.ruta_documento_id = venta.documento_id
       AND ruta.ruta_id_ruta = venta.id_ruta
    `;
    const selectsPorPeriodo = periodos.map((_, index) => `
      SELECT ${columnasVentaTrans},
             ruta.nombre_ruta,
             venta.periodo AS periodo_origen
        FROM mve_transventa venta
        ${joinRutaClonar}
       WHERE venta.periodo = $${index + 1}
         AND venta.id_usuario = $${idUsuarioParam}
         AND venta.documento_id = $${documentoParam}
         AND venta.tipo_operacion = 'E'
         ${puntoVentaParam ? `AND venta.id_punto_venta = $${puntoVentaParam}` : ''}
    `).join(' UNION ALL ');

    const query = `
      SELECT *
        FROM (
          ${selectsPorPeriodo}
        ) encomiendas
       ORDER BY r_fecemi DESC, r_serie, r_numero DESC, elemento
       LIMIT $${limiteParam}
    `;

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error al buscar encomiendas para clonar:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const listarEncomiendasPorEntregar = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, id_punto_venta_dest } = req.params;
  const { limit, periodos } = req.query;
  const limite = Math.min(Math.max(Number(limit || 150), 1), 300);
  const cantidadPeriodos = Math.min(Math.max(Number(periodos || 3), 1), 12);

  if (!periodo || !id_anfitrion || !documento_id || !id_punto_venta_dest) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para listar encomiendas por entregar'
    });
  }

  try {
    const periodosBusqueda = obtenerUltimosPeriodos(periodo, cantidadPeriodos);
    const params = [
      ...periodosBusqueda,
      id_anfitrion,
      documento_id,
      id_punto_venta_dest,
      limite
    ];
    const idUsuarioParam = periodosBusqueda.length + 1;
    const documentoParam = periodosBusqueda.length + 2;
    const puntoVentaDestParam = periodosBusqueda.length + 3;
    const limiteParam = periodosBusqueda.length + 4;
    const joinRutaEntrega = `
      LEFT JOIN (
        SELECT id_usuario AS ruta_id_usuario,
               documento_id AS ruta_documento_id,
               id_ruta AS ruta_id_ruta,
               nombre AS nombre_ruta
          FROM mve_transruta
      ) ruta
        ON ruta.ruta_id_usuario = venta.id_usuario
       AND ruta.ruta_documento_id = venta.documento_id
       AND ruta.ruta_id_ruta = venta.id_ruta
    `;
    const selectsPorPeriodo = periodosBusqueda.map((_, index) => `
      SELECT ${columnasVentaTrans},
             ruta.nombre_ruta,
             venta.periodo AS periodo_origen
        FROM mve_transventa venta
        ${joinRutaEntrega}
       WHERE venta.periodo = $${index + 1}
         AND venta.id_usuario = $${idUsuarioParam}
         AND venta.documento_id = $${documentoParam}
         AND venta.id_punto_venta_dest = $${puntoVentaDestParam}
         AND venta.tipo_operacion = 'E'
         AND venta.entrega_fecha IS NULL
    `).join(' UNION ALL ');

    const query = `
      SELECT *
        FROM (
          ${selectsPorPeriodo}
        ) encomiendas
       ORDER BY r_fecemi DESC, r_serie, r_numero DESC, elemento
       LIMIT $${limiteParam}
    `;

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows,
      meta: {
        periodos: periodosBusqueda,
        cantidad_periodos: cantidadPeriodos
      }
    });
  } catch (error) {
    console.error('Error al listar encomiendas por entregar:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarVentaTrans = async (req, res) => {
  const {
    periodo, id_usuario, id_anfitrion, id_invitado, documento_id,
    r_cod, r_serie, r_numero, elemento,
    r_fecemi, tipo_operacion,
    r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
    id_documento, cliente_id_doc,
    cliente, cliente_documento, cliente_documento_id,
    cliente_telefono, cliente_direccion_fact,
    cliente_zona, cliente_direccion,
    id_punto_venta, remitente_zona, remitente_direccion,
    id_ruta, descripcion,
    placa, licencia,
    asiento, pasajero_edad,
    destinatario_id_doc,
    destinatario, destinatario_documento, destinatario_documento_id,
    destinatario_telefono, id_punto_venta_dest,
    destinatario_zona, destinatario_direccion,
    cantidad, precio_unitario, precio_neto,
    r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
    condicion_pago, llegada_aprox, numero_rdi, estado_sunat,
    ctrl_mod_us
  } = req.body;
  const idUsuarioFinal = id_usuario || id_anfitrion;
  const ctrlModUsFinal = ctrl_mod_us || id_invitado || null;

  if (
    !periodo || !idUsuarioFinal || !documento_id ||
    !r_cod || !r_serie || !r_numero ||
    elemento === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar operacion de transporte'
    });
  }

  if (tipo_operacion && !validarTipoOperacion(tipo_operacion)) {
    return res.status(400).json({
      success: false,
      message: 'Tipo de operacion no valido. Use B=Boleto o E=Encomienda'
    });
  }

  try {
    const rutaTransporte = id_ruta ? await obtenerRutaTransporte({
      id_anfitrion: idUsuarioFinal,
      documento_id,
      id_ruta,
    }) : null;

    if (id_ruta && !rutaTransporte) {
      return res.status(400).json({
        success: false,
        message: 'La ruta indicada no existe para la empresa seleccionada'
      });
    }

    const idPuntoVentaFinal = id_punto_venta || rutaTransporte?.id_punto_venta || null;
    const idPuntoVentaDestFinal = id_punto_venta_dest || rutaTransporte?.id_punto_venta_dest || null;
    const clienteIdDocFinal = cliente_id_doc || id_documento || null;
    const clienteDocumentoIdFinal = cliente_documento_id || cliente_documento || null;
    const clienteZonaFinal = cliente_zona ?? remitente_zona ?? null;
    const clienteDireccionFinal = cliente_direccion ?? remitente_direccion ?? null;
    const destinatarioDocumentoIdFinal = destinatario_documento_id || destinatario_documento || null;
    const debeActualizarTributos = [
      cantidad,
      precio_unitario,
      precio_neto,
      r_gravado,
      r_exonerado,
      r_igv,
      r_monto_total,
      porc_igv,
    ].some((value) => value !== undefined && value !== null && value !== '');
    const tributosFinales = debeActualizarTributos
      ? calcularTributosTransporte({
        tipo_operacion,
        cantidad,
        precio_unitario,
        precio_neto,
        r_gravado,
        r_exonerado,
        r_igv,
        r_monto_total,
        porc_igv,
      })
      : {
        precio_neto,
        r_gravado,
        r_exonerado,
        r_igv,
        r_monto_total,
        porc_igv,
      };

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
             porc_igv = COALESCE($40::numeric, porc_igv),
             condicion_pago = COALESCE($41, condicion_pago),
             llegada_aprox = COALESCE(NULLIF($42, '')::time, llegada_aprox),
             numero_rdi = COALESCE($43, numero_rdi),
             estado_sunat = COALESCE($44, estado_sunat),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($45, ctrl_mod_us)
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
      tributosFinales.porc_igv,
      condicion_pago, llegada_aprox, numero_rdi, estado_sunat, ctrlModUsFinal
    ];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Operacion de transporte no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar operacion de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const eliminarVentaTrans = async (req, res) => {
  const {
    periodo, id_anfitrion, documento_id,
    cod, serie, num, elem
  } = req.params;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !cod || !serie || !num || elem === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar operacion de transporte'
    });
  }

  try {
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
      periodo, id_anfitrion, documento_id,
      cod, serie, num, elem
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Operacion de transporte no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Operacion de transporte eliminada correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar operacion de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const registrarEntregaEncomienda = async (req, res) => {
  const {
    periodo,
    id_usuario,
    id_anfitrion,
    id_invitado,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    entrega_fecha,
    entrega_documento_id,
    entrega_documento,
    entrega_nombres,
    entrega_ctrl_us
  } = req.body;
  const idUsuarioFinal = id_usuario || id_anfitrion;
  const entregaDocumentoIdFinal = entrega_documento_id || entrega_documento;
  const entregaCtrlUsFinal = entrega_ctrl_us || id_invitado || null;

  if (
    !periodo || !idUsuarioFinal || !documento_id ||
    !r_cod || !r_serie || !r_numero ||
    elemento === undefined ||
    !entrega_fecha
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para registrar entrega'
    });
  }

  try {
    const query = `
      UPDATE mve_transventa
         SET entrega_fecha = $8::timestamp(5),
             entrega_documento_id = COALESCE($9, entrega_documento_id),
             entrega_nombres = COALESCE($10, entrega_nombres),
             entrega_ctrl_us = $11,
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = $11
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND tipo_operacion = 'E'
       RETURNING ${columnasVentaTrans}
    `;

    const result = await pool.query(query, [
      periodo, idUsuarioFinal, documento_id,
      r_cod, r_serie, r_numero, elemento,
      entrega_fecha, entregaDocumentoIdFinal,
      entrega_nombres, entregaCtrlUsFinal
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Encomienda no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al registrar entrega de encomienda:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const generarCPEexpertcontTransporte = async (req, res) => {
  const {
    p_periodo,
    p_id_usuario,
    p_documento_id,
    p_r_cod,
    p_r_serie,
    p_r_numero,
    p_elemento,
    periodo,
    id_usuario,
    id_anfitrion,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento
  } = req.body;

  const periodoFinal = p_periodo || periodo;
  const idUsuarioFinal = p_id_usuario || id_usuario || id_anfitrion;
  const documentoIdFinal = p_documento_id || documento_id;
  const rCodFinal = p_r_cod || r_cod;
  const rSerieFinal = p_r_serie || r_serie;
  const rNumeroFinal = p_r_numero || r_numero;
  const elementoFinal = p_elemento ?? elemento ?? 1;

  if (
    !periodoFinal ||
    !idUsuarioFinal ||
    !documentoIdFinal ||
    !rCodFinal ||
    !rSerieFinal ||
    !rNumeroFinal ||
    elementoFinal === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para enviar encomienda a SUNAT'
    });
  }

  try {
    const jsonString = await generaJsonPrevioCPEexpertcontTransporte(
      periodoFinal,
      idUsuarioFinal,
      documentoIdFinal,
      rCodFinal,
      rSerieFinal,
      rNumeroFinal,
      elementoFinal
    );

    const strUrlApi = 'https://expertcont-api-sunat.up.railway.app/cpesunat';
    const apiResponse = await fetch(strUrlApi, {
      method: 'POST',
      body: jsonString,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await leerRespuestaSunat(apiResponse);

    if (!apiResponse.ok) {
      const errorNormalizado = normalizarErrorSunatTransporte(responseData);
      await pool.query(
        `
        UPDATE mve_transventa
           SET estado_sunat = $8,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($9, ctrl_mod_us)
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
        `,
        [
          periodoFinal,
          idUsuarioFinal,
          documentoIdFinal,
          rCodFinal,
          rSerieFinal,
          rNumeroFinal,
          elementoFinal,
          estadoSunatTransportePorNivel(errorNormalizado.nivel),
          req.body.id_invitado || req.body.ctrl_mod_us || null
        ]
      );

      return res.status(apiResponse.status).json(errorNormalizado);
    }

    const dataSunat = responseData?.data || responseData;
    const {
      estado,
      codigo,
      nivel,
      consumioCorrelativo,
      permiteReintento,
      cdr_pendiente,
      respuesta_sunat_descripcion,
      ruta_xml,
      ruta_cdr,
      ruta_pdf,
      codigo_hash,
    } = dataSunat;

    const data = JSON.parse(jsonString);
    if (String(data.empresa.modo) === '1') {
      await pool.query(
        `
        UPDATE mve_transventa
           SET estado_sunat = $8,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($9, ctrl_mod_us)
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
        `,
        [
          periodoFinal,
          idUsuarioFinal,
          documentoIdFinal,
          rCodFinal,
          rSerieFinal,
          rNumeroFinal,
          elementoFinal,
          estadoSunatTransportePorNivel(nivel),
          req.body.id_invitado || req.body.ctrl_mod_us || null
        ]
      );
    }

    return res.json({
      success: estado === true,
      estado,
      codigo,
      nivel,
      consumioCorrelativo,
      consumio_correlativo: consumioCorrelativo,
      permite_reintento: permiteReintento ?? true,
      cdr_pendiente,
      titulo_usuario: nivel === 'ACEPTADO' ? 'Comprobante aceptado' : undefined,
      mensaje_usuario: nivel === 'ACEPTADO' ? 'Comprobante aceptado por SUNAT.' : respuesta_sunat_descripcion,
      respuesta_sunat_descripcion,
      ruta_xml,
      ruta_cdr,
      ruta_pdf,
      codigo_hash
    });
  } catch (error) {
    console.error('Error procesando envio SUNAT de transporte:', error);
    return res.status(500).json(normalizarErrorSunatTransporte(
      { message: error.message },
      'Error interno procesando envio SUNAT de transporte'
    ));
  }
};

// ORDEN DE EJECUCION - ENDPOINT ADMINISTRATIVO DE RESUMEN
// Ruta:
//   POST /mve_transventa/cpe/resumen
//
// Paso 1:
//   generarResumenCPEexpertcontTransporte(req, res)
//   Lee parametros del request: periodo, empresa, fecha, correlativo y filtros.
//
// Paso 2:
//   generaJsonResumenCPEexpertcontTransporte(...)
//   Arma el JSON tributario, equivalente moderno del antiguo archivo TRD.
//
// Paso 3:
//   Dentro de generaJsonResumenCPEexpertcontTransporte:
//   3.1 Consulta mad_usuariocontabilidad para datos del emisor.
//   3.2 Consulta mve_transventa para boletas pendientes del dia.
//   3.3 Convierte cada boleta a comprobantes[]:
//       E encomienda -> gravada + IGV.
//       B boleto     -> exonerada + IGV 0.00.
//
// Paso 4:
//   Si solo_payload=true, responde el JSON sin enviar a SUNAT.
//   Sirve para revisar lo que antes se revisaba en el TRD/SFS.
//
// Paso 5:
//   fetch('/cpesunatresumen')
//   Envia el JSON al backend API SUNAT para generar XML, firmar, comprimir
//   y ejecutar SOAP sendSummary.
//
// Paso 6:
//   leerRespuestaSunat(apiResponse)
//   Normaliza la respuesta del backend API SUNAT.
//
// Paso 7:
//   marcarOperacionesResumen(...)
//   En produccion marca las boletas como pendientes ('P') para evitar reenvio.
//
// Paso 8:
//   Responde al frontend con ticket, nombre_archivo, ruta_xml y payload usado.
const generarResumenCPEexpertcontTransporte = async (req, res) => {
  const {
    p_periodo,
    p_id_usuario,
    p_documento_id,
    p_fecha_documentos,
    p_correlativo,
    periodo,
    id_usuario,
    id_anfitrion,
    documento_id,
    fecha_documentos,
    correlativo,
    id_punto_venta,
    tipo_operacion,
    solo_payload
  } = req.body;

  const periodoFinal = p_periodo || periodo;
  const idUsuarioFinal = p_id_usuario || id_usuario || id_anfitrion;
  const documentoIdFinal = p_documento_id || documento_id;
  const fechaDocumentosFinal = p_fecha_documentos || fecha_documentos;
  const correlativoFinal = p_correlativo || correlativo || 1;

  if (!periodoFinal || !idUsuarioFinal || !documentoIdFinal || !fechaDocumentosFinal) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para enviar resumen de boletas'
    });
  }

  try {
    // Paso 1: armar el JSON tributario desde la base administrativa.
    // Es la nueva version estructurada del TRD. Con solo_payload=true se
    // puede auditar sin enviar nada a SUNAT.
    const { payload, operaciones } = await generaJsonResumenCPEexpertcontTransporte({
      periodo: periodoFinal,
      id_usuario: idUsuarioFinal,
      documento_id: documentoIdFinal,
      fecha_documentos: fechaDocumentosFinal,
      correlativo: correlativoFinal,
      id_punto_venta,
      tipo_operacion,
    });

    if (solo_payload === true || solo_payload === '1') {
      return res.status(200).json({
        success: true,
        payload,
        total_documentos: operaciones.length
      });
    }

    // Paso 2: enviar el payload al microservicio SUNAT.
    // A partir de aqui el backend API hace lo que antes hacia SFS:
    // generar XML, firmar, comprimir ZIP y ejecutar sendSummary.
    // SUNAT devuelve ticket, no CDR inmediato.
    const apiResponse = await fetch('https://expertcont-api-sunat.up.railway.app/cpesunatresumen', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await leerRespuestaSunat(apiResponse);

    if (!apiResponse.ok) {
      const errorNormalizado = normalizarErrorSunatTransporte(responseData, 'Error en la API SUNAT enviando resumen');
      return res.status(apiResponse.status).json(errorNormalizado);
    }

    const dataSunat = responseData?.data || responseData;
    const nivel = dataSunat.nivel || 'TICKET';

    // Paso 3: marcar operaciones como pendientes en produccion.
    // Esto reemplaza la espera manual del ticket SFS y bloquea reenvios
    // mientras SUNAT procesa el resumen.
    if (String(payload.empresa.modo) === '1') {
      await marcarOperacionesResumen({
        operaciones,
        estado_sunat: 'P',
        ctrl_mod_us: req.body.id_invitado || req.body.ctrl_mod_us || null
      });
    }

    return res.status(200).json({
      success: true,
      estado: dataSunat.estado === true,
      nivel,
      ticket: dataSunat.ticket || '',
      nombre_archivo: dataSunat.nombre_archivo,
      total_documentos: operaciones.length,
      respuesta_sunat_descripcion: dataSunat.respuesta_sunat_descripcion,
      ruta_xml: dataSunat.ruta_xml,
      codigo_hash: dataSunat.codigo_hash,
      payload
    });
  } catch (error) {
    console.error('Error procesando resumen SUNAT de transporte:', error);
    return res.status(500).json(normalizarErrorSunatTransporte(
      { message: error.message },
      'Error interno procesando resumen SUNAT de transporte'
    ));
  }
};

// ORDEN DE EJECUCION - CONSULTA ADMINISTRATIVA DE TICKET
// Ruta:
//   POST /mve_transventa/cpe/resumen/ticket
//
// Paso 1:
//   consultarResumenCPEexpertcontTransporte(req, res)
//   Lee ticket, nombre_archivo y datos de empresa.
//
// Paso 2:
//   Si no llega empresa completa, consulta mad_usuariocontabilidad para
//   recuperar modo de envio y razon social.
//
// Paso 3:
//   fetch('/cpesunatresumen/ticket')
//   Pide al backend API SUNAT ejecutar SOAP getStatus.
//
// Paso 4:
//   leerRespuestaSunat(apiResponse)
//   Interpreta respuesta: PENDIENTE, ACEPTADO o RECHAZADO.
//
// Paso 5:
//   Responde al frontend con estado del ticket y ruta_cdr cuando exista.
const consultarResumenCPEexpertcontTransporte = async (req, res) => {
  const {
    documento_id,
    id_usuario,
    id_anfitrion,
    ticket,
    nombre_archivo,
    periodo,
    fecha_documentos,
    correlativo,
    empresa
  } = req.body;

  let empresaFinal = empresa || {
    ruc: documento_id,
    modo: req.body.modo
  };

  if (!empresaFinal?.ruc || !ticket) {
    return res.status(400).json({
      success: false,
      message: 'Debe enviar documento_id o empresa.ruc, y ticket.'
    });
  }

  try {
    // Paso 1: preparar la consulta del ticket recibido por sendSummary.
    // Equivale al antiguo seguimiento SFS del ticket hasta obtener CDR.
    // Si SUNAT devuelve 98, sigue pendiente.
    // Si devuelve content, el backend API extrae el CDR y lo guarda.
    if (!empresa && (id_usuario || id_anfitrion) && documento_id) {
      const datosQuery = await pool.query(
        `
        SELECT documento_id, razon_social, modo
          FROM mad_usuariocontabilidad
         WHERE id_usuario = $1
           AND documento_id = $2
           AND tipo = 'ADMIN'
        `,
        [id_usuario || id_anfitrion, documento_id]
      );
      const datos = datosQuery.rows[0];

      if (datos) {
        empresaFinal = {
          ruc: datos.documento_id,
          razon_social: datos.razon_social,
          modo: datos.modo,
        };
      }
    }

    const payload = {
      empresa: empresaFinal,
      ticket,
      nombre_archivo,
      resumen: fecha_documentos ? {
        numero: fecha_documentos.replace(/-/g, ''),
        correlativo: String(correlativo || 1),
        fecha_documentos,
      } : undefined
    };

    // Paso 2: consultar el ticket en el microservicio API SUNAT.
    // Ese backend ejecuta SOAP getStatus y devuelve PENDIENTE/ACEPTADO/RECHAZADO.
    const apiResponse = await fetch('https://expertcont-api-sunat.up.railway.app/cpesunatresumen/ticket', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await leerRespuestaSunat(apiResponse);

    if (!apiResponse.ok) {
      const errorNormalizado = normalizarErrorSunatTransporte(responseData, 'Error consultando ticket de resumen');
      return res.status(apiResponse.status).json(errorNormalizado);
    }

    const dataSunat = responseData?.data || responseData;

    return res.status(200).json({
      success: dataSunat.estado === true || dataSunat.nivel === 'PENDIENTE',
      estado: dataSunat.estado,
      nivel: dataSunat.nivel,
      codigo: dataSunat.codigo,
      ticket: dataSunat.ticket || ticket,
      nombre_archivo: dataSunat.nombre_archivo || nombre_archivo,
      ruta_cdr: dataSunat.ruta_cdr,
      respuesta_sunat_descripcion: dataSunat.respuesta_sunat_descripcion,
      mensaje: dataSunat.mensaje
    });
  } catch (error) {
    console.error('Error consultando resumen SUNAT de transporte:', error);
    return res.status(500).json(normalizarErrorSunatTransporte(
      { message: error.message },
      'Error interno consultando resumen SUNAT de transporte'
    ));
  }
};

const marcarOperacionesResumen = async ({ operaciones, estado_sunat, ctrl_mod_us }) => {
  for (const venta of operaciones) {
    await pool.query(
      `
      UPDATE mve_transventa
         SET estado_sunat = $8,
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($9, ctrl_mod_us)
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
      `,
      [
        venta.periodo,
        venta.id_usuario,
        venta.documento_id,
        venta.r_cod,
        venta.r_serie,
        venta.r_numero,
        venta.elemento,
        estado_sunat,
        ctrl_mod_us
      ]
    );
  }
};

module.exports = {
  crearVentaTrans,
  obtenerVentasTrans,
  obtenerVentaTrans,
  clonarEncomienda,
  listarEncomiendasPorEntregar,
  actualizarVentaTrans,
  eliminarVentaTrans,
  registrarEntregaEncomienda,
  obtenerResumenDashboardTransporte,
  obtenerProductividadDashboardTransporte,
  obtenerSunatDashboardTransporte,
  obtenerRutasDashboardTransporte,
  obtenerComparativoMensualEncomiendasDashboardTransporte,
  obtenerDashboardTransporte,
  generarCPEexpertcontTransporte,
  generarResumenCPEexpertcontTransporte,
  consultarResumenCPEexpertcontTransporte
};
