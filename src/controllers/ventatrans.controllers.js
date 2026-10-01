const pool = require('../db');
const fetch = require('node-fetch');
const { obtenerUltimosPeriodos } = require('../utils/periodos');
const { toIsoDate, toIsoTime, toNumber } = require('../utils/formato');
const { leerRespuestaSunat } = require('../utils/sunat');

const normalizarTexto = (valor) => (valor || '').toString().trim();
const limitarCdrDescripcionTransporte = (valor) => normalizarTexto(valor).substring(0, 100);
const validarTipoOperacion = (tipoOperacion) => ['B', 'E'].includes(tipoOperacion);

const tieneBloqueoSunatTransporte = (operacion = {}) => (
  Boolean(normalizarTexto(operacion.r_vfirmado) || normalizarTexto(operacion.numero_rdi))
);

const mensajeBloqueoSunatTransporte = (operacion = {}) => (
  normalizarTexto(operacion.numero_rdi)
    ? `La encomienda ya fue incluida en el RDI ${operacion.numero_rdi}. No se puede modificar ni eliminar.`
    : 'La encomienda ya fue enviada a SUNAT. No se puede modificar ni eliminar.'
);

const esCortesiaTributariaTransporte = (venta = {}) => (
  toNumber(venta.precio_neto) === 0 || toNumber(venta.registrado, 1) === 0
);

const construirComprobanteResumenTransporte = (venta) => {
  const total = toNumber(venta.r_monto_total || venta.precio_neto);
  const cortesia = esCortesiaTributariaTransporte(venta);

  return {
    tipo_documento: venta.r_cod_ref || venta.r_cod,
    serie: venta.r_serie_ref || venta.r_serie,
    numero: venta.r_numero_ref || venta.r_numero,
    cliente_numero_documento: venta.cliente_documento_id || '-',
    cliente_tipo_documento: venta.cliente_id_doc || '0',
    status: '1',
    moneda_id: 'PEN',
    total_a_pagar: cortesia ? 0 : total,
    total_gravada: cortesia ? 0 : toNumber(venta.r_gravado),
    total_exonerada: cortesia ? 0 : toNumber(venta.r_exonerado),
    total_inafecta: 0,
    total_gratuita: cortesia ? total : 0,
    total_igv: cortesia ? 0 : toNumber(venta.r_igv),
    tipo_operacion: venta.tipo_operacion,
    cortesia_tributaria: cortesia,
    origen: {
      periodo: venta.periodo,
      r_cod: venta.r_cod,
      r_serie: venta.r_serie,
      r_numero: venta.r_numero,
      elemento: venta.elemento,
      registrado: toNumber(venta.registrado, 1),
    }
  };
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

const esRechazoResumenSunatTransporte = (respuesta = {}) => {
  const nivel = normalizarTexto(respuesta.nivel).toUpperCase();
  const codigo = normalizarTexto(respuesta.codigo || respuesta.respuesta_codigo).toUpperCase();
  const descripcion = normalizarTexto(
    respuesta.respuesta_desc
    || respuesta.respuesta_sunat_descripcion
    || respuesta.mensaje_usuario
    || respuesta.message
    || respuesta.detalle_tecnico
  ).toLowerCase();

  return nivel === 'RECHAZADO'
    || codigo === 'RECHAZADO'
    || codigo === '2223'
    || descripcion.includes('documento indicado no existe')
    || descripcion.includes('comprobante a eliminar')
    || descripcion.includes('ya fue enviado')
    || descripcion.includes('ya fue presentado');
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

  const comprobantes = ventaQuery.rows.map(construirComprobanteResumenTransporte);

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
  const marcaRdi = `RDI:${numeroRdi}`;
  const estadoSunat = estadoSunatTransportePorNivel(estadoNormalizado);

  await pool.query(
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
    [
      idUsuario,
      documentoId,
      numeroRdi,
      marcaRdi,
      descripcion,
      ctrlModUs,
      estadoNormalizado,
      estadoSunat,
    ]
  );
};

const incrementarIntentoRdiSunatTransporte = async ({ idUsuario, documentoId, numeroRdi }) => {
  try {
    await pool.query(
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
      [idUsuario, documentoId, numeroRdi]
    );
  } catch (error) {
    if (error.code !== '42703') throw error;

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
  }
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

  const comprobantes = ventaQuery.rows.map(construirComprobanteResumenTransporte);

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
    const estadoRdiError = esRechazoResumenSunatTransporte(errorNormalizado)
      ? 'RECHAZADO'
      : (normalizarTexto(rdi.estado).toUpperCase() || 'ENVIADO');

    await actualizarRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      estado: estadoRdiError,
      respuestaCodigo: errorNormalizado.codigo,
      respuestaDesc: errorNormalizado.respuesta_desc,
    });

    if (estadoRdiError === 'RECHAZADO') {
      await marcarOperacionesRdiSunatTransporte({
        idUsuario,
        documentoId,
        numeroRdi,
        estado: estadoRdiError,
        respuestaDesc: errorNormalizado.respuesta_desc,
        ticket: rdi.ticket,
        ctrlModUs,
      });
    }

    return {
      ...errorNormalizado,
      numero_rdi: numeroRdi,
      estado: estadoRdiError,
      nivel: estadoRdiError,
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

const corregirRdiRechazadoTransporte = async (req, res) => {
  const {
    documento_id,
    id_usuario,
    id_anfitrion,
    numero_rdi,
    ctrl_mod_us,
    id_invitado,
  } = req.body;

  const idUsuarioFinal = normalizarTexto(id_usuario || id_anfitrion);
  const documentoIdFinal = normalizarTexto(documento_id);
  const numeroRdiFinal = normalizarTexto(numero_rdi);
  const ctrlModUsFinal = normalizarTexto(ctrl_mod_us || id_invitado) || null;

  if (!idUsuarioFinal || !documentoIdFinal || !numeroRdiFinal) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para corregir el RDI rechazado',
      mensaje_usuario: 'Faltan datos para preparar la correccion del RDI rechazado.',
    });
  }

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
      [idUsuarioFinal, documentoIdFinal, numeroRdiFinal]
    );
    const rdi = rdiQuery.rows[0];

    if (!rdi) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: `No se encontro el RDI ${numeroRdiFinal}.`,
        mensaje_usuario: `No se encontro el RDI ${numeroRdiFinal}.`,
      });
    }

    const estadoActual = normalizarTexto(rdi.estado).toUpperCase();
    const rechazoDetectado = estadoActual === 'RECHAZADO'
      || esRechazoResumenSunatTransporte({
        nivel: estadoActual,
        codigo: rdi.respuesta_codigo,
        respuesta_desc: rdi.respuesta_desc,
      });

    if (!rechazoDetectado) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'El RDI no esta marcado como rechazo corregible.',
        mensaje_usuario: 'Este RDI no esta marcado como rechazo corregible. Primero consulta el ticket SUNAT para confirmar el estado.',
      });
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
      [idUsuarioFinal, documentoIdFinal, numeroRdiFinal, ctrlModUsFinal]
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
      [idUsuarioFinal, documentoIdFinal, numeroRdiFinal, nota]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      numero_rdi: numeroRdiFinal,
      estado: 'RECHAZADO',
      estado_reproceso: 'REPROCESADO',
      liberados: liberadosQuery.rowCount,
      mensaje_usuario: `${numeroRdiFinal} quedo como rechazado reprocesado y se liberaron ${liberadosQuery.rowCount} comprobante(s). Vuelve a enviar el RDI del dia para generar un nuevo ticket.`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error corrigiendo RDI rechazado de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno corrigiendo RDI rechazado.',
      mensaje_usuario: 'No se pudo preparar la correccion del RDI rechazado.',
    });
  } finally {
    client.release();
  }
};

const obtenerResumenesCPEexpertcontTransporte = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const origenResumen = normalizarTexto(req.query?.origen || 'TRANS_ENCOMIENDA').toUpperCase();
  const tipoOperacionResumen = origenResumen === 'TRANS_BOLETO' ? 'B' : 'E';

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
      [id_anfitrion, documento_id, periodo, origenResumen, tipoOperacionResumen]
    );

    const pendientesResult = await pool.query(
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
        GROUP BY tv.r_fecemi
        ORDER BY tv.r_fecemi ASC
      `,
      [id_anfitrion, documento_id, periodo, tipoOperacionResumen]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      pendientes: pendientesResult.rows,
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
  anularVentaTrans,
  eliminarVentaTrans,
  registrarEntregaEncomienda,
  liberarContraEncomienda,
  registrarLlegadaRealEncomienda,
  generarCPEexpertcontTransporte,
  generarResumenCPEexpertcontTransporte,
  consultarResumenCPEexpertcontTransporte,
  corregirRdiRechazadoTransporte,
  obtenerResumenesCPEexpertcontTransporte
};
