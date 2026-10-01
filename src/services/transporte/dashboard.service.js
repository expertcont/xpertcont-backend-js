// Capa de reglas del Dashboard de Transporte.
//
// Decide permisos, arma los filtros y calcula los indicadores a partir de las
// filas que devuelve el repository. No conoce req ni res, y el repository no
// conoce reglas.
const { obtenerUltimosPeriodos } = require('../../utils/periodos');
const repository = require('../../repositories/transporte/dashboard.repository');

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

// Valida lo minimo para que todas las consultas apunten a una empresa/periodo real.
const validarFiltroDashboardTransporte = ({ periodo, id_anfitrion, documento_id }) => (
  periodo && id_anfitrion && documento_id
);

// Devuelve los puntos de venta vigentes para un invitado convencional.
// Si el usuario no tiene punto activo/turno vigente, el dashboard queda
// sin datos para evitar mezclar caja con otras agencias.
const obtenerPuntosVentaDashboardUsuario = async ({ id_anfitrion, documento_id, id_invitado }) => {
  if (!id_anfitrion || !documento_id || !id_invitado) {
    return [];
  }

  const rows = await repository.obtenerPuntosVentaUsuarioQuery({
    id_anfitrion,
    documento_id,
    id_invitado,
  });

  return rows.map((item) => item.id_punto_venta).filter(Boolean);
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

  const superRows = await repository.esSuperUsuarioQuery(filtro.id_invitado);

  if (superRows.length > 0) {
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

  const rows = await repository.obtenerResumenQuery({
    params,
    filtros,
    filtrosCaja,
    filtroAgenciaOrigen,
    filtroAgenciaDestino,
    filtroMontoTotal,
    filtroEfectivoAgencia,
    filtroPendienteCobroEntrega,
  });

  const row = rows[0] || {};
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

  const rows = await repository.obtenerProductividadQuery({ params, filtros });

  const mayorTotal = rows.reduce((max, item) => {
    const total = Number(item.encomiendas || 0) + Number(item.boletos || 0);
    return Math.max(max, total);
  }, 0);

  return rows.map((item) => {
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

  const rows = await repository.obtenerSunatQuery({ params, filtros });

  return rows.map((item) => ({
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

  const rows = await repository.obtenerRutasQuery({ params, filtros });

  const mayorDocumentos = rows.reduce((max, item) => {
    const total = Number(item.boletos || 0) + Number(item.encomiendas || 0);
    return Math.max(max, total);
  }, 0);

  return rows.map((item) => {
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

  const rows = await repository.obtenerComparativoMensualQuery({
    periodos,
    params,
    puntoVentaParam,
    puntosVentaParam,
    usuarioOperacionParam,
  });

  const rowsPorPeriodo = rows.reduce((acc, item) => {
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

  const rows = await repository.obtenerRecaudacionAgenciasQuery({
    params,
    filtrosVentaOrigen,
    filtrosVentaDestino,
    filtrosFechaCaja,
    filtrosPuntoVenta,
  });

  return rows.map((item) => ({
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

  const rows = await repository.obtenerUsuariosQuery({ params, filtros });

  return rows.map((item) => ({
    id_usuario: item.id_usuario,
    nombre: item.nombre,
    documentos: Number(item.documentos || 0),
    monto_total: Number(item.monto_total || 0),
  }));
};

module.exports = {
  validarFiltroDashboardTransporte,
  obtenerPuntosVentaDashboardUsuario,
  resolverAccesoDashboardTransporte,
  agregarFiltroDashboardTransporte,
  obtenerResumenDashboardTransporteData,
  obtenerProductividadDashboardTransporteData,
  obtenerSunatDashboardTransporteData,
  obtenerRutasDashboardTransporteData,
  obtenerComparativoMensualEncomiendasDashboardTransporteData,
  obtenerRecaudacionAgenciasDashboardTransporteData,
  obtenerUsuariosDashboardTransporteData,
};