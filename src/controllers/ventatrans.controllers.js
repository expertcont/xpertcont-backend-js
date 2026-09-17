const pool = require('../db');
const fetch = require('node-fetch');

const normalizarTexto = (valor) => (valor || '').toString().trim();
const SUNAT_API_BASE_URL = 'https://expertcont-api-sunat.up.railway.app';
const TICKET_ENCOMIENDA_ENDPOINT = '/cpesunatticketencomienda/v2';
const TICKET_ENCOMIENDA_ADMIN_ENDPOINT = '/cpesunatticketencomienda';
const TICKET_ENCOMIENDA_ENDPOINTS_PERMITIDOS = [
  TICKET_ENCOMIENDA_ENDPOINT,
  TICKET_ENCOMIENDA_ADMIN_ENDPOINT,
];

const resolverEndpointTicketEncomienda = (endpointSolicitado, endpointDefault = TICKET_ENCOMIENDA_ENDPOINT) => {
  const endpointNormalizado = normalizarTexto(endpointSolicitado);
  const endpointPath = endpointNormalizado.startsWith(SUNAT_API_BASE_URL)
    ? endpointNormalizado.slice(SUNAT_API_BASE_URL.length)
    : endpointNormalizado;

  return TICKET_ENCOMIENDA_ENDPOINTS_PERMITIDOS.includes(endpointPath)
    ? endpointPath
    : endpointDefault;
};

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
  r_vfirmado,
  cdr_descripcion,
  estado_sunat,
  ctrl_crea,
  ctrl_crea_us,
  ctrl_mod,
  ctrl_mod_us
`;

const columnasVentaTransDesde = (alias) => `
  CAST(${alias}.r_fecemi AS VARCHAR(50)) AS r_fecemi,
  ${alias}.r_cod,
  ${alias}.r_serie,
  ${alias}.r_numero,
  ${alias}.elemento,
  ${alias}.tipo_operacion,
  ${alias}.r_cod_ref,
  ${alias}.r_serie_ref,
  ${alias}.r_numero_ref,
  CAST(${alias}.r_fecemi_ref AS VARCHAR(50)) AS r_fecemi_ref,
  ${alias}.cliente_id_doc AS id_documento,
  ${alias}.cliente_id_doc,
  ${alias}.cliente,
  ${alias}.cliente_documento_id AS cliente_documento,
  ${alias}.cliente_documento_id,
  ${alias}.cliente_telefono,
  ${alias}.cliente_direccion_fact,
  ${alias}.id_punto_venta,
  ${alias}.cliente_zona AS remitente_zona,
  ${alias}.cliente_zona,
  ${alias}.cliente_direccion AS remitente_direccion,
  ${alias}.cliente_direccion,
  ${alias}.id_ruta,
  ${alias}.descripcion,
  ${alias}.placa,
  ${alias}.licencia,
  ${alias}.asiento,
  ${alias}.pasajero_edad,
  ${alias}.destinatario_id_doc,
  ${alias}.destinatario,
  ${alias}.destinatario_documento_id AS destinatario_documento,
  ${alias}.destinatario_documento_id,
  ${alias}.destinatario_telefono,
  ${alias}.id_punto_venta_dest,
  ${alias}.destinatario_zona,
  ${alias}.destinatario_direccion,
  CAST(${alias}.entrega_fecha AS VARCHAR(50)) AS entrega_fecha,
  ${alias}.entrega_documento_id AS entrega_documento,
  ${alias}.entrega_documento_id,
  ${alias}.entrega_nombres,
  ${alias}.entrega_ctrl_us,
  1 AS cantidad,
  ${alias}.precio_neto AS precio_unitario,
  ${alias}.precio_neto,
  ${alias}.r_gravado,
  ${alias}.r_exonerado,
  ${alias}.r_igv,
  ${alias}.r_monto_total,
  ${alias}.porc_igv,
  ${alias}.condicion_pago,
  CAST(${alias}.llegada_aprox AS VARCHAR(50)) AS llegada_aprox,
  ${alias}.numero_rdi,
  ${alias}.r_vfirmado,
  ${alias}.cdr_descripcion,
  ${alias}.estado_sunat,
  ${alias}.ctrl_crea,
  ${alias}.ctrl_crea_us,
  ${alias}.ctrl_mod,
  ${alias}.ctrl_mod_us
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

const normalizarSerieGremTransporte = (serie) => {
  const serieNormalizada = normalizarTexto(serie).toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!serieNormalizada) return 'V001';

  const serieRemitente = serieNormalizada.match(/^T(\d{3})$/);
  if (serieRemitente) return `V${serieRemitente[1]}`;

  if (/^V\d{3}$/.test(serieNormalizada)) return serieNormalizada;

  const error = new Error('La serie de la GRE Transportista debe tener formato V###, por ejemplo V001.');
  error.statusCode = 400;
  throw error;
};

const toIsoDate = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return String(value).split('T')[0].split(' ')[0];
};

const toIsoTime = (value) => {
  const horaLimaActual = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());

    const getPart = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  };

  if (!value) return horaLimaActual();

  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(value);

    const getPart = (type) => parts.find((part) => part.type === type)?.value || '00';
    return `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  }

  const text = String(value).trim();
  const match = text.match(/(?:^|[T\s])(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return horaLimaActual();

  return `${match[1]}:${match[2]}:${match[3] || '00'}`;
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

const normalizarErrorResumenSunatTransporte = (responseData, fallbackMessage = 'Error en la API SUNAT enviando resumen') => {
  const data = responseData?.error || responseData?.data || responseData || {};
  const descripcion = data.respuesta_sunat_descripcion || data.mensaje || data.message || fallbackMessage;
  const nivel = data.nivel || 'ERROR';

  return {
    success: false,
    estado: data.estado === true ? 'ENVIADO' : 'ERROR',
    nivel,
    codigo: data.codigo || 'ERROR_SUNAT',
    titulo_usuario: data.titulo_usuario || (nivel === 'PENDIENTE' ? 'Resumen pendiente' : 'No se pudo enviar a SUNAT'),
    mensaje_usuario: data.mensaje_usuario || descripcion,
    respuesta_codigo: data.codigo || 'ERROR_SUNAT',
    respuesta_desc: descripcion,
    respuesta_sunat_descripcion: descripcion,
    detalle_tecnico: data.detalle_sunat || data.detalleSunat || descripcion,
    permite_reintento: data.permite_reintento ?? data.permiteReintento ?? true,
    ticket: data.ticket || null,
    nombre_archivo: data.nombre_archivo || null,
    ruta_xml: data.ruta_xml || 'error',
    ruta_cdr: data.ruta_cdr || 'error',
    codigo_hash: data.codigo_hash || null
  };
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

const obtenerFechaServidorLima = async () => {
  const result = await pool.query(`
    SELECT TO_CHAR((now() AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD') AS fecha
  `);

  return result.rows[0]?.fecha || '';
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

// ------------------------------------------------------------
// DASHBOARD TRANSPORTE
// ------------------------------------------------------------
// Objetivo:
//   Controlar caja y movimiento de encomiendas/boletos por periodo,
//   dia, agencia/punto de venta y usuario que registro la operacion.
//
// Reglas principales:
//   - Anfitrion y superusuario pueden ver toda la empresa.
//   - Invitado normal solo ve sus puntos de venta permitidos.
//   - El usuario operativo se toma de mve_transventa.ctrl_crea_us.
//   - Dia "*" significa todo el periodo; fecha puntual usa YYYY-MM-DD.
// ------------------------------------------------------------

// Lee los parametros comunes enviados por el frontend del dashboard.
const resolverFiltroDashboardTransporte = (req) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;
  const fecha = req.query.fecha || (dia && dia !== '*' ? `${periodo}-${String(dia).padStart(2, '0')}` : null);
  const idPuntoVenta = req.query.id_punto_venta || null;
  const idInvitado = req.query.id_invitado || null;
  const superUsuario = req.query.super_usuario || req.query.super || null;
  const idUsuarioTrabajo = req.query.id_usuario_trabajo || req.query.id_usuario_operacion || null;

  return {
    periodo,
    id_anfitrion,
    documento_id,
    fecha,
    id_punto_venta: idPuntoVenta,
    id_invitado: idInvitado,
    super_usuario: superUsuario,
    acceso_total: !idInvitado || id_anfitrion === idInvitado || String(superUsuario) === '1',
    id_usuario_trabajo: idUsuarioTrabajo,
    id_usuario_operacion: null,
    id_puntos_venta: null,
  };
};

// Valida lo minimo para que todas las consultas apunten a una empresa/periodo real.
const validarFiltroDashboardTransporte = ({ periodo, id_anfitrion, documento_id }) => (
  periodo && id_anfitrion && documento_id
);

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

// Devuelve los puntos de venta vigentes para un invitado convencional.
// Si el usuario no tiene punto activo/turno vigente, el dashboard queda
// sin datos para evitar mezclar caja con otras agencias.
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

// Resuelve el alcance real del dashboard antes de consultar indicadores.
// Aqui se decide si el filtro es global, por agencia o por lista de agencias.
const resolverAccesoDashboardTransporte = async (filtro) => {
  if (!filtro.id_invitado || filtro.id_anfitrion === filtro.id_invitado) {
    return {
      ...filtro,
      acceso_total: true,
      id_usuario_operacion: filtro.id_usuario_trabajo || null,
      id_puntos_venta: null,
    };
  }

  if (String(filtro.super_usuario) === '1') {
    return {
      ...filtro,
      acceso_total: true,
      id_usuario_operacion: filtro.id_usuario_trabajo || null,
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
      id_usuario_operacion: filtro.id_usuario_trabajo || null,
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
// id_usuario_operacion corresponde al correo guardado en ctrl_crea_us.
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

// Calcula los KPI principales de caja:
// encomiendas, boletos, entregas, SUNAT pendiente y montos.
// Cuando se filtra por agencia, separa origen/destino para no duplicar caja.
const obtenerResumenDashboardTransporteData = async (filtro) => {
  const params = [filtro.periodo, filtro.id_anfitrion, filtro.documento_id];
  const filtros = [];
  const filtrosCaja = [];

  if (filtro.fecha) {
    params.push(filtro.fecha);
    filtros.push(`AND tv.r_fecemi = $${params.length}::date`);
    filtrosCaja.push(`AND c.fecha::date = $${params.length}::date`);
  }

  if (filtro.id_usuario_operacion) {
    params.push(filtro.id_usuario_operacion);
    filtros.push(`AND tv.ctrl_crea_us = $${params.length}`);
    filtrosCaja.push(`AND c.id_invitado = $${params.length}`);
  }

  let filtroAgenciaOrigen = '';
  let filtroAgenciaDestino = '';
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
    filtrosCaja.push(`AND c.id_punto_venta = $${params.length}`);
  }

  if (Array.isArray(filtro.id_puntos_venta) && filtro.id_puntos_venta.length > 0) {
    params.push(filtro.id_puntos_venta);
    filtroAgenciaOrigen = `AND tv.id_punto_venta = ANY($${params.length}::varchar[])`;
    filtroAgenciaDestino = `AND tv.id_punto_venta_dest = ANY($${params.length}::varchar[])`;
    filtroMontoTotal = `tv.id_punto_venta = ANY($${params.length}::varchar[])`;
    filtroEfectivoAgencia = `(tv.id_punto_venta = ANY($${params.length}::varchar[]) OR (tv.entrega_fecha IS NOT NULL AND tv.id_punto_venta_dest = ANY($${params.length}::varchar[])))`;
    filtroPendienteCobroEntrega = `tv.id_punto_venta_dest = ANY($${params.length}::varchar[])`;
    filtrosCaja.push(`AND c.id_punto_venta = ANY($${params.length}::varchar[])`);
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
    monto_caja_manual: Number(row.monto_caja_manual || 0),
    monto_efectivo_agencia: Math.max(
      0,
      Number(row.monto_efectivo_origen_agencia || 0) +
      Number(row.monto_efectivo_destino_entregado || 0) -
      Number(row.monto_caja_manual || 0)
    ),
    monto_boletos: Number(row.monto_boletos || 0),
    monto_total: Number(row.monto_total || 0),
  };
};

// Agrupa documentos por franjas de 2 horas para medir productividad del turno.
// Sirve para ver en que hora se concentro la emision del dia.
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

// Resume el estado tributario de boletas de transporte listas o pendientes
// para el resumen diario SUNAT.
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

// Recaudacion por agencia.
// En vista global lista todas las agencias activas; al filtrar por una agencia
// muestra solo esa caja. En invitado normal respeta sus agencias permitidas.
const obtenerRecaudacionAgenciasDashboardTransporteData = async (filtro) => {
  const params = [filtro.periodo, filtro.id_anfitrion, filtro.documento_id];
  const filtrosVentaOrigen = [];
  const filtrosVentaDestino = [];
  const filtrosFechaCaja = [];

  if (filtro.fecha) {
    params.push(filtro.fecha);
    filtrosVentaOrigen.push(`AND tv.r_fecemi = $${params.length}::date`);
    filtrosVentaDestino.push(`AND tv.entrega_fecha::date = $${params.length}::date`);
    filtrosFechaCaja.push(`AND c.fecha::date = $${params.length}::date`);
  }

  if (filtro.id_usuario_operacion) {
    params.push(filtro.id_usuario_operacion);
    filtrosVentaOrigen.push(`AND tv.ctrl_crea_us = $${params.length}`);
    filtrosVentaDestino.push(`AND tv.entrega_ctrl_us = $${params.length}`);
    filtrosFechaCaja.push(`AND c.id_invitado = $${params.length}`);
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

  return result.rows.map((item) => ({
    id_punto_venta: item.id_punto_venta,
    agencia: item.agencia,
    encomiendas_facturadas: Number(item.encomiendas_facturadas || 0),
    monto_facturado: Number(item.monto_facturado || 0),
    encomiendas_por_pagar: Number(item.encomiendas_por_pagar || 0),
    monto_por_pagar: Number(item.monto_por_pagar || 0),
    encomiendas_salidas_dinero: Number(item.encomiendas_salidas_dinero || 0),
    monto_salidas_dinero: Number(item.monto_salidas_dinero || 0),
    monto_caja_manual: Number(item.monto_caja_manual || 0),
    encomiendas_destino_entregadas: Number(item.encomiendas_salidas_dinero || 0),
    monto_destino_entregado: Number(item.monto_salidas_dinero || 0),
    monto_recaudado: Number(item.monto_recaudado || 0),
    monto_efectivo: Number(item.monto_efectivo || 0),
  }));
};

// Lista los usuarios que registraron movimiento en el filtro actual.
// La fuente oficial del usuario operativo es mve_transventa.ctrl_crea_us.
// Por ahora el nombre mostrado es el mismo correo, sin depender de mad_usuario.
const obtenerUsuariosDashboardTransporteData = async (filtroFinal) => {
  if (!filtroFinal.acceso_total) {
    return [{
      id_usuario: filtroFinal.id_invitado,
      nombre: filtroFinal.id_invitado,
      documentos: 0,
      monto_total: 0,
    }];
  }

  const filtroUsuarios = {
    ...filtroFinal,
    id_usuario_operacion: null,
  };

  const params = [filtroUsuarios.periodo, filtroUsuarios.id_anfitrion, filtroUsuarios.documento_id];
  const filtros = agregarFiltroDashboardTransporte({
    params,
    fecha: filtroUsuarios.fecha,
    id_punto_venta: filtroUsuarios.id_punto_venta,
    id_puntos_venta: filtroUsuarios.id_puntos_venta,
  });

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

  return result.rows.map((item) => ({
    id_usuario: item.id_usuario,
    nombre: item.nombre,
    documentos: Number(item.documentos || 0),
    monto_total: Number(item.monto_total || 0),
  }));
};

const obtenerUsuariosDashboardTransporte = async (req, res) => {
  const filtro = resolverFiltroDashboardTransporte(req);

  if (!validarFiltroDashboardTransporte(filtro)) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para usuarios del dashboard'
    });
  }

  try {
    const filtroFinal = await resolverAccesoDashboardTransporte({
      ...filtro,
      id_usuario_trabajo: null,
    });
    const data = await obtenerUsuariosDashboardTransporteData(filtroFinal);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error al obtener usuarios del dashboard de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
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

// Endpoint principal.
// Devuelve todos los bloques que necesita la pantalla en una sola llamada:
// filtros aplicados, resumen, productividad, SUNAT, rutas, comparativo,
// recaudacion y usuarios de trabajo.
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
    const [resumen, productividad, sunat, rutas, comparativoMensual, recaudacionAgencias, usuariosTrabajo] = await Promise.all([
      obtenerResumenDashboardTransporteData(filtroFinal),
      obtenerProductividadDashboardTransporteData(filtroFinal),
      obtenerSunatDashboardTransporteData(filtroFinal),
      obtenerRutasDashboardTransporteData(filtroFinal),
      obtenerComparativoMensualEncomiendasDashboardTransporteData(filtroFinal),
      obtenerRecaudacionAgenciasDashboardTransporteData(filtroFinal),
      obtenerUsuariosDashboardTransporteData(filtroFinal),
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
        usuarios_trabajo: usuariosTrabajo,
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

  if (normalizarTexto(venta.numero_rdi)) {
    const error = new Error(`La encomienda ya fue incluida en el RDI ${venta.numero_rdi}. No corresponde envio individual.`);
    error.statusCode = 409;
    error.nivel = 'PENDIENTE';
    throw error;
  }

  if (normalizarTexto(venta.r_vfirmado)) {
    const error = new Error('La encomienda ya tiene firma SUNAT registrada. Use las descargas del comprobante.');
    error.statusCode = 409;
    error.nivel = 'ACEPTADO';
    throw error;
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
      cliente_direccion_fact: venta.cliente_direccion_fact || '',
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

const generaJsonTicketEncomiendaExpertcontTransporte = async (
  p_periodo,
  p_id_usuario,
  p_documento_id,
  p_r_cod,
  p_r_serie,
  p_r_numero,
  p_elemento,
  endpointPdf = TICKET_ENCOMIENDA_ENDPOINT
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
           ruta.nombre AS nombre_ruta,
           punto_origen.nombre AS punto_venta_nombre,
           punto_destino.nombre AS punto_venta_dest_nombre
      FROM mve_transventa tv
      LEFT JOIN mve_transruta ruta
        ON ruta.id_usuario = tv.id_usuario
       AND ruta.documento_id = tv.documento_id
       AND ruta.id_ruta = tv.id_ruta
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
       AND tv.elemento = $7
    `,
    [p_periodo, p_id_usuario, p_documento_id, p_r_cod, p_r_serie, p_r_numero, p_elemento]
  );
  const venta = ventaQuery.rows[0];

  if (!venta) {
    throw new Error('ENCOMIENDA NO ENCONTRADA');
  }

  if (String(venta.tipo_operacion || '').trim() !== 'E') {
    throw new Error('Solo se puede generar ticket para una operacion de encomienda');
  }

  const total = toNumber(venta.r_monto_total || venta.precio_neto);

  return JSON.stringify({
    rubro: 'TRANS_ENCOMIENDA',
    endpoint_pdf: endpointPdf,
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
      moneda_id: 'PEN',
      forma_pago_id: venta.condicion_pago || 'PAGADO',
      medio_pago: 'EFECTIVO',
      total,
      r_monto_total: total,
      total_igv: toNumber(venta.r_igv),
      base_gravada: toNumber(venta.r_gravado),
      base_exonerada: toNumber(venta.r_exonerado),
      nota: venta.numero_rdi ? `RDI: ${venta.numero_rdi}` : '',
      r_vfirmado: venta.r_vfirmado || '',
    },
    encomienda: {
      periodo: venta.periodo,
      r_cod: venta.r_cod,
      r_serie: venta.r_serie,
      r_numero: venta.r_numero,
      elemento: venta.elemento,
      r_fecemi: toIsoDate(venta.r_fecemi),
      ctrl_crea: toIsoTime(venta.ctrl_crea),
      cliente: venta.cliente,
      cliente_documento_id: venta.cliente_documento_id,
      cliente_telefono: venta.cliente_telefono,
      cliente_direccion_fact: venta.cliente_direccion_fact || '',
      cliente_direccion: venta.cliente_direccion_fact || venta.cliente_direccion || '',
      remitente_zona: venta.cliente_zona,
      remitente_direccion: venta.cliente_direccion,
      destinatario: venta.destinatario,
      destinatario_documento_id: venta.destinatario_documento_id,
      destinatario_telefono: venta.destinatario_telefono,
      destinatario_zona: venta.destinatario_zona,
      destinatario_direccion: venta.destinatario_direccion,
      id_ruta: venta.id_ruta,
      nombre_ruta: venta.nombre_ruta,
      id_punto_venta: venta.id_punto_venta,
      punto_venta_nombre: venta.punto_venta_nombre,
      id_punto_venta_dest: venta.id_punto_venta_dest,
      punto_venta_dest_nombre: venta.punto_venta_dest_nombre,
      descripcion: venta.descripcion,
      placa: venta.placa,
      licencia: venta.licencia,
      condicion_pago: venta.condicion_pago,
      medio_pago: 'EFECTIVO',
      llegada_aprox: toIsoTime(venta.llegada_aprox),
      numero_rdi: venta.numero_rdi,
      observaciones: venta.numero_rdi ? `RDI: ${venta.numero_rdi}` : '-',
      precio_neto: total,
      r_monto_total: total,
    },
    ticket: {
      formato: 'ENCOMIENDA_BOARDING_PASS_80MM',
      titulo: 'ENCOMIENDA',
      mostrar_origen_destino: true,
      mostrar_qr: true,
      endpoint_pdf: endpointPdf,
      rubro: 'TRANS_ENCOMIENDA',
    },
    items: [
      {
        producto: venta.descripcion || 'SERVICIO DE TRANSPORTE DE ENCOMIENDA',
        cantidad: 1,
        precio_neto: total,
      }
    ],
  }, null, 2);
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
  // Se excluyen comprobantes con RDI para no volver a resumir documentos ya tratados.
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
       AND COALESCE(tv.numero_rdi, '') = ''
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
    const status = Number(venta.registrado) === 0 ? '3' : '1';

    return {
      tipo_documento: venta.r_cod_ref || venta.r_cod,
      serie: venta.r_serie_ref || venta.r_serie,
      numero: venta.r_numero_ref || venta.r_numero,
      cliente_numero_documento: venta.cliente_documento_id || '-',
      cliente_tipo_documento: venta.cliente_id_doc || '0',
      status,
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
      const dataEncomienda = { ...req.body };

      if (dataEncomienda.fecha_servidor === true) {
        const fechaServidor = await obtenerFechaServidorLima();
        dataEncomienda.r_fecemi = fechaServidor.startsWith(`${dataEncomienda.periodo}-`)
          ? fechaServidor
          : `${dataEncomienda.periodo}-01`;
      }

      const result = await pool.query(
        'SELECT public.fve_transventa_grabar_encomienda($1::jsonb) AS data',
        [dataEncomienda]
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
  const idPuntoVenta = normalizarTexto(req.params.id_punto_venta || req.query?.id_punto_venta);

  if (!periodo || !id_anfitrion || !documento_id || dia === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener operaciones de transporte'
    });
  }

  try {
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

    if (dia !== '*') {
      params.push(`${periodo}-${dia}`);
      query += ` AND tv.r_fecemi = $${params.length} `;
    }

    if (idPuntoVenta) {
      params.push(idPuntoVenta);
      query += ` AND tv.id_punto_venta = $${params.length} `;
    }

    query += `
      ORDER BY tv.r_fecemi DESC, tv.r_serie, tv.r_numero DESC, tv.elemento
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

    if (normalizarTexto(r_fecemi)) {
      const fechaActualQuery = await pool.query(`
        SELECT CAST(r_fecemi AS VARCHAR(10)) AS r_fecemi,
               numero_rdi,
               r_vfirmado
          FROM mve_transventa
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
      `, [
        periodo, idUsuarioFinal, documento_id,
        r_cod, r_serie, r_numero, elemento,
      ]);

      if (fechaActualQuery.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Operacion de transporte no encontrada'
        });
      }

      const fechaActual = fechaActualQuery.rows[0];
      const fechaNueva = String(r_fecemi).slice(0, 10);
      const tieneEnvioSunat = Boolean(normalizarTexto(fechaActual.numero_rdi) || normalizarTexto(fechaActual.r_vfirmado));

      if (tieneEnvioSunat && fechaNueva !== fechaActual.r_fecemi) {
        return res.status(409).json({
          success: false,
          message: 'No se puede modificar la fecha de una encomienda enviada a SUNAT o incluida en RDI'
        });
      }
    }

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
           SET cdr_descripcion = $8,
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
          errorNormalizado.respuesta_sunat_descripcion,
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
           SET r_vfirmado = COALESCE($8, r_vfirmado),
               cdr_descripcion = $9,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($10, ctrl_mod_us)
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
          codigo_hash,
          (respuesta_sunat_descripcion || '').substring(0, 100),
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
    return res.status(error.statusCode || 500).json(normalizarErrorSunatTransporte(
      { message: error.message, nivel: error.nivel || 'ERROR' },
      'Error interno procesando envio SUNAT de transporte'
    ));
  }
};

const normalizarEncomiendasGrem = (body = {}) => {
  const encomiendas = Array.isArray(body.encomiendas) && body.encomiendas.length > 0
    ? body.encomiendas
    : [{
        r_cod: body.p_r_cod || body.r_cod,
        r_serie: body.p_r_serie || body.r_serie,
        r_numero: body.p_r_numero || body.r_numero,
        elemento: body.p_elemento || body.elemento || 1,
      }];

  return encomiendas
    .map((item) => ({
      r_cod: normalizarTexto(item.r_cod),
      r_serie: normalizarTexto(item.r_serie),
      r_numero: normalizarTexto(item.r_numero),
      elemento: Number(item.elemento || 1),
    }))
    .filter((item) => item.r_cod && item.r_serie && item.r_numero && Number.isFinite(item.elemento));
};

const obtenerVentasGremTransporte = async ({ periodo, idUsuario, documentoId, encomiendas }) => {
  const params = [periodo, idUsuario, documentoId];
  const condiciones = encomiendas.map((item) => {
    params.push(item.r_cod, item.r_serie, item.r_numero, item.elemento);
    const base = params.length - 3;
    return `(tv.r_cod = $${base} AND tv.r_serie = $${base + 1} AND tv.r_numero = $${base + 2} AND tv.elemento = $${base + 3})`;
  });

  const result = await pool.query(
    `
      SELECT ${columnasVentaTransDesde('tv')},
             ruta.nombre AS nombre_ruta,
             punto_origen.nombre AS punto_venta_nombre,
             punto_origen.direccion AS punto_venta_direccion,
             punto_origen.id_ubigeo AS punto_venta_ubigeo,
             punto_destino.nombre AS punto_venta_dest_nombre,
             punto_destino.direccion AS punto_venta_dest_direccion,
             punto_destino.id_ubigeo AS punto_venta_dest_ubigeo
        FROM mve_transventa tv
        LEFT JOIN mve_transruta ruta
          ON ruta.id_usuario = tv.id_usuario
         AND ruta.documento_id = tv.documento_id
         AND ruta.id_ruta = tv.id_ruta
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
         AND tv.tipo_operacion = 'E'
         AND (${condiciones.join(' OR ')})
       ORDER BY tv.r_fecemi, tv.r_serie, tv.r_numero, tv.elemento
    `,
    params
  );

  return result.rows;
};

const generarNumeroGremTransporte = async ({
  idUsuario,
  documentoId,
  periodo,
  serie,
}) => {
  const result = await pool.query(
    `
      SELECT LPAD((COALESCE(MAX(numero::integer), 0) + 1)::text, 8, '0') AS numero
        FROM public.mve_transgrem
       WHERE id_usuario = $1
         AND documento_id = $2
         AND periodo = $3
         AND cod = '31'
         AND serie = $4
         AND numero ~ '^[0-9]+$'
    `,
    [idUsuario, documentoId, periodo, serie]
  );

  return result.rows[0]?.numero || '00000001';
};

const validarPayloadGremMinimo = (guia = {}) => {
  const requeridos = [
    ['serie', 'serie'],
    ['fecha_traslado', 'fecha de traslado'],
    ['motivo_traslado_id', 'motivo de traslado'],
    ['modalidad_traslado_id', 'modalidad de traslado'],
    ['partida_ubigeo', 'ubigeo de partida'],
    ['partida_direccion', 'direccion de partida'],
    ['llegada_ubigeo', 'ubigeo de llegada'],
    ['llegada_direccion', 'direccion de llegada'],
    ['transportista_placa_numero', 'placa del vehiculo'],
    ['conductor_documento_id', 'documento del conductor'],
    ['conductor_nombres', 'nombres del conductor'],
    ['conductor_apellidos', 'apellidos del conductor'],
    ['conductor_licencia', 'licencia del conductor'],
  ];

  const faltantes = requeridos
    .filter(([key]) => !normalizarTexto(guia[key]))
    .map(([, label]) => label);

  if (!toNumber(guia.peso_total, 0)) {
    faltantes.push('peso total');
  }

  if (!toNumber(guia.numero_bultos, 0)) {
    faltantes.push('numero de bultos');
  }

  if (faltantes.length > 0) {
    const error = new Error(`Faltan datos minimos para GRE Transportista: ${faltantes.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
};

const normalizarPayloadGremSunat = (payload) => {
  const guia = payload.guia || {};
  const fechaEmision = toIsoDate(guia.fecha_emision || guia.fechaEmision || new Date());
  const fechaTraslado = toIsoDate(guia.fecha_traslado || guia.fechaTraslado);
  const horaEmision = toIsoTime(guia.hora_emision || guia.horaEmision || new Date());

  payload.guia = {
    ...guia,
    fecha_emision: fechaEmision,
    fechaEmision,
    fecha_traslado: fechaTraslado,
    fechaTraslado,
    hora_emision: horaEmision,
    horaEmision,
    hora: horaEmision,
    issue_time: horaEmision,
    issueTime: horaEmision,
    IssueTime: horaEmision,
  };

  payload.fecha_emision = fechaEmision;
  payload.fechaEmision = fechaEmision;
  payload.fecha_traslado = fechaTraslado;
  payload.fechaTraslado = fechaTraslado;
  payload.hora_emision = horaEmision;
  payload.horaEmision = horaEmision;
  payload.hora = horaEmision;
  payload.issue_time = horaEmision;
  payload.issueTime = horaEmision;
  payload.IssueTime = horaEmision;

  return payload;
};

const validarHoraEmisionGremSunat = (payload) => {
  const horaEmision = payload?.guia?.hora_emision || payload?.hora_emision;

  if (!/^\d{2}:\d{2}:\d{2}$/.test(String(horaEmision || ''))) {
    const error = new Error(`Hora de emision GRE invalida: ${horaEmision || 'vacia'}`);
    error.statusCode = 400;
    throw error;
  }

  return horaEmision;
};

const listarGremTransporte = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para listar GREM',
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          g.id_usuario,
          g.documento_id,
          g.periodo,
          g.cod,
          g.serie,
          g.numero,
          CAST(g.fecha_emision AS varchar(10)) AS fecha_emision,
          CAST(g.hora_emision AS varchar(12)) AS hora_emision,
          CAST(g.fecha_traslado AS varchar(10)) AS fecha_traslado,
          g.guia_motivo_id,
          g.guia_modalidad_id,
          g.partida_ubigeo,
          g.partida_direccion,
          g.llegada_ubigeo,
          g.llegada_direccion,
          g.peso_total,
          g.conductor_dni,
          g.conductor_nombres,
          g.conductor_apellidos,
          g.conductor_licencia,
          g.vehiculo_placa,
          g.destinatario_tipo,
          g.destinatario_ruc_dni,
          g.destinatario_razon_social,
          g.vfirmado,
          g.glosa,
          g.ref_cod,
          g.ref_serie,
          g.ref_numero,
          CAST(g.ctrl_crea AS varchar(30)) AS ctrl_crea,
          CAST(g.ctrl_mod AS varchar(30)) AS ctrl_mod,
          COALESCE(COUNT(d.*), 0)::integer AS cantidad_encomiendas,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'item', d.item,
                'cantidad', d.cantidad,
                'descripcion', d.descripcion,
                'r_periodo', d.r_periodo,
                'r_cod', d.r_cod,
                'r_serie', d.r_serie,
                'r_numero', d.r_numero,
                'monto_flete', COALESCE(d.monto_flete, tv.r_monto_total, tv.precio_neto),
                'destinatario_tipo', tv.destinatario_id_doc,
                'destinatario_documento', tv.destinatario_documento_id,
                'destinatario_nombre', tv.destinatario,
                'comprobante_cod', COALESCE(tv.r_cod_ref, tv.r_cod),
                'comprobante_serie', COALESCE(tv.r_serie_ref, tv.r_serie),
                'comprobante_numero', COALESCE(tv.r_numero_ref, tv.r_numero),
                'comprobante_fecha', CAST(tv.r_fecemi AS varchar(10)),
                'destinatario', tv.destinatario,
                'cliente', tv.cliente,
                'r_monto_total', tv.r_monto_total,
                'precio_neto', tv.precio_neto
              )
              ORDER BY d.item
            ) FILTER (WHERE d.item IS NOT NULL),
            '[]'::json
          ) AS detalles
        FROM public.mve_transgrem g
        LEFT JOIN public.mve_transgremdet d
          ON d.id_usuario = g.id_usuario
         AND d.documento_id = g.documento_id
         AND d.periodo = g.periodo
         AND d.cod = g.cod
         AND d.serie = g.serie
         AND d.numero = g.numero
        LEFT JOIN public.mve_transventa tv
          ON tv.id_usuario = d.id_usuario
         AND tv.documento_id = d.documento_id
         AND tv.periodo = d.r_periodo
         AND tv.r_cod = d.r_cod
         AND tv.r_serie = d.r_serie
         AND tv.r_numero = d.r_numero
         AND tv.elemento = 1
        WHERE g.id_usuario = $1
          AND g.documento_id = $2
          AND g.periodo = $3
        GROUP BY
          g.id_usuario,
          g.documento_id,
          g.periodo,
          g.cod,
          g.serie,
          g.numero
        ORDER BY g.fecha_traslado DESC NULLS LAST, g.ctrl_crea DESC NULLS LAST, g.serie DESC, g.numero DESC
      `,
      [id_anfitrion, documento_id, periodo]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    if (error.code === '42703') {
      try {
        const legacyResult = await pool.query(
          `
            SELECT
              g.id_usuario,
              g.documento_id,
              g.periodo,
              g.cod,
              g.serie,
              g.numero,
              CAST(g.fecha_emision AS varchar(10)) AS fecha_emision,
              CAST(g.hora_emision AS varchar(12)) AS hora_emision,
              CAST(g.fecha_traslado AS varchar(10)) AS fecha_traslado,
              g.guia_motivo_id,
              g.guia_modalidad_id,
              g.partida_ubigeo,
              g.partida_direccion,
              g.llegada_ubigeo,
              g.llegada_direccion,
              g.peso_total,
              g.conductor_dni,
              g.conductor_nombres,
              g.conductor_apellidos,
              g.conductor_licencia,
              g.vehiculo_placa,
              g.destinatario_tipo,
              g.destinatario_ruc_dni,
              g.destinatario_razon_social,
              g.vfirmado,
              g.glosa,
              g.ref_cod,
              g.ref_serie,
              g.ref_numero,
              CAST(g.ctrl_crea AS varchar(30)) AS ctrl_crea,
              CAST(g.ctrl_mod AS varchar(30)) AS ctrl_mod,
              COALESCE(COUNT(d.*), 0)::integer AS cantidad_encomiendas,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'item', d.item,
                    'cantidad', d.cantidad,
                    'descripcion', d.descripcion,
                    'r_periodo', d.r_periodo,
                    'r_cod', d.r_cod,
                    'r_serie', d.r_serie,
                    'r_numero', d.r_numero,
                    'monto_flete', COALESCE(d.monto_flete, tv.r_monto_total, tv.precio_neto),
                    'elemento', COALESCE(tv.elemento, 1),
                    'destinatario', tv.destinatario,
                    'cliente', tv.cliente,
                    'r_monto_total', tv.r_monto_total,
                    'precio_neto', tv.precio_neto
                  )
                  ORDER BY d.item
                ) FILTER (WHERE d.item IS NOT NULL),
                '[]'::json
              ) AS detalles
            FROM public.mve_transgrem g
            LEFT JOIN public.mve_transgremdet d
              ON d.id_usuario = g.id_usuario
             AND d.documento_id = g.documento_id
             AND d.periodo = g.periodo
             AND d.cod = g.cod
             AND d.serie = g.serie
             AND d.numero = g.numero
            LEFT JOIN public.mve_transventa tv
              ON tv.id_usuario = d.id_usuario
             AND tv.documento_id = d.documento_id
             AND tv.periodo = d.r_periodo
             AND tv.r_cod = d.r_cod
             AND tv.r_serie = d.r_serie
             AND tv.r_numero = d.r_numero
            WHERE g.id_usuario = $1
              AND g.documento_id = $2
              AND g.periodo = $3
            GROUP BY
              g.id_usuario,
              g.documento_id,
              g.periodo,
              g.cod,
              g.serie,
              g.numero
            ORDER BY g.fecha_traslado DESC NULLS LAST, g.ctrl_crea DESC NULLS LAST, g.serie DESC, g.numero DESC
          `,
          [id_anfitrion, documento_id, periodo]
        );

        return res.status(200).json({
          success: true,
          data: legacyResult.rows,
          migracion_pendiente: true,
          mensaje_usuario: 'GREM listadas en modo compatible. Falta aplicar la migracion de detalle GREM extendido.',
        });
      } catch (legacyError) {
        console.error('Error listando GREM transporte en modo compatible:', legacyError);
      }
    }

    console.error('Error listando GREM transporte:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno listando GREM de transporte',
      mensaje_usuario: error.code === '42P01'
        ? 'Falta aplicar las tablas mve_transgrem/mve_transgremdet.'
        : 'No se pudo listar las GREM.',
    });
  }
};

const generarPayloadGremTransporte = async ({
  periodo,
  idUsuario,
  documentoId,
  guia = {},
  encomiendas = [],
}) => {
  if (!periodo || !idUsuario || !documentoId) {
    throw new Error('Faltan parametros requeridos para generar GRE Transportista');
  }

  const seleccion = normalizarEncomiendasGrem({ encomiendas });
  if (seleccion.length === 0) {
    throw new Error('Debe seleccionar al menos una encomienda para la GRE Transportista');
  }

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

  if (datosQuery.rows.length === 0) {
    throw new Error('No se encontraron datos de empresa para generar GRE Transportista');
  }

  const ventas = await obtenerVentasGremTransporte({
    periodo,
    idUsuario,
    documentoId,
    encomiendas: seleccion,
  });

  if (ventas.length !== seleccion.length) {
    throw new Error('Una o mas encomiendas seleccionadas no existen o no son de tipo encomienda');
  }

  const primera = ventas[0];
  const empresa = datosQuery.rows[0];
  const fechaTraslado = normalizarTexto(guia.fecha_traslado) || toIsoDate(primera.r_fecemi);
  const serie = normalizarSerieGremTransporte(guia.serie);
  const numero = normalizarTexto(guia.numero) || null;
  const pesoTotal = toNumber(guia.peso_total, ventas.length);
  const numeroBultos = Number(guia.numero_bultos || ventas.length);

  const detalles = ventas.map((venta, index) => ({
    item: index + 1,
    documento_relacionado: {
      tipo_documento: venta.r_cod_ref || venta.r_cod,
      serie: venta.r_serie_ref || venta.r_serie,
      numero: venta.r_numero_ref || venta.r_numero,
      fecha_emision: toIsoDate(venta.r_fecemi),
    },
    descripcion: venta.descripcion || 'ENCOMIENDA',
    cantidad: toNumber(venta.cantidad, 1),
    unidad_medida: 'NIU',
    peso: toNumber(venta.peso_total, 0) || null,
    remitente: {
      tipo_documento: venta.cliente_id_doc || '1',
      numero_documento: venta.cliente_documento_id || venta.cliente_documento || '',
      razon_social: venta.cliente || '',
      direccion: venta.remitente_direccion || venta.cliente_direccion || '',
      telefono: venta.cliente_telefono || '',
    },
    destinatario: {
      tipo_documento: venta.destinatario_id_doc || '1',
      numero_documento: venta.destinatario_documento_id || venta.destinatario_documento || '',
      razon_social: venta.destinatario || '',
      direccion: venta.destinatario_direccion || '',
      telefono: venta.destinatario_telefono || '',
    },
    origen: {
      id_punto_venta: venta.id_punto_venta,
      nombre: venta.punto_venta_nombre || venta.id_punto_venta,
      ubigeo: venta.punto_venta_ubigeo || '',
      direccion: venta.punto_venta_direccion || venta.remitente_direccion || '',
    },
    destino: {
      id_punto_venta: venta.id_punto_venta_dest,
      nombre: venta.punto_venta_dest_nombre || venta.id_punto_venta_dest,
      ubigeo: venta.punto_venta_dest_ubigeo || '',
      direccion: venta.punto_venta_dest_direccion || venta.destinatario_direccion || '',
    },
    monto_flete: toNumber(venta.r_monto_total || venta.precio_neto),
  }));

  const payload = {
    rubro: 'TRANS_GREM',
    empresa: {
      documento_id: empresa.documento_id,
      razon_social: empresa.razon_social,
      nombre_comercial: empresa.nombre_comercial,
      direccion: empresa.direccion,
      ubigeo: empresa.ubigeo,
      distrito: empresa.distrito,
      provincia: empresa.provincia,
      departamento: empresa.departamento,
      modo: empresa.modo,
    },
    guia: {
      codigo: '31',
      serie,
      numero,
      fecha_emision: toIsoDate(new Date()),
      fecha_traslado: fechaTraslado,
      hora_emision: toIsoTime(new Date()),
      motivo_traslado_id: '13',
      modalidad_traslado_id: '01',
      peso_total: pesoTotal,
      numero_bultos: Number.isFinite(numeroBultos) ? numeroBultos : ventas.length,
      observacion: normalizarTexto(guia.observacion),
      partida_ubigeo: normalizarTexto(guia.partida_ubigeo) || primera.punto_venta_ubigeo || '',
      partida_direccion: normalizarTexto(guia.partida_direccion) || primera.punto_venta_direccion || primera.remitente_direccion || '',
      llegada_ubigeo: normalizarTexto(guia.llegada_ubigeo) || primera.punto_venta_dest_ubigeo || '',
      llegada_direccion: normalizarTexto(guia.llegada_direccion) || primera.punto_venta_dest_direccion || primera.destinatario_direccion || '',
      transportista_placa_numero: normalizarTexto(guia.placa) || primera.placa || '',
      conductor_documento_id: normalizarTexto(guia.conductor_documento_id),
      conductor_nombres: normalizarTexto(guia.conductor_nombres),
      conductor_apellidos: normalizarTexto(guia.conductor_apellidos),
      conductor_licencia: normalizarTexto(guia.licencia) || primera.licencia || '',
    },
    resumen: {
      cantidad_encomiendas: ventas.length,
      ruta: primera.nombre_ruta || primera.id_ruta || '',
      id_ruta: primera.id_ruta,
      id_punto_venta: primera.id_punto_venta,
      id_punto_venta_dest: primera.id_punto_venta_dest,
      monto_total_flete: ventas.reduce((total, venta) => total + toNumber(venta.r_monto_total || venta.precio_neto), 0),
    },
    detalles,
  };

  validarPayloadGremMinimo(payload.guia);

  // GREM transportista es independiente del CPE/RDI de la boleta. Este payload
  // agrupa las encomiendas seleccionadas para que el backend API SUNAT genere XML 31.
  return normalizarPayloadGremSunat(payload);
};

const responderPayloadGremTransporte = async (req, res) => {
  try {
    const periodo = normalizarTexto(req.body.periodo || req.body.p_periodo);
    const idUsuario = normalizarTexto(req.body.id_usuario || req.body.id_anfitrion || req.body.p_id_usuario);
    const documentoId = normalizarTexto(req.body.documento_id || req.body.p_documento_id);
    const payload = await generarPayloadGremTransporte({
      periodo,
      idUsuario,
      documentoId,
      guia: req.body.guia || {},
      encomiendas: req.body.encomiendas || [],
    });

    return res.status(200).json({ success: true, payload });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || 'No se pudo generar payload GRE Transportista',
    });
  }
};

const obtenerUbigeosGremTransporte = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT
          id_catalogo AS codigo,
          nombre AS descripcion,
          '-'::varchar(2) AS auxiliar
        FROM public.mct_ubigeo
        ORDER BY nombre
      `
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error('Error obteniendo ubigeos para GREM transporte:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno obteniendo ubigeos de transporte.',
    });
  }
};

const grabarGremTransporte = async (req, res) => {
  const periodo = normalizarTexto(req.body.periodo || req.body.p_periodo);
  const idUsuario = normalizarTexto(req.body.id_usuario || req.body.id_anfitrion || req.body.p_id_usuario);
  const documentoId = normalizarTexto(req.body.documento_id || req.body.p_documento_id);
  const encomiendas = normalizarEncomiendasGrem(req.body);

  try {
    const payload = await generarPayloadGremTransporte({
      periodo,
      idUsuario,
      documentoId,
      guia: req.body.guia || {},
      encomiendas,
    });

    const serie = normalizarSerieGremTransporte(payload.guia.serie);
    payload.guia.serie = serie;
    const numero = payload.guia.numero || await generarNumeroGremTransporte({
      idUsuario,
      documentoId,
      periodo,
      serie,
    });

    payload.guia.numero = numero;

    await guardarGremTransporteLocal({
      periodo,
      idUsuario,
      documentoId,
      encomiendas,
      payload,
      grem: {
        codigo: '31',
        serie,
        numero,
        codigo_hash: null,
        respuesta_sunat_descripcion: req.body.guia?.observacion || 'GREM grabada localmente',
      },
      ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
    });

    return res.status(200).json({
      success: true,
      titulo_usuario: 'GREM grabada',
      mensaje_usuario: `GREM ${serie}-${numero} grabada correctamente.`,
      grem_cod: '31',
      grem_serie: serie,
      grem_numero: numero,
      payload,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'No se pudo grabar la GREM',
      mensaje_usuario: error.message || 'No se pudo grabar la GREM.',
    });
  }
};

const actualizarGremTransporteEncomiendas = async ({
  periodo,
  idUsuario,
  documentoId,
  encomiendas,
  grem,
  ctrlModUs,
}) => {
  const params = [
    periodo,
    idUsuario,
    documentoId,
    grem.codigo || '31',
    grem.serie,
    grem.numero,
    grem.codigo_hash || null,
    (grem.respuesta_sunat_descripcion || '').substring(0, 250),
    ctrlModUs || null,
  ];

  const condiciones = encomiendas.map((item) => {
    params.push(item.r_cod, item.r_serie, item.r_numero, item.elemento);
    const base = params.length - 3;
    return `(r_cod = $${base} AND r_serie = $${base + 1} AND r_numero = $${base + 2} AND elemento = $${base + 3})`;
  });

  await pool.query(
    `
      UPDATE mve_transventa
         SET grem_cod = $4,
             grem_serie = $5,
             grem_numero = $6,
             grem_vfirmado = COALESCE($7, grem_vfirmado),
             grem_cdr_descripcion = $8,
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($9, ctrl_mod_us)
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND (${condiciones.join(' OR ')})
    `,
    params
  );
};

const guardarGremTransporteLocal = async ({
  periodo,
  idUsuario,
  documentoId,
  encomiendas,
  payload,
  grem,
  ctrlModUs,
}) => {
  const client = await pool.connect();
  const guia = payload.guia || {};
  const detalles = payload.detalles || [];
  const primerDetalle = detalles[0] || {};
  const guardarDestinatarioCabecera = encomiendas.length === 1;
  const usuarioAuditoria = ctrlModUs || null;
  const gremCod = grem.codigo || guia.codigo || '31';
  const gremSerie = grem.serie || guia.serie;
  const gremNumero = grem.numero || guia.numero;

  try {
    await client.query('BEGIN');

    const gremExistente = await client.query(
      `
        SELECT vfirmado
          FROM public.mve_transgrem
         WHERE id_usuario = $1
           AND documento_id = $2
           AND periodo = $3
           AND cod = $4
           AND serie = $5
           AND numero = $6
         FOR UPDATE
      `,
      [idUsuario, documentoId, periodo, gremCod, gremSerie, gremNumero]
    );

    if (normalizarTexto(gremExistente.rows[0]?.vfirmado)) {
      const error = new Error('No se puede editar una GREM enviada a SUNAT.');
      error.statusCode = 409;
      throw error;
    }

    await client.query(
      `
        UPDATE public.mve_transventa
           SET grem_cod = NULL,
               grem_serie = NULL,
               grem_numero = NULL,
               grem_cdr_descripcion = NULL,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($7, ctrl_mod_us)
         WHERE id_usuario = $1
           AND documento_id = $2
           AND periodo = $3
           AND grem_cod = $4
           AND grem_serie = $5
           AND grem_numero = $6
           AND COALESCE(grem_vfirmado, '') = ''
      `,
      [idUsuario, documentoId, periodo, gremCod, gremSerie, gremNumero, usuarioAuditoria]
    );

    await client.query(
      `
        INSERT INTO public.mve_transgrem AS grem_head (
          id_usuario,
          documento_id,
          periodo,
          cod,
          serie,
          numero,
          fecha_emision,
          hora_emision,
          fecha_traslado,
          guia_motivo_id,
          guia_modalidad_id,
          partida_ubigeo,
          partida_direccion,
          llegada_ubigeo,
          llegada_direccion,
          peso_total,
          conductor_dni,
          conductor_nombres,
          conductor_apellidos,
          conductor_licencia,
          vehiculo_placa,
          destinatario_tipo,
          destinatario_ruc_dni,
          destinatario_razon_social,
          vfirmado,
          glosa,
          ctrl_crea,
          ctrl_crea_us,
          ctrl_mod,
          ctrl_mod_us,
          ref_cod,
          ref_serie,
          ref_numero,
          libre
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          NULLIF($7, '')::date,
          NULLIF($8, '')::time,
          NULLIF($9, '')::date,
          $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26,
          CURRENT_TIMESTAMP, $27, CURRENT_TIMESTAMP, $27,
          $28, $29, $30, $31
        )
        ON CONFLICT (id_usuario, documento_id, periodo, cod, serie, numero)
        DO UPDATE SET
          fecha_emision = EXCLUDED.fecha_emision,
          hora_emision = EXCLUDED.hora_emision,
          fecha_traslado = EXCLUDED.fecha_traslado,
          guia_motivo_id = EXCLUDED.guia_motivo_id,
          guia_modalidad_id = EXCLUDED.guia_modalidad_id,
          partida_ubigeo = EXCLUDED.partida_ubigeo,
          partida_direccion = EXCLUDED.partida_direccion,
          llegada_ubigeo = EXCLUDED.llegada_ubigeo,
          llegada_direccion = EXCLUDED.llegada_direccion,
          peso_total = EXCLUDED.peso_total,
          conductor_dni = EXCLUDED.conductor_dni,
          conductor_nombres = EXCLUDED.conductor_nombres,
          conductor_apellidos = EXCLUDED.conductor_apellidos,
          conductor_licencia = EXCLUDED.conductor_licencia,
          vehiculo_placa = EXCLUDED.vehiculo_placa,
          destinatario_tipo = EXCLUDED.destinatario_tipo,
          destinatario_ruc_dni = EXCLUDED.destinatario_ruc_dni,
          destinatario_razon_social = EXCLUDED.destinatario_razon_social,
          vfirmado = COALESCE(EXCLUDED.vfirmado, grem_head.vfirmado),
          glosa = EXCLUDED.glosa,
          ctrl_mod = CURRENT_TIMESTAMP,
          ctrl_mod_us = EXCLUDED.ctrl_mod_us,
          ref_cod = EXCLUDED.ref_cod,
          ref_serie = EXCLUDED.ref_serie,
          ref_numero = EXCLUDED.ref_numero,
          libre = EXCLUDED.libre
      `,
      [
        idUsuario,
        documentoId,
        periodo,
        gremCod,
        gremSerie,
        gremNumero,
        guia.fecha_emision || null,
        guia.hora_emision || null,
        guia.fecha_traslado || null,
        guia.motivo_traslado_id || null,
        guia.modalidad_traslado_id || null,
        guia.partida_ubigeo || null,
        guia.partida_direccion || null,
        guia.llegada_ubigeo || null,
        guia.llegada_direccion || null,
        toNumber(guia.peso_total, 0),
        guia.conductor_documento_id || null,
        guia.conductor_nombres || null,
        guia.conductor_apellidos || null,
        guia.conductor_licencia || null,
        guia.transportista_placa_numero || null,
        guardarDestinatarioCabecera ? primerDetalle.destinatario?.tipo_documento || null : null,
        guardarDestinatarioCabecera ? primerDetalle.destinatario?.numero_documento || null : null,
        guardarDestinatarioCabecera ? primerDetalle.destinatario?.razon_social || null : null,
        grem.codigo_hash || null,
        (grem.respuesta_sunat_descripcion || guia.observacion || '').substring(0, 400),
        usuarioAuditoria,
        primerDetalle.documento_relacionado?.tipo_documento || null,
        primerDetalle.documento_relacionado?.serie || null,
        primerDetalle.documento_relacionado?.numero || null,
        null,
      ]
    );

    await client.query(
      `
        DELETE FROM public.mve_transgremdet
         WHERE id_usuario = $1
           AND documento_id = $2
           AND periodo = $3
           AND cod = $4
           AND serie = $5
           AND numero = $6
      `,
      [
        idUsuario,
        documentoId,
        periodo,
        gremCod,
        gremSerie,
        gremNumero,
      ]
    );

    for (const [index, item] of encomiendas.entries()) {
      const detalle = detalles[index] || {};
      await client.query(
        `
          INSERT INTO public.mve_transgremdet (
            id_usuario,
            documento_id,
            periodo,
            cod,
            serie,
            numero,
            item,
            cantidad,
            descripcion,
            id_producto,
            cont_und,
            monto_flete,
            r_periodo,
            r_cod,
            r_serie,
            r_numero,
            ctrl_crea,
            ctrl_crea_us,
            ctrl_mod,
            ctrl_mod_us
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11,
            $12, $13, $14, $15, $16,
            CURRENT_TIMESTAMP, $17, CURRENT_TIMESTAMP, $17
          )
        `,
        [
          idUsuario,
          documentoId,
          periodo,
          gremCod,
          gremSerie,
          gremNumero,
          detalle.item || index + 1,
          toNumber(detalle.cantidad, 1),
          (detalle.descripcion || 'ENCOMIENDA').substring(0, 300),
          detalle.id_producto || null,
          detalle.unidad_medida || null,
          toNumber(detalle.monto_flete ?? item.r_monto_total ?? item.precio_neto, 0),
          periodo,
          item.r_cod,
          item.r_serie,
          item.r_numero,
          usuarioAuditoria,
        ]
      );
    }

    const params = [
      periodo,
      idUsuario,
      documentoId,
      gremCod,
      gremSerie,
      gremNumero,
      grem.codigo_hash || null,
      (grem.respuesta_sunat_descripcion || '').substring(0, 250),
      usuarioAuditoria,
    ];

    const condiciones = encomiendas.map((item) => {
      params.push(item.r_cod, item.r_serie, item.r_numero, item.elemento);
      const base = params.length - 3;
      return `(r_cod = $${base} AND r_serie = $${base + 1} AND r_numero = $${base + 2} AND elemento = $${base + 3})`;
    });

    await client.query(
      `
        UPDATE mve_transventa
           SET grem_cod = $4,
               grem_serie = $5,
               grem_numero = $6,
               grem_vfirmado = COALESCE($7, grem_vfirmado),
               grem_cdr_descripcion = $8,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($9, ctrl_mod_us)
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND (${condiciones.join(' OR ')})
      `,
      params
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const generarGremSunatTransporte = async (req, res) => {
  const periodo = normalizarTexto(req.body.periodo || req.body.p_periodo);
  const idUsuario = normalizarTexto(req.body.id_usuario || req.body.id_anfitrion || req.body.p_id_usuario);
  const documentoId = normalizarTexto(req.body.documento_id || req.body.p_documento_id);
  const encomiendas = normalizarEncomiendasGrem(req.body);

  try {
    const payload = await generarPayloadGremTransporte({
      periodo,
      idUsuario,
      documentoId,
      guia: req.body.guia || {},
      encomiendas,
    });

    if (!payload.guia.numero) {
      payload.guia.numero = await generarNumeroGremTransporte({
        idUsuario,
        documentoId,
        periodo,
        serie: normalizarSerieGremTransporte(payload.guia.serie),
      });
    }
    normalizarPayloadGremSunat(payload);
    const horaEmisionGrem = validarHoraEmisionGremSunat(payload);

    console.log('Payload GRE Transportista SUNAT:', {
      guia: `${payload.guia.codigo}-${payload.guia.serie}-${payload.guia.numero}`,
      fecha_emision: payload.guia.fecha_emision,
      hora_emision: horaEmisionGrem,
      fecha_traslado: payload.guia.fecha_traslado,
    });

    if (req.body.solo_payload) {
      return res.status(200).json({ success: true, payload });
    }

    const apiResponse = await fetch(`${SUNAT_API_BASE_URL}/gretranssunat`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      timeout: 90000,
    });
    const responseData = await leerRespuestaSunat(apiResponse);
    const dataSunat = responseData?.data || responseData;

    if (!apiResponse.ok) {
      const errorNormalizado = normalizarErrorSunatTransporte(responseData, 'Error enviando GRE Transportista');
      return res.status(apiResponse.status).json(errorNormalizado);
    }

    const codigoHash = dataSunat.codigo_hash || dataSunat.hash || null;
    const numeroGrem = dataSunat.numero || payload.guia.numero;
    let persistenciaAdvertencia = null;

    try {
      await guardarGremTransporteLocal({
        periodo,
        idUsuario,
        documentoId,
        encomiendas,
        payload,
        grem: {
          codigo: '31',
          serie: dataSunat.serie || payload.guia.serie,
          numero: numeroGrem,
          codigo_hash: codigoHash,
          respuesta_sunat_descripcion: dataSunat.respuesta_sunat_descripcion || dataSunat.mensaje || '',
        },
        ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
      });
    } catch (persistenciaError) {
      try {
        await actualizarGremTransporteEncomiendas({
          periodo,
          idUsuario,
          documentoId,
          encomiendas,
          grem: {
            codigo: '31',
            serie: dataSunat.serie || payload.guia.serie,
            numero: numeroGrem,
            codigo_hash: codigoHash,
            respuesta_sunat_descripcion: dataSunat.respuesta_sunat_descripcion || dataSunat.mensaje || '',
          },
          ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
        });
        persistenciaAdvertencia = ['42P01', '42703'].includes(persistenciaError.code)
          ? 'GRE enviada y marcada en encomiendas, pero falta aplicar las tablas mve_transgrem/mve_transgremdet.'
          : `GRE enviada y marcada en encomiendas, pero no se guardo cabecera/detalle GREM: ${persistenciaError.message}`;
      } catch (fallbackError) {
        persistenciaAdvertencia = fallbackError.code === '42703'
          ? 'GRE enviada, pero faltan columnas grem_* en mve_transventa para guardar la referencia.'
          : `GRE enviada, pero no se pudo guardar referencia local: ${fallbackError.message}`;
      }
    }

    return res.status(200).json({
      success: true,
      titulo_usuario: 'GRE Transportista enviada',
      mensaje_usuario: dataSunat.mensaje_usuario || dataSunat.respuesta_sunat_descripcion || 'GRE Transportista procesada por SUNAT.',
      respuesta_sunat_descripcion: dataSunat.respuesta_sunat_descripcion || dataSunat.mensaje || '',
      ruta_xml: dataSunat.ruta_xml,
      ruta_cdr: dataSunat.ruta_cdr,
      ruta_pdf: dataSunat.ruta_pdf,
      codigo_hash: codigoHash,
      grem_cod: '31',
      grem_serie: dataSunat.serie || payload.guia.serie,
      grem_numero: numeroGrem,
      persistencia_advertencia: persistenciaAdvertencia,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error interno procesando GRE Transportista',
      mensaje_usuario: error.message || 'No se pudo procesar la GRE Transportista.',
    });
  }
};

const generarTicketPDFEncomiendaExpertcont = async (
  req,
  res,
  endpointTicket = TICKET_ENCOMIENDA_ENDPOINT
) => {
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
    elemento,
    p_endpoint_pdf,
    endpoint_pdf,
    endpoint
  } = req.body;

  const periodoFinal = p_periodo || periodo;
  const idUsuarioFinal = p_id_usuario || id_usuario || id_anfitrion;
  const documentoIdFinal = p_documento_id || documento_id;
  const rCodFinal = p_r_cod || r_cod;
  const rSerieFinal = p_r_serie || r_serie;
  const rNumeroFinal = p_r_numero || r_numero;
  const elementoFinal = p_elemento ?? elemento ?? 1;
  const endpointPdfFinal = resolverEndpointTicketEncomienda(
    p_endpoint_pdf || endpoint_pdf || endpoint,
    endpointTicket
  );

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
      message: 'Faltan parametros requeridos para generar ticket de encomienda'
    });
  }

  try {
    const jsonString = await generaJsonTicketEncomiendaExpertcontTransporte(
      periodoFinal,
      idUsuarioFinal,
      documentoIdFinal,
      rCodFinal,
      rSerieFinal,
      rNumeroFinal,
      elementoFinal,
      endpointPdfFinal
    );

    const apiResponse = await fetch(`${SUNAT_API_BASE_URL}${endpointPdfFinal}`, {
      method: 'POST',
      body: jsonString,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await leerRespuestaSunat(apiResponse);

    if (!apiResponse.ok) {
      return res.status(apiResponse.status).json({
        success: false,
        message: responseData.respuesta_sunat_descripcion || responseData.message || 'No se pudo generar el ticket de encomienda',
        ruta_pdf: responseData.ruta_pdf || 'error'
      });
    }

    return res.status(200).json({
      success: true,
      respuesta_sunat_descripcion: responseData.respuesta_sunat_descripcion,
      ruta_pdf: responseData.ruta_pdf
    });
  } catch (error) {
    console.error('Error generando ticket PDF de encomienda:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno generando ticket de encomienda',
      ruta_pdf: 'error'
    });
  }
};

const generarTicketAdminPDFEncomiendaExpertcont = async (req, res) => {
  await generarTicketPDFEncomiendaExpertcont(
    req,
    res,
    TICKET_ENCOMIENDA_ADMIN_ENDPOINT
  );
};

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
         AND COALESCE(estado, 'PENDIENTE') IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'INCIERTO', 'ERROR')
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

const marcarOperacionesRdiSunatTransporte = async ({
  idUsuario,
  documentoId,
  numeroRdi,
  estado = 'PENDIENTE',
  respuestaDesc = null,
  ticket = null,
  ctrlModUs = null,
}) => {
  const estadoNormalizado = normalizarTexto(estado).toUpperCase() || 'PENDIENTE';
  const descripcionBase = estadoNormalizado === 'ACEPTADO'
    ? `Resumen Diario SUNAT ${numeroRdi} aceptado.`
    : estadoNormalizado === 'RECHAZADO'
      ? `Resumen Diario SUNAT ${numeroRdi} rechazado.`
      : `Procesado por Resumen Diario SUNAT ${numeroRdi}.`;
  const descripcion = [
    descripcionBase,
    ticket ? `Ticket: ${ticket}.` : null,
    respuestaDesc || null,
  ].filter(Boolean).join(' ').substring(0, 100);

  await pool.query(
    `
      UPDATE public.mve_transventa
         SET r_vfirmado = COALESCE(r_vfirmado, $4),
             cdr_descripcion = $5,
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($6, ctrl_mod_us)
       WHERE id_usuario = $1
         AND documento_id = $2
         AND numero_rdi = $3
    `,
    [
      idUsuario,
      documentoId,
      numeroRdi,
      `RDI:${numeroRdi}`,
      descripcion,
      ctrlModUs,
    ]
  );
};

const incrementarIntentoRdiSunatTransporte = async ({ idUsuario, documentoId, numeroRdi }) => {
  await pool.query(
    `
      UPDATE public.mve_rdi_sunat
         SET estado = 'GENERADO',
             ctrl_actualiza = CURRENT_TIMESTAMP
       WHERE id_usuario = $1
         AND documento_id = $2
         AND numero_rdi = $3
    `,
    [idUsuario, documentoId, numeroRdi]
  );
};

const generarPayloadResumenSunatTransporteDesdeRdi = async ({
  periodo,
  idUsuario,
  documentoId,
  numeroRdi,
  tipoOperacion,
}) => {
  const datos = await obtenerDatosResumenSunatTransporte(idUsuario, documentoId);
  const rdi = await obtenerRdiSunatTransporte({ idUsuario, documentoId, numeroRdi });

  if (!rdi) {
    throw new Error(`No se encontro el Resumen Diario ${numeroRdi}.`);
  }

  const params = [periodo, idUsuario, documentoId, numeroRdi];
  let query = `
    SELECT tv.*,
           CAST(tv.r_fecemi AS VARCHAR(10)) AS fecha_emision
      FROM public.mve_transventa tv
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.numero_rdi = $4
  `;

  if (tipoOperacion && ['B', 'E'].includes(tipoOperacion)) {
    params.push(tipoOperacion);
    query += ` AND tv.tipo_operacion = $${params.length} `;
  }

  query += ` ORDER BY tv.tipo_operacion, tv.r_serie, tv.r_numero, tv.elemento `;

  const ventaQuery = await pool.query(query, params);

  if (ventaQuery.rows.length === 0) {
    throw new Error(`El Resumen Diario ${numeroRdi} no tiene boletas de transporte asociadas.`);
  }

  const comprobantes = ventaQuery.rows.map((venta) => {
    const total = toNumber(venta.r_monto_total || venta.precio_neto);

    return {
      tipo_documento: venta.r_cod_ref || venta.r_cod,
      serie: venta.r_serie_ref || venta.r_serie,
      numero: venta.r_numero_ref || venta.r_numero,
      cliente_numero_documento: venta.cliente_documento_id || '-',
      cliente_tipo_documento: venta.cliente_id_doc || '0',
      status: Number(venta.registrado) === 0 ? '3' : '1',
      moneda_id: 'PEN',
      total_a_pagar: total,
      total_gravada: toNumber(venta.r_gravado),
      total_exonerada: toNumber(venta.r_exonerado),
      total_inafecta: 0,
      total_gratuita: 0,
      total_igv: toNumber(venta.r_igv),
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

  const [, fechaNumero = toIsoDate(rdi.fecha).replace(/-/g, ''), correlativo = String(rdi.secuencia || 1)] =
    String(numeroRdi).match(/^RC-(\d{8})-(\d+)$/) || [];

  return {
    rdi,
    total_documentos: comprobantes.length,
    payload: {
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
        numero: fechaNumero,
        correlativo: String(correlativo),
        fecha_documentos: toIsoDate(rdi.fecha),
        fecha_resumen: toIsoDate(rdi.fecha),
      },
      comprobantes,
    }
  };
};

const consultarTicketRdiSunatTransporte = async ({
  idUsuario,
  documentoId,
  numeroRdi,
  periodo,
  ctrlModUs = null,
}) => {
  const datos = await obtenerDatosResumenSunatTransporte(idUsuario, documentoId);
  const rdi = await obtenerRdiSunatTransporte({ idUsuario, documentoId, numeroRdi });

  if (!rdi) {
    throw new Error(`No se encontro el Resumen Diario ${numeroRdi}.`);
  }

  if (!rdi.ticket) {
    return {
      success: false,
      numero_rdi: numeroRdi,
      estado: normalizarTexto(rdi.estado).toUpperCase() || 'PENDIENTE',
      mensaje_usuario: `Resumen Diario ${numeroRdi} aun no tiene ticket para consultar.`,
      permite_reintento: true,
    };
  }

  const [, fechaNumero = toIsoDate(rdi.fecha).replace(/-/g, ''), correlativo = String(rdi.secuencia || 1)] =
    String(numeroRdi).match(/^RC-(\d{8})-(\d+)$/) || [];
  const nombreArchivo = `${documentoId}-RC-${fechaNumero}-${correlativo}`;
  const payload = {
    empresa: {
      ruc: datos.documento_id,
      razon_social: datos.razon_social,
      modo: datos.modo,
    },
    ticket: rdi.ticket,
    nombre_archivo: nombreArchivo,
    resumen: {
      numero: fechaNumero,
      correlativo: String(correlativo),
      fecha_documentos: toIsoDate(rdi.fecha),
    }
  };

  const apiResponse = await fetch('https://expertcont-api-sunat.up.railway.app/cpesunatresumen/ticket', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 90000,
  });
  const responseData = await leerRespuestaSunat(apiResponse);

  if (!apiResponse.ok) {
    const errorNormalizado = normalizarErrorResumenSunatTransporte(responseData, 'Error consultando ticket de Resumen Diario');
    await actualizarRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      estado: normalizarTexto(rdi.estado).toUpperCase() || 'ENVIADO',
      respuestaCodigo: errorNormalizado.codigo,
      respuestaDesc: errorNormalizado.respuesta_desc,
    });

    return {
      ...errorNormalizado,
      numero_rdi: numeroRdi,
      ticket: rdi.ticket,
    };
  }

  const dataSunat = responseData?.data || responseData;
  const nivel = dataSunat.nivel || 'PENDIENTE';
  const estadoRdi = nivel === 'ACEPTADO'
    ? 'ACEPTADO'
    : nivel === 'RECHAZADO'
      ? 'RECHAZADO'
      : 'ENVIADO';
  const descripcion = dataSunat.respuesta_sunat_descripcion || dataSunat.mensaje || dataSunat.message || '';

  await actualizarRdiSunatTransporte({
    idUsuario,
    documentoId,
    numeroRdi,
    estado: estadoRdi,
    ticket: dataSunat.ticket || rdi.ticket,
    respuestaCodigo: dataSunat.codigo || null,
    respuestaDesc: descripcion.substring(0, 500),
  });

  await marcarOperacionesRdiSunatTransporte({
    idUsuario,
    documentoId,
    numeroRdi,
    estado: estadoRdi,
    respuestaDesc: descripcion,
    ticket: dataSunat.ticket || rdi.ticket,
    ctrlModUs,
  });

  return {
    success: dataSunat.estado === true || nivel === 'PENDIENTE',
    numero_rdi: numeroRdi,
    estado: estadoRdi,
    nivel,
    codigo: dataSunat.codigo,
    ticket: dataSunat.ticket || rdi.ticket,
    nombre_archivo: dataSunat.nombre_archivo || nombreArchivo,
    ruta_cdr: dataSunat.ruta_cdr,
    respuesta_sunat_descripcion: descripcion,
    mensaje_usuario: nivel === 'PENDIENTE'
      ? `SUNAT aun esta procesando el Resumen Diario ${numeroRdi}.`
      : descripcion,
    periodo,
  };
};

