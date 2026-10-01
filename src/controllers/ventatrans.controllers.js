const pool = require('../db');
const fetch = require('node-fetch');
const { obtenerUltimosPeriodos } = require('../utils/periodos');
const { toIsoDate, toIsoTime, toNumber } = require('../utils/formato');
const { leerRespuestaSunat, normalizarErrorSunatTransporte } = require('../utils/sunat');
const { normalizarTexto } = require('../utils/texto');

const limitarCdrDescripcionTransporte = (valor) => normalizarTexto(valor).substring(0, 100);
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
  COALESCE(precio_chofer, 0) AS precio_chofer,
  porc_igv,
  condicion_pago,
  contra,
  CAST(llegada_aprox AS VARCHAR(50)) AS llegada_aprox,
  TO_CHAR(llegada_real, 'YYYY-MM-DD HH24:MI:SS') AS llegada_real,
  numero_rdi,
  r_vfirmado,
  cdr_descripcion,
  estado_sunat,
  COALESCE(registrado, 1)::integer AS registrado,
  ctrl_crea,
  ctrl_crea_us,
  ctrl_mod,
  ctrl_mod_us
`;

const validarTipoOperacion = (tipoOperacion) => ['B', 'E'].includes(tipoOperacion);
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
  COALESCE(${alias}.precio_chofer, 0) AS precio_chofer,
  ${alias}.porc_igv,
  ${alias}.condicion_pago,
  ${alias}.contra,
  CAST(${alias}.llegada_aprox AS VARCHAR(50)) AS llegada_aprox,
  TO_CHAR(${alias}.llegada_real, 'YYYY-MM-DD HH24:MI:SS') AS llegada_real,
  ${alias}.numero_rdi,
  ${alias}.r_vfirmado,
  ${alias}.cdr_descripcion,
  ${alias}.estado_sunat,
  COALESCE(${alias}.registrado, 1)::integer AS registrado,
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

const tieneBloqueoSunatTransporte = (operacion = {}) => (
  Boolean(normalizarTexto(operacion.r_vfirmado) || normalizarTexto(operacion.numero_rdi))
);

const mensajeBloqueoSunatTransporte = (operacion = {}) => (
  normalizarTexto(operacion.numero_rdi)
    ? `La encomienda ya fue incluida en el RDI ${operacion.numero_rdi}. No se puede modificar ni eliminar.`
    : 'La encomienda ya fue enviada a SUNAT. No se puede modificar ni eliminar.'
);

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
  const fechaEmision = toIsoDate(venta.r_fecemi);
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
      direccion: datos.direccion,
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
      fecha_emision: fechaEmision,
      hora_emision: toIsoTime(venta.ctrl_crea),
      moneda_id: 'PEN',
      forma_pago_id: 'Contado',
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
      const fechaServidor = await obtenerFechaServidorLima();

      if (fechaServidor) {
        dataEncomienda.r_fecemi = fechaServidor;
        dataEncomienda.periodo = fechaServidor.slice(0, 7);
      }

      const result = await pool.query(
        'SELECT public.fve_transventa_grabar_encomienda($1::jsonb) AS data',
        [dataEncomienda]
      );
      let data = result.rows[0]?.data || null;
      const precioChofer = Number(dataEncomienda.precio_chofer || 0);
      const contra = dataEncomienda.contra ?? null;

      if (data && Number.isFinite(precioChofer)) {
        const updateResult = await pool.query(`
          UPDATE mve_transventa
             SET precio_chofer = $8::numeric,
                 contra = $9
           WHERE periodo = $1
             AND id_usuario = $2
             AND documento_id = $3
             AND r_cod = $4
             AND r_serie = $5
             AND r_numero = $6
             AND elemento = $7
           RETURNING ${columnasVentaTrans}
        `, [
          data.periodo || dataEncomienda.periodo,
          data.id_usuario || dataEncomienda.id_usuario || dataEncomienda.id_anfitrion,
          data.documento_id || dataEncomienda.documento_id,
          data.r_cod,
          data.r_serie,
          data.r_numero,
          data.elemento,
          precioChofer,
          contra,
        ]);

        data = updateResult.rows[0] || { ...data, precio_chofer: precioChofer, contra };
      }

      return res.status(200).json({
        success: true,
        data
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
  const estadoListado = normalizarTexto(req.query?.estado || req.query?.registrado).toLowerCase();

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

    if (['anulado', 'anulados', 'anuladas', '0'].includes(estadoListado)) {
      query += ` AND COALESCE(tv.registrado, 1) = 0 `;
    } else if (!['todos', 'all', '*'].includes(estadoListado)) {
      query += ` AND COALESCE(tv.registrado, 1) = 1 `;
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
  const { limit, periodos, estado } = req.query;
  const limite = Math.min(Math.max(Number(limit || 150), 1), 300);
  const cantidadPeriodos = Math.min(Math.max(Number(periodos || 3), 1), 12);
  const listarEntregadas = ['entregadas', 'entregado', 'cerradas'].includes(
    normalizarTexto(estado).toLowerCase()
  );

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
         AND COALESCE(venta.registrado, 1) = 1
         AND venta.entrega_fecha IS ${listarEntregadas ? 'NOT NULL' : 'NULL'}
    `).join(' UNION ALL ');

    const query = `
      SELECT *
        FROM (
          ${selectsPorPeriodo}
        ) encomiendas
       ORDER BY ${listarEntregadas ? 'entrega_fecha DESC,' : ''} r_fecemi DESC, r_serie, r_numero DESC, elemento
       LIMIT $${limiteParam}
    `;

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows,
      meta: {
        periodos: periodosBusqueda,
        cantidad_periodos: cantidadPeriodos,
        estado: listarEntregadas ? 'entregadas' : 'pendientes'
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
    r_gravado, r_exonerado, r_igv, r_monto_total, precio_chofer, porc_igv,
    condicion_pago, llegada_aprox, numero_rdi, estado_sunat, contra,
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
    const operacionActualQuery = await pool.query(`
      SELECT numero_rdi, r_vfirmado
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

    if (operacionActualQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Operacion de transporte no encontrada'
      });
    }

    const operacionActual = operacionActualQuery.rows[0];
    if (tieneBloqueoSunatTransporte(operacionActual)) {
      return res.status(409).json({
        success: false,
        message: mensajeBloqueoSunatTransporte(operacionActual)
      });
    }

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
             precio_chofer = COALESCE($40::numeric, precio_chofer),
             porc_igv = COALESCE($41::numeric, porc_igv),
             condicion_pago = COALESCE($42, condicion_pago),
             llegada_aprox = COALESCE(NULLIF($43, '')::time, llegada_aprox),
             numero_rdi = COALESCE($44, numero_rdi),
             estado_sunat = COALESCE($45, estado_sunat),
             contra = COALESCE($47, contra),
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
      contra
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
    const operacionActualQuery = await pool.query(`
      SELECT numero_rdi, r_vfirmado
        FROM mve_transventa
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `, [
      periodo, id_anfitrion, documento_id,
      cod, serie, num, elem
    ]);

    if (operacionActualQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Operacion de transporte no encontrada'
      });
    }

    const operacionActual = operacionActualQuery.rows[0];
    if (tieneBloqueoSunatTransporte(operacionActual)) {
      return res.status(409).json({
        success: false,
        message: mensajeBloqueoSunatTransporte(operacionActual)
      });
    }

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

const anularVentaTrans = async (req, res) => {
  const {
    periodo, id_anfitrion, documento_id,
    cod, serie, num, elem
  } = req.params;
  const ctrlModUs = normalizarTexto(req.body?.ctrl_mod_us || req.query?.id_invitado);

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !cod || !serie || !num || elem === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para anular operacion de transporte'
    });
  }

  try {
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
      periodo, id_anfitrion, documento_id,
      cod, serie, num, elem, ctrlModUs || null
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
    console.error('Error al anular operacion de transporte:', error);

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
    entrega_documento_id,
    entrega_documento,
    entrega_nombres,
    entrega_ctrl_us,
    entrega_contra
  } = req.body;
  const idUsuarioFinal = id_usuario || id_anfitrion;
  const entregaDocumentoIdFinal = entrega_documento_id || entrega_documento;
  const entregaCtrlUsFinal = entrega_ctrl_us || id_invitado || null;
  const entregaContraFinal = normalizarTexto(entrega_contra).toUpperCase();

  if (
    !periodo || !idUsuarioFinal || !documento_id ||
    !r_cod || !r_serie || !r_numero ||
    elemento === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para registrar entrega'
    });
  }

  try {
    const query = `
      UPDATE mve_transventa
         SET entrega_fecha = (now() AT TIME ZONE 'America/Lima')::timestamp(5),
             entrega_documento_id = COALESCE($8, entrega_documento_id),
             entrega_nombres = COALESCE($9, entrega_nombres),
             entrega_ctrl_us = $10,
             ctrl_mod = (now() AT TIME ZONE 'America/Lima')::timestamp(5),
             ctrl_mod_us = $10
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND tipo_operacion = 'E'
         AND entrega_fecha IS NULL
         AND (COALESCE(contra, '') = '' OR UPPER(contra) = $11)
       RETURNING ${columnasVentaTrans}
    `;

    const result = await pool.query(query, [
      periodo, idUsuarioFinal, documento_id,
      r_cod, r_serie, r_numero, elemento,
      entregaDocumentoIdFinal,
      entrega_nombres, entregaCtrlUsFinal,
      entregaContraFinal
    ]);

    if (result.rows.length === 0) {
      const protegidaQuery = await pool.query(`
        SELECT 1
          FROM mve_transventa
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
           AND tipo_operacion = 'E'
           AND entrega_fecha IS NULL
           AND COALESCE(contra, '') <> ''
         LIMIT 1
      `, [
        periodo, idUsuarioFinal, documento_id,
        r_cod, r_serie, r_numero, elemento,
      ]);

      if (protegidaQuery.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Contraseña de entrega incorrecta'
        });
      }

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

const liberarContraEncomienda = async (req, res) => {
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
    ctrl_mod_us
  } = req.body;

  const idUsuarioFinal = id_usuario || id_anfitrion;
  const idInvitadoFinal = normalizarTexto(id_invitado || ctrl_mod_us);
  const ctrlModUsFinal = normalizarTexto(ctrl_mod_us || id_invitado) || null;

  if (
    !periodo || !idUsuarioFinal || !idInvitadoFinal || !documento_id ||
    !r_cod || !r_serie || !r_numero ||
    elemento === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para liberar la contraseña'
    });
  }

  try {
    const permisoQuery = await pool.query(
      `
        SELECT
          ($1 = $2) AS es_anfitrion,
          EXISTS (
            SELECT 1
              FROM public.mad_usuario mu
             WHERE mu.id_usuario = $2
               AND mu.super = '1'
          ) AS es_super,
          EXISTS (
            SELECT 1
              FROM public.mad_usuarioinvitado ui
             WHERE ui.id_usuario = $1
               AND ui.id_invitado = $2
               AND COALESCE(ui.activo, '1') <> '0'
               AND UPPER(COALESCE(NULLIF(TRIM(ui.supervisor), ''), '0')) IN ('1', 'S', 'SI', 'TRUE')
          ) AS es_supervisor
      `,
      [idUsuarioFinal, idInvitadoFinal]
    );

    const permiso = permisoQuery.rows[0] || {};
    if (!permiso.es_anfitrion && !permiso.es_super && !permiso.es_supervisor) {
      return res.status(403).json({
        success: false,
        message: 'Solo un supervisor puede liberar la contraseña de entrega'
      });
    }

    const result = await pool.query(
      `
        UPDATE mve_transventa
           SET contra = NULL,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($8, ctrl_mod_us)
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
           AND tipo_operacion = 'E'
           AND entrega_fecha IS NULL
           AND COALESCE(contra, '') <> ''
         RETURNING ${columnasVentaTrans}
      `,
      [
        periodo,
        idUsuarioFinal,
        documento_id,
        r_cod,
        r_serie,
        r_numero,
        elemento,
        ctrlModUsFinal
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Encomienda no encontrada, ya entregada o sin contraseña activa'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Contraseña liberada',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al liberar contraseña de encomienda:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const registrarLlegadaRealEncomienda = async (req, res) => {
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
      message: 'Faltan parametros requeridos para registrar llegada real'
    });
  }

  try {
    const query = `
      UPDATE mve_transventa
         SET llegada_real = (now() AT TIME ZONE 'America/Lima')::timestamp(5),
             ctrl_mod = (now() AT TIME ZONE 'America/Lima')::timestamp(5),
             ctrl_mod_us = COALESCE($8, ctrl_mod_us)
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND tipo_operacion = 'E'
         AND llegada_real IS NULL
       RETURNING ${columnasVentaTrans}
    `;

    const result = await pool.query(query, [
      periodo, idUsuarioFinal, documento_id,
      r_cod, r_serie, r_numero, elemento,
      ctrlModUsFinal
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Encomienda no encontrada o ya tiene llegada real registrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al registrar llegada real de encomienda:', error);

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
          limitarCdrDescripcionTransporte(errorNormalizado.respuesta_sunat_descripcion),
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
          limitarCdrDescripcionTransporte(respuesta_sunat_descripcion),
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



module.exports = {
  crearVentaTrans,
  obtenerVentasTrans,
  obtenerVentaTrans,
  clonarEncomienda,
  listarEncomiendasPorEntregar,
  actualizarVentaTrans,
  anularVentaTrans,
  eliminarVentaTrans,
  registrarEntregaEncomienda,
  liberarContraEncomienda,
  registrarLlegadaRealEncomienda,
  generarCPEexpertcontTransporte
};