const enviarRdiSunatTransporte = async ({
  periodo,
  idUsuario,
  documentoId,
  numeroRdi,
  tipoOperacion,
  ctrlModUs = null,
}) => {
  const { rdi, payload, total_documentos } = await generarPayloadResumenSunatTransporteDesdeRdi({
    periodo,
    idUsuario,
    documentoId,
    numeroRdi,
    tipoOperacion,
  });

  const estadoActual = normalizarTexto(rdi.estado).toUpperCase();
  if (rdi.ticket) {
    return consultarTicketRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      periodo,
      ctrlModUs,
    });
  }

  if (['ACEPTADO', 'RECHAZADO'].includes(estadoActual)) {
    return {
      success: estadoActual === 'ACEPTADO',
      numero_rdi: numeroRdi,
      estado: estadoActual,
      ticket: rdi.ticket,
      total_documentos,
      mensaje_usuario: `Resumen Diario ${numeroRdi} en estado ${estadoActual}.`,
    };
  }

  const lockKey = `rdi-trans:${idUsuario}:${documentoId}:${numeroRdi}`;
  const lockClient = await pool.connect();
  let lockAcquired = false;

  try {
    const lockResult = await lockClient.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [lockKey]
    );
    lockAcquired = lockResult.rows[0]?.locked === true;

    if (!lockAcquired) {
      return {
        success: false,
        numero_rdi: numeroRdi,
        estado: estadoActual || 'PENDIENTE',
        total_documentos,
        mensaje_usuario: `Resumen Diario ${numeroRdi} ya esta siendo procesado. Espera unos segundos y consulta nuevamente.`,
      };
    }

    await incrementarIntentoRdiSunatTransporte({ idUsuario, documentoId, numeroRdi });

    const apiResponse = await fetch('https://expertcont-api-sunat.up.railway.app/cpesunatresumen', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 90000,
    });
    const responseData = await leerRespuestaSunat(apiResponse);
    const dataSunat = responseData?.data || responseData;

    if (!apiResponse.ok) {
      const errorNormalizado = normalizarErrorResumenSunatTransporte(responseData);
      await actualizarRdiSunatTransporte({
        idUsuario,
        documentoId,
        numeroRdi,
        estado: 'ERROR',
        respuestaCodigo: errorNormalizado.codigo,
        respuestaDesc: errorNormalizado.respuesta_desc,
      });

      return {
        ...errorNormalizado,
        numero_rdi: numeroRdi,
        total_documentos,
      };
    }

    const ticket = dataSunat.ticket || null;
    const estadoRdi = ticket ? 'ENVIADO' : 'ERROR';
    const descripcion = dataSunat.respuesta_sunat_descripcion || dataSunat.mensaje || dataSunat.message || '';

    await actualizarRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      estado: estadoRdi,
    ticket,
    respuestaCodigo: dataSunat.codigo || null,
    respuestaDesc: descripcion.substring(0, 500),
    });

    if (ticket) {
      await marcarOperacionesRdiSunatTransporte({
        idUsuario,
        documentoId,
        numeroRdi,
        estado: 'PENDIENTE',
        respuestaDesc: descripcion,
        ticket,
        ctrlModUs,
      });
    }

    return {
      success: Boolean(ticket),
      numero_rdi: numeroRdi,
      estado: estadoRdi,
      nivel: dataSunat.nivel || 'TICKET',
      ticket,
      nombre_archivo: dataSunat.nombre_archivo || `${documentoId}-${numeroRdi}`,
      total_documentos,
      respuesta_sunat_descripcion: descripcion,
      mensaje_usuario: ticket
        ? `Resumen Diario ${numeroRdi} enviado a SUNAT. Ticket: ${ticket}.`
        : `SUNAT no retorno ticket para el Resumen Diario ${numeroRdi}.`,
      ruta_xml: dataSunat.ruta_xml,
      codigo_hash: dataSunat.codigo_hash,
      payload
    };
  } catch (error) {
    const esRecepcionIncierta = ['request-timeout', 'ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED'].includes(error.type || error.code);
    const estado = esRecepcionIncierta ? 'INCIERTO' : 'ERROR';
    const mensaje = esRecepcionIncierta
      ? 'No se pudo confirmar la recepcion del resumen por SUNAT. Verifica antes de reenviar.'
      : (error.message || 'Error interno procesando Resumen Diario SUNAT.');

    await actualizarRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      estado,
      respuestaCodigo: estado,
      respuestaDesc: mensaje.substring(0, 500),
    });

    return {
      success: false,
      numero_rdi: numeroRdi,
      estado,
      nivel: estado,
      total_documentos,
      mensaje_usuario: mensaje,
      respuesta_sunat_descripcion: mensaje,
      detalle_tecnico: error.message,
      permite_reintento: estado === 'ERROR',
    };
  } finally {
    if (lockAcquired) {
      await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
    }
    lockClient.release();
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
//   Crea o reutiliza cabecera en mve_rdi_sunat usando fve_crear_resumen_diario.
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
//   Si solo_payload=true, responde un JSON de auditoria sin crear/enviar RDI.
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
//   Guarda ticket/estado en mve_rdi_sunat y actualiza los datos CDR del documento.
//
// Paso 8:
//   Responde al frontend con numero_rdi, ticket, estado y payload usado.
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
    solo_payload,
    numero_rdi
  } = req.body;

  const periodoFinal = p_periodo || periodo;
  const idUsuarioFinal = p_id_usuario || id_usuario || id_anfitrion;
  const documentoIdFinal = p_documento_id || documento_id;
  const fechaDocumentosFinal = p_fecha_documentos || fecha_documentos;
  const correlativoFinal = p_correlativo || correlativo || 1;
  const tipoOperacionFinal = ['B', 'E'].includes(String(tipo_operacion || '').trim())
    ? String(tipo_operacion).trim()
    : 'E';
  const origenResumen = tipoOperacionFinal === 'B' ? 'TRANS_BOLETO' : 'TRANS_ENCOMIENDA';
  const numeroRdiSolicitado = normalizarTexto(numero_rdi);

  if (!periodoFinal || !idUsuarioFinal || !documentoIdFinal || !fechaDocumentosFinal) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para enviar resumen de boletas'
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaDocumentosFinal)) {
    return res.status(400).json({
      success: false,
      message: 'fecha_documentos debe tener formato YYYY-MM-DD',
      mensaje_usuario: 'La fecha del resumen debe tener formato YYYY-MM-DD.'
    });
  }

  try {
    if (solo_payload === true || solo_payload === '1') {
      const { payload, operaciones } = await generaJsonResumenCPEexpertcontTransporte({
        periodo: periodoFinal,
        id_usuario: idUsuarioFinal,
        documento_id: documentoIdFinal,
        fecha_documentos: fechaDocumentosFinal,
        correlativo: correlativoFinal,
        id_punto_venta,
        tipo_operacion: tipoOperacionFinal,
      });

      return res.status(200).json({
        success: true,
        payload,
        total_documentos: operaciones.length
      });
    }

    if (numeroRdiSolicitado) {
      const envio = await enviarRdiSunatTransporte({
        periodo: periodoFinal,
        idUsuario: idUsuarioFinal,
        documentoId: documentoIdFinal,
        numeroRdi: numeroRdiSolicitado,
        tipoOperacion: tipoOperacionFinal,
        ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
      });

      return res.status(200).json({
        ...envio,
        creado: false,
        cantidad: Number(envio.total_documentos || 0),
        origen: origenResumen,
        fecha: fechaDocumentosFinal,
        message: envio.mensaje_usuario,
        data: {
          ...envio,
          origen: origenResumen,
          fecha: fechaDocumentosFinal,
        }
      });
    }

    const pendiente = await obtenerPrimerRdiPendienteSunatTransporte({
      idUsuario: idUsuarioFinal,
      documentoId: documentoIdFinal,
      fechaResumen: fechaDocumentosFinal,
      origenResumen,
    });

    if (pendiente) {
      const envioPendiente = await enviarRdiSunatTransporte({
        periodo: periodoFinal,
        idUsuario: idUsuarioFinal,
        documentoId: documentoIdFinal,
        numeroRdi: pendiente.numero_rdi,
        tipoOperacion: tipoOperacionFinal,
        ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
      });

      return res.status(200).json({
        ...envioPendiente,
        creado: false,
        rdi_pendiente_previo: true,
        cantidad: Number(envioPendiente.total_documentos || 0),
        origen: origenResumen,
        fecha: fechaDocumentosFinal,
        message: envioPendiente.mensaje_usuario,
        data: {
          ...pendiente,
          ...envioPendiente,
          origen: origenResumen,
          fecha: fechaDocumentosFinal,
        }
      });
    }

    const result = await pool.query(
      `
        SELECT creado, numero_rdi, secuencia, cantidad, mensaje
        FROM public.fve_crear_resumen_diario($1, $2, $3::date, $4, $5)
      `,
      [
        idUsuarioFinal,
        documentoIdFinal,
        fechaDocumentosFinal,
        origenResumen,
        id_punto_venta || null
      ]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'La funcion fve_crear_resumen_diario no retorno resultado',
        mensaje_usuario: 'No se pudo obtener respuesta al generar el Resumen Diario SUNAT.'
      });
    }

    const resumen = result.rows[0];
    let numeroRdi = resumen.numero_rdi;

    if (!numeroRdi) {
      const existente = await obtenerPrimerRdiPendienteSunatTransporte({
        idUsuario: idUsuarioFinal,
        documentoId: documentoIdFinal,
        fechaResumen: fechaDocumentosFinal,
        origenResumen,
      });

      if (!existente) {
        return res.status(200).json({
          success: false,
          creado: false,
          cantidad: 0,
          origen: origenResumen,
          fecha: fechaDocumentosFinal,
          message: resumen.mensaje || `No hay boletas de transporte pendientes para ${fechaDocumentosFinal}.`,
          mensaje_usuario: resumen.mensaje || `No hay boletas de transporte pendientes para ${fechaDocumentosFinal}.`,
        });
      }

      numeroRdi = existente.numero_rdi;
    }

    const envio = await enviarRdiSunatTransporte({
      periodo: periodoFinal,
      idUsuario: idUsuarioFinal,
      documentoId: documentoIdFinal,
      numeroRdi,
      tipoOperacion: tipoOperacionFinal,
      ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
    });

    return res.status(200).json({
      ...envio,
      creado: resumen.creado === true,
      cantidad: Number(resumen.cantidad || envio.total_documentos || 0),
      origen: origenResumen,
      fecha: fechaDocumentosFinal,
      message: envio.mensaje_usuario || resumen.mensaje,
      data: {
        ...resumen,
        ...envio,
        origen: origenResumen,
        fecha: fechaDocumentosFinal,
      }
    });
  } catch (error) {
    console.error('Error procesando resumen SUNAT de transporte:', error);
    return res.status(500).json(normalizarErrorResumenSunatTransporte(
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
    numero_rdi,
    ticket,
    nombre_archivo,
    periodo,
    fecha_documentos,
    correlativo,
    empresa
  } = req.body;

  const idUsuarioFinal = normalizarTexto(id_usuario || id_anfitrion);
  const documentoIdFinal = normalizarTexto(documento_id);
  const numeroRdiFinal = normalizarTexto(numero_rdi);

  if (numeroRdiFinal) {
    if (!idUsuarioFinal || !documentoIdFinal) {
      return res.status(400).json({
        success: false,
        message: 'Faltan parametros requeridos: id_anfitrion, documento_id o numero_rdi',
        mensaje_usuario: 'Faltan datos para consultar el ticket del Resumen Diario SUNAT.'
      });
    }

    try {
      const resultado = await consultarTicketRdiSunatTransporte({
        idUsuario: idUsuarioFinal,
        documentoId: documentoIdFinal,
        numeroRdi: numeroRdiFinal,
        periodo,
        ctrlModUs: req.body.id_invitado || req.body.ctrl_mod_us || null,
      });

      return res.status(200).json(resultado);
    } catch (error) {
      console.error('Error consultando RDI transporte por numero:', error);
      return res.status(500).json(normalizarErrorResumenSunatTransporte(
        { message: error.message },
        'Error interno consultando el ticket del Resumen Diario SUNAT.'
      ));
    }
  }

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

const obtenerResumenesCPEexpertcontTransporte = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const origenResumen = normalizarTexto(req.query?.origen || 'TRANS_ENCOMIENDA').toUpperCase();

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos: periodo, id_anfitrion o documento_id',
    });
  }

  if (!['TRANS_ENCOMIENDA', 'TRANS_BOLETO'].includes(origenResumen)) {
    return res.status(400).json({
      success: false,
      message: `Origen no reconocido: ${origenResumen}`,
    });
  }

  try {
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
          r.ticket,
          r.respuesta_codigo,
          r.respuesta_desc,
          NULL::varchar AS nombre_archivo,
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
          r.ticket,
          r.respuesta_codigo,
          r.respuesta_desc,
          r.ctrl_insercion,
          r.ctrl_actualiza
        ORDER BY r.fecha DESC, r.secuencia DESC
      `,
      [id_anfitrion, documento_id, periodo, origenResumen]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error al obtener Resumenes Diario SUNAT de transporte:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno obteniendo Resumenes Diario SUNAT de transporte.',
    });
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
  obtenerUsuariosDashboardTransporte,
  obtenerDashboardTransporte,
  listarGremTransporte,
  obtenerUbigeosGremTransporte,
  grabarGremTransporte,
  generarCPEexpertcontTransporte,
  responderPayloadGremTransporte,
  generarGremSunatTransporte,
  generarTicketPDFEncomiendaExpertcont,
  generarTicketAdminPDFEncomiendaExpertcont,
  generarResumenCPEexpertcontTransporte,
  consultarResumenCPEexpertcontTransporte,
  obtenerResumenesCPEexpertcontTransporte
};
