const pool = require('../db');
const fetch = require('node-fetch');

const normalizarTexto = (valor) => (valor || '').toString().trim();
const SUNAT_API_BASE_URL = 'https://expertcont-api-sunat.up.railway.app';

const agregarRutasDescargaGrem = (req, rows = []) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  return rows.map((row) => {
    if (!normalizarTexto(row.vfirmado)) {
      return row;
    }

    const ruc = normalizarTexto(row.documento_id);
    const cod = normalizarTexto(row.cod || '31');
    const serie = normalizarTexto(row.serie);
    const numero = normalizarTexto(row.numero);

    if (!ruc || !cod || !serie || !numero) {
      return row;
    }

    const nombre = `${ruc}-${cod}-${serie}-${numero}`;
    const descargasBase = `${baseUrl}/descargas/${ruc}`;

    return {
      ...row,
      ruta_xml: `${descargasBase}/${nombre}.xml`,
      ruta_cdr: `${descargasBase}/R-${nombre}.xml`,
      ruta_pdf: `${descargasBase}/${nombre}.pdf`,
    };
  });
};

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

const tipoDocumentoIdentidadTransporte = (documento, fallback = '1') => {
  const digits = normalizarTexto(documento).replace(/\D/g, '');
  if (digits.length === 11) return '6';
  if (digits.length === 8) return '1';
  return normalizarTexto(fallback) || '1';
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


const normalizarEncomiendasGrem = (body = {}) => {
  /*
   * IMPORTANTE:
   *
   * periodo   = periodo de la cabecera GREM (mve_transgrem)
   * r_periodo = periodo de la encomienda (mve_transventa)
   *
   * Esta función solamente normaliza la referencia hacia
   * mve_transventa.
   */

  const rPeriodoDefault = normalizarTexto(
    body.r_periodo ||
    body.p_r_periodo ||
    body.periodo ||
    body.p_periodo
  );

  /*
   * Puede recibirse:
   *
   * 1. Varias encomiendas:
   *
   * encomiendas: [
   *   {
   *     r_periodo: '2026-09',
   *     r_cod: '03',
   *     r_serie: 'B001',
   *     r_numero: '123',
   *     elemento: 1
   *   }
   * ]
   *
   * 2. Una sola encomienda enviada directamente en body.
   */
  const encomiendas =
    Array.isArray(body.encomiendas) && body.encomiendas.length > 0
      ? body.encomiendas
      : [
          {
            r_periodo: rPeriodoDefault,
            r_cod: body.p_r_cod || body.r_cod,
            r_serie: body.p_r_serie || body.r_serie,
            r_numero: body.p_r_numero || body.r_numero,
            elemento: body.p_elemento || body.elemento || 1,
          },
        ];

  return encomiendas
    .map((item) => ({
      /*
       * Referencia REAL hacia mve_transventa.
       *
       * Si el frontend no manda r_periodo individual,
       * se utiliza el periodo recibido en la petición.
       */
      r_periodo: normalizarTexto(
        item.r_periodo ||
        rPeriodoDefault
      ),

      r_cod: normalizarTexto(item.r_cod),

      r_serie: normalizarTexto(item.r_serie),

      r_numero: normalizarTexto(item.r_numero),

      elemento: Number(item.elemento || 1),
    }))
    .filter(
      (item) =>
        item.r_periodo &&
        item.r_cod &&
        item.r_serie &&
        item.r_numero &&
        Number.isFinite(item.elemento)
    );
};

const obtenerVentasGremTransporte = async ({
  idUsuario,
  documentoId,
  encomiendas,
}) => {
  const params = [
    idUsuario,
    documentoId
  ];

  /*
   * Cada item identifica una encomienda de mve_transventa mediante:
   *
   * r_periodo
   * r_cod
   * r_serie
   * r_numero
   * elemento
   *
   * NO usamos "periodo" para identificar la encomienda.
   */
  const condiciones = encomiendas.map((item) => {
    params.push(
      item.r_periodo,
      item.r_cod,
      item.r_serie,
      item.r_numero,
      item.elemento
    );

    const base = params.length - 4;

    return `(
      tv.periodo = $${base}
      AND tv.r_cod = $${base + 1}
      AND tv.r_serie = $${base + 2}
      AND tv.r_numero = $${base + 3}
      AND tv.elemento = $${base + 4}
    )`;
  });

  const result = await pool.query(
    `
      SELECT
        tv.*,

        ruta.nombre AS nombre_ruta,

        punto_origen.nombre AS punto_venta_nombre,
        punto_origen.direccion AS punto_venta_direccion,
        punto_origen.id_ubigeo AS punto_venta_ubigeo,

        punto_destino.nombre AS punto_venta_dest_nombre,
        punto_destino.direccion AS punto_venta_dest_direccion,
        punto_destino.id_ubigeo AS punto_venta_dest_ubigeo

      FROM public.mve_transventa tv

      LEFT JOIN public.mve_transruta ruta
        ON ruta.id_usuario = tv.id_usuario
       AND ruta.documento_id = tv.documento_id
       AND ruta.id_ruta = tv.id_ruta

      LEFT JOIN public.mad_punto_venta punto_origen
        ON punto_origen.id_usuario = tv.id_usuario
       AND punto_origen.documento_id = tv.documento_id
       AND punto_origen.id_punto_venta = tv.id_punto_venta

      LEFT JOIN public.mad_punto_venta punto_destino
        ON punto_destino.id_usuario = tv.id_usuario
       AND punto_destino.documento_id = tv.documento_id
       AND punto_destino.id_punto_venta = tv.id_punto_venta_dest

      WHERE tv.id_usuario = $1
        AND tv.documento_id = $2
        AND (${condiciones.join(" OR ")})

      ORDER BY
        tv.periodo,
        tv.r_cod,
        tv.r_serie,
        tv.r_numero,
        tv.elemento
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
    ['fecha_emision', 'fecha de emision'],
    ['hora_emision', 'hora de emision'],
    ['fecha_traslado', 'fecha de traslado'],

    ['guia_motivo_id', 'motivo de traslado'],
    ['guia_modalidad_id', 'modalidad de traslado'],

    ['partida_ubigeo', 'ubigeo de partida'],
    ['partida_direccion', 'direccion de partida'],

    ['llegada_ubigeo', 'ubigeo de llegada'],
    ['llegada_direccion', 'direccion de llegada'],

    ['vehiculo_placa', 'placa del vehiculo'],

    ['conductor_dni', 'documento del conductor'],
    ['conductor_nombres', 'nombres del conductor'],
    ['conductor_apellidos', 'apellidos del conductor'],
    ['conductor_licencia', 'licencia del conductor'],
  ];

  const faltantes = requeridos
    .filter(([key]) => !normalizarTexto(guia[key]))
    .map(([, label]) => label);

  /*
   * El peso total sí debe existir y ser mayor a cero.
   */
  if (toNumber(guia.peso_total, 0) <= 0) {
    faltantes.push('peso total');
  }

  /*
   * numero_bultos no existe en mve_transventa.
   *
   * En el payload se calcula actualmente a partir de
   * guia.numero_bultos o de la cantidad de encomiendas.
   */
  if (toNumber(guia.numero_bultos, 0) <= 0) {
    faltantes.push('numero de bultos');
  }

  if (faltantes.length > 0) {
    const error = new Error(
      `Faltan datos minimos para GRE Transportista: ${faltantes.join(', ')}`
    );

    error.statusCode = 400;

    throw error;
  }
};

const validarDetallesGremMinimos = (detalles = []) => {
  if (!Array.isArray(detalles) || detalles.length === 0) {
    const error = new Error(
      'La GRE Transportista debe contener al menos una encomienda'
    );

    error.statusCode = 400;

    throw error;
  }

  const faltantes = [];

  detalles.forEach((detalle, index) => {
    const item = detalle.item || index + 1;

    const documentoLabel = [
      detalle.r_cod,
      detalle.r_serie,
      detalle.r_numero,
    ]
      .filter(Boolean)
      .join('-') || `item ${item}`;

    /*
     * ------------------------------------------------------
     * REFERENCIA A mve_transventa
     * ------------------------------------------------------
     */
    if (!normalizarTexto(detalle.r_periodo)) {
      faltantes.push(
        `${documentoLabel}: periodo de la encomienda`
      );
    }

    if (!normalizarTexto(detalle.r_cod)) {
      faltantes.push(
        `${documentoLabel}: tipo de documento de la encomienda`
      );
    }

    if (!normalizarTexto(detalle.r_serie)) {
      faltantes.push(
        `${documentoLabel}: serie de la encomienda`
      );
    }

    if (!normalizarTexto(detalle.r_numero)) {
      faltantes.push(
        `${documentoLabel}: numero de la encomienda`
      );
    }

    /*
     * ------------------------------------------------------
     * REMITENTE
     * ------------------------------------------------------
     *
     * En mve_transventa el remitente está almacenado como:
     *
     * cliente_id_doc
     * cliente_documento_id
     * cliente
     */
    if (!normalizarTexto(detalle.cliente_id_doc)) {
      faltantes.push(
        `${documentoLabel}: tipo de documento del remitente`
      );
    }

    if (!normalizarTexto(detalle.cliente_documento_id)) {
      faltantes.push(
        `${documentoLabel}: documento de identidad del remitente`
      );
    }

    if (!normalizarTexto(detalle.cliente)) {
      faltantes.push(
        `${documentoLabel}: nombre del remitente`
      );
    }

    /*
     * ------------------------------------------------------
     * DESTINATARIO
     * ------------------------------------------------------
     *
     * En mve_transventa:
     *
     * destinatario_id_doc
     * destinatario_documento_id
     * destinatario
     */
    if (!normalizarTexto(detalle.destinatario_id_doc)) {
      faltantes.push(
        `${documentoLabel}: tipo de documento del destinatario`
      );
    }

    if (!normalizarTexto(detalle.destinatario_documento_id)) {
      faltantes.push(
        `${documentoLabel}: documento de identidad del destinatario`
      );
    }

    if (!normalizarTexto(detalle.destinatario)) {
      faltantes.push(
        `${documentoLabel}: nombre del destinatario`
      );
    }
  });

  if (faltantes.length > 0) {
    const error = new Error(
      `Faltan datos para GRE Transportista: ${faltantes.join('; ')}`
    );

    error.statusCode = 400;

    throw error;
  }
};

const obtenerRemitentesGrem = (ventas = []) => {
  const remitentes = new Map();

  ventas.forEach((venta) => {
    const clienteIdDoc = normalizarTexto(
      venta.cliente_id_doc
    );

    const clienteDocumentoId = normalizarTexto(
      venta.cliente_documento_id
    );

    if (!clienteDocumentoId) return;

    const key = `${clienteIdDoc}-${clienteDocumentoId}`;

    if (!remitentes.has(key)) {
      remitentes.set(key, {
        cliente_id_doc: clienteIdDoc,
        cliente_documento_id: clienteDocumentoId,
        cliente: normalizarTexto(venta.cliente),
      });
    }
  });

  return Array.from(remitentes.values());
};

const normalizarPayloadGremSunat = (payload) => {
  if (!payload?.guia) {
    return payload;
  }

  payload.guia.fecha_emision = toIsoDate(
    payload.guia.fecha_emision
  );

  payload.guia.fecha_traslado = toIsoDate(
    payload.guia.fecha_traslado
  );

  payload.guia.hora_emision = toIsoTime(
    payload.guia.hora_emision
  );

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
          g.id_punto_venta,
          g.id_punto_venta_dest,
          punto_origen.nombre AS partida_agencia_nombre,
          punto_destino.nombre AS llegada_agencia_nombre,
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
        LEFT JOIN public.mad_punto_venta punto_origen
          ON punto_origen.id_usuario = g.id_usuario
         AND punto_origen.documento_id = g.documento_id
         AND punto_origen.id_punto_venta = g.id_punto_venta
        LEFT JOIN public.mad_punto_venta punto_destino
          ON punto_destino.id_usuario = g.id_usuario
         AND punto_destino.documento_id = g.documento_id
         AND punto_destino.id_punto_venta = g.id_punto_venta_dest
        WHERE g.id_usuario = $1
          AND g.documento_id = $2
          AND g.periodo = $3
        GROUP BY
          g.id_usuario,
          g.documento_id,
          g.periodo,
          g.cod,
          g.serie,
          g.numero,
          punto_origen.nombre,
          punto_destino.nombre
        ORDER BY g.fecha_traslado DESC NULLS LAST, g.ctrl_crea DESC NULLS LAST, g.serie DESC, g.numero DESC
      `,
      [id_anfitrion, documento_id, periodo]
    );

    return res.status(200).json({
      success: true,
      data: agregarRutasDescargaGrem(req, result.rows),
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
              NULL::varchar AS id_punto_venta,
              NULL::varchar AS id_punto_venta_dest,
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
          data: agregarRutasDescargaGrem(req, legacyResult.rows),
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
  periodo,          // PERIODO DE LA GREM
  idUsuario,
  documentoId,
  guia = {},
  encomiendas = [],
}) => {
  if (!periodo || !idUsuario || !documentoId) {
    throw new Error(
      'Faltan parametros requeridos para generar GRE Transportista'
    );
  }

  /*
   * ------------------------------------------------------
   * SELECCION DE ENCOMIENDAS
   * ------------------------------------------------------
   *
   * Cada encomienda queda identificada por:
   *
   * r_periodo
   * r_cod
   * r_serie
   * r_numero
   * elemento
   */
  const seleccion = normalizarEncomiendasGrem({
    periodo,
    encomiendas,
  });

  if (seleccion.length === 0) {
    throw new Error(
      'Debe seleccionar al menos una encomienda para la GRE Transportista'
    );
  }

  /*
   * ------------------------------------------------------
   * EMPRESA TRANSPORTISTA
   * ------------------------------------------------------
   */
  const datosQuery = await pool.query(
    `
      SELECT
        documento_id,
        razon_social,
        direccion,
        ubigeo as id_ubigeo
      FROM public.mad_usuariocontabilidad
      WHERE id_usuario = $1
        AND documento_id = $2
      LIMIT 1
    `,
    [idUsuario, documentoId]
  );

  if (datosQuery.rows.length === 0) {
    throw new Error(
      'No se encontraron datos de la empresa transportista'
    );
  }

  const empresaDb = datosQuery.rows[0];

  /*
   * ------------------------------------------------------
   * RECUPERAR mve_transventa
   * ------------------------------------------------------
   */
  const ventas = await obtenerVentasGremTransporte({
    idUsuario,
    documentoId,
    encomiendas: seleccion,
  });

  if (ventas.length === 0) {
    throw new Error(
      'No se encontraron las encomiendas seleccionadas'
    );
  }

  if (ventas.length !== seleccion.length) {
    throw new Error(
      'Una o mas encomiendas seleccionadas no fueron encontradas'
    );
  }

  const primera = ventas[0];

  /*
   * ------------------------------------------------------
   * REMITENTES
   * ------------------------------------------------------
   */
  const remitentes = obtenerRemitentesGrem(ventas);

  const cantidadRemitentes = remitentes.length;

  const resumenMas20Remitentes =
    cantidadRemitentes > 20;

  /*
   * ------------------------------------------------------
   * MODALIDAD DE TRASLADO (catálogo 18 SUNAT)
   * ------------------------------------------------------
   *
   * Si guia.guia_modalidad_id no viene explícito:
   *   - Si hay datos de un transportista tercero (guia.transp_ruc),
   *     asumimos '01' (transporte contratado a un tercero).
   *   - Si no, asumimos '02' (la propia transportista traslada con
   *     vehículo y conductor propios), que es el caso normal de esta
   *     empresa.
   *
   * ⚠️ Verifica el código exacto contra el catálogo 18 de SUNAT antes
   * de confiar en esta heurística a ciegas; si ya lo sabes, mándalo
   * explícito en guia.guia_modalidad_id y esto no se usa.
   */
  const guiaModalidadIdExplicita = normalizarTexto(
    guia.guia_modalidad_id
  );

  const guiaModalidadId =
    guiaModalidadIdExplicita ||
    (normalizarTexto(guia.transp_ruc) ? '01' : '02');

  /*
   * ------------------------------------------------------
   * DETALLE
   * ------------------------------------------------------
   *
   * IMPORTANTE:
   *
   * venta.periodo viene de mve_transventa.
   *
   * En el JSON pasa a llamarse r_periodo porque representa
   * la referencia a la encomienda.
   */
  const detalles = ventas.map((venta, index) => ({
    item: index + 1,

    // referencia mve_transventa
    r_periodo: venta.periodo,
    r_cod: venta.r_cod,
    r_serie: venta.r_serie,
    r_numero: venta.r_numero,
    elemento: venta.elemento,

    r_fecemi: venta.r_fecemi,

    r_cod_ref: venta.r_cod_ref,
    r_serie_ref: venta.r_serie_ref,
    r_numero_ref: venta.r_numero_ref,
    r_fecemi_ref: venta.r_fecemi_ref,

    cliente_id_doc: venta.cliente_id_doc,
    cliente_documento_id: venta.cliente_documento_id,
    cliente: venta.cliente,
    cliente_telefono: venta.cliente_telefono,
    cliente_direccion: venta.cliente_direccion,

    id_ruta: venta.id_ruta,
    descripcion: venta.descripcion,

    id_punto_venta: venta.id_punto_venta,
    id_punto_venta_dest: venta.id_punto_venta_dest,

    placa: venta.placa,
    licencia: venta.licencia,

    destinatario_id_doc: venta.destinatario_id_doc,
    destinatario_documento_id:
      venta.destinatario_documento_id,
    destinatario: venta.destinatario,
    destinatario_telefono:
      venta.destinatario_telefono,
    destinatario_direccion:
      venta.destinatario_direccion,

    precio_neto: venta.precio_neto,
    r_monto_total: venta.r_monto_total,
  }));

  /*
   * ------------------------------------------------------
   * PAYLOAD
   * ------------------------------------------------------
   */
  const payload = {
    rubro: 'TRANS_GREM',

    empresa: {
      documento_id: empresaDb.documento_id,
      razon_social: empresaDb.razon_social,
      direccion: empresaDb.direccion,
      id_ubigeo: empresaDb.id_ubigeo,

      /*
       * Alias con los nombres que espera el generador de XML
       * consolidado (gremresumengeneraxml.js y sus módulos), para
       * que el mismo payload le sirva tanto al armado de PDF (que
       * usa documento_id/direccion) como al armado de XML (que usa
       * ruc/domicilio_fiscal) sin necesidad de un adaptador aparte.
       */
      ruc: empresaDb.documento_id,
      domicilio_fiscal: empresaDb.direccion,

      /*
       * La tabla mad_usuariocontabilidad no trae distrito/provincia/
       * departamento por separado todavía. Si en algún momento se
       * agregan esas columnas al SELECT de arriba, quedan recogidas
       * aquí automáticamente; mientras tanto van vacías (nunca
       * "undefined" literal en el XML).
       */
      distrito: empresaDb.distrito || '',
      provincia: empresaDb.provincia || '',
      departamento: empresaDb.departamento || '',
    },

    guia: {
      cod: '31',

      serie: normalizarSerieGremTransporte(
        guia.serie
      ),

      numero: normalizarTexto(
        guia.numero
      ),

      fecha_emision: toIsoDate(
        guia.fecha_emision || new Date()
      ),

      hora_emision: toIsoTime(
        guia.hora_emision || new Date()
      ),

      fecha_traslado: toIsoDate(
        guia.fecha_traslado
      ),

      guia_motivo_id:
        normalizarTexto(guia.guia_motivo_id) ||
        '13',

      guia_modalidad_id: guiaModalidadId,

      id_punto_venta:
        normalizarTexto(guia.id_punto_venta) ||
        normalizarTexto(guia.partida_agencia_id) ||
        primera.id_punto_venta ||
        '',

      id_punto_venta_dest:
        normalizarTexto(guia.id_punto_venta_dest) ||
        normalizarTexto(guia.llegada_agencia_id) ||
        primera.id_punto_venta_dest ||
        '',

      partida_ubigeo:
        normalizarTexto(guia.partida_ubigeo) ||
        primera.punto_venta_ubigeo ||
        '',

      partida_direccion:
        normalizarTexto(guia.partida_direccion) ||
        primera.punto_venta_direccion ||
        '',

      llegada_ubigeo:
        normalizarTexto(guia.llegada_ubigeo) ||
        primera.punto_venta_dest_ubigeo ||
        '',

      llegada_direccion:
        normalizarTexto(guia.llegada_direccion) ||
        primera.punto_venta_dest_direccion ||
        '',

      /*
       * mve_transventa no tiene actualmente columna peso.
       * Por eso el peso total debe venir de la cabecera GREM.
       */
      peso_total: toNumber(
        guia.peso_total,
        0
      ),

      /*
       * Tampoco existe bultos actualmente en mve_transventa.
       * No inventamos ese campo desde venta.
       */
      numero_bultos: toNumber(
        guia.numero_bultos,
        ventas.length
      ),

      conductor_dni:
        normalizarTexto(guia.conductor_dni),

      conductor_nombres:
        normalizarTexto(guia.conductor_nombres),

      conductor_apellidos:
        normalizarTexto(guia.conductor_apellidos),

      conductor_licencia:
        normalizarTexto(guia.conductor_licencia) ||
        normalizarTexto(guia.licencia) ||
        normalizarTexto(primera.licencia),

      vehiculo_placa:
        normalizarTexto(guia.vehiculo_placa) ||
        normalizarTexto(guia.placa) ||
        normalizarTexto(primera.placa),

      // Solo se usan si guia_modalidad_id resultó '01' (transporte
      // contratado a un tercero). En el caso normal de esta empresa
      // (modalidad '02') quedan vacíos y no se usan.
      transp_ruc: normalizarTexto(guia.transp_ruc),
      transp_razon_social: normalizarTexto(
        guia.transp_razon_social
      ),
      transp_mtc: normalizarTexto(guia.transp_mtc),

      glosa:
        normalizarTexto(
          guia.glosa || guia.observacion
        ),

      /*
       * Agencia destinataria (DeliveryCustomerParty global del XML
       * consolidado). Si no viene explícita, cae en el RUC/razón
       * social de la propia transportista.
       */
      agencia_destino_tipo:
        normalizarTexto(guia.agencia_destino_tipo) ||
        '6',

      agencia_destino_documento_id:
        normalizarTexto(
          guia.agencia_destino_documento_id
        ) || empresaDb.documento_id,

      agencia_destino_nombre: normalizarTexto(
        guia.agencia_destino_nombre
      ),

      /*
       * Campos calculados para decidir qué generador XML usar.
       * NO son columnas de mve_transgrem.
       */
      cantidad_remitentes: cantidadRemitentes,

      resumen_mas_20_remitentes:
        resumenMas20Remitentes,
    },

    detalles,

    /*
     * Alias: el generador de XML consolidado (gremresumengeneraxml.js)
     * espera data.items. Apunta al mismo array que detalles (no es
     * una copia), así el PDF sigue usando "detalles" sin cambios y
     * el XML usa "items" sin necesidad de un paso de adaptación.
     */
    items: detalles,
  };

  validarPayloadGremMinimo(payload.guia);

  return payload;
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
  idUsuario,
  documentoId,
  encomiendas,
  grem,
  ctrlModUs,
}) => {
  if (!Array.isArray(encomiendas) || encomiendas.length === 0) {
    return;
  }

  const params = [
    idUsuario,                                      // $1
    documentoId,                                   // $2

    grem.codigo || '31',                           // $3
    grem.serie,                                    // $4
    grem.numero,                                   // $5

    grem.codigo_hash || null,                      // $6

    (
      grem.respuesta_sunat_descripcion || ''
    ).substring(0, 250),                           // $7

    ctrlModUs || null,                             // $8
  ];

  /*
   * Cada encomienda tiene su propio r_periodo.
   *
   * r_periodo corresponde a:
   *
   *     mve_transventa.periodo
   */
  const condiciones = encomiendas.map((item) => {
    params.push(
      item.r_periodo,
      item.r_cod,
      item.r_serie,
      item.r_numero,
      item.elemento || 1
    );

    const base = params.length - 4;

    return `(
      periodo = $${base}
      AND r_cod = $${base + 1}
      AND r_serie = $${base + 2}
      AND r_numero = $${base + 3}
      AND elemento = $${base + 4}
    )`;
  });

  await pool.query(
    `
      UPDATE public.mve_transventa

      SET grem_cod = $3,
          grem_serie = $4,
          grem_numero = $5,

          grem_vfirmado =
            COALESCE(
              $6,
              grem_vfirmado
            ),

          grem_cdr_descripcion = $7,

          ctrl_mod =
            CURRENT_TIMESTAMP,

          ctrl_mod_us =
            COALESCE(
              $8,
              ctrl_mod_us
            )

      WHERE id_usuario = $1
        AND documento_id = $2

        AND (
          ${condiciones.join(' OR ')}
        )
    `,
    params
  );
};

const guardarGremTransporteLocal = async ({
  periodo,          // periodo de la GREM
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

  const usuarioAuditoria = ctrlModUs || null;

  const gremCod =
    grem.codigo ||
    guia.cod ||
    '31';

  const gremSerie =
    grem.serie ||
    guia.serie;

  const gremNumero =
    grem.numero ||
    guia.numero;

  try {
    await client.query('BEGIN');

    /*
     * ======================================================
     * 1. VERIFICAR SI LA GREM YA FUE ENVIADA
     * ======================================================
     *
     * periodo = periodo de la GREM
     */
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
      [
        idUsuario,
        documentoId,
        periodo,
        gremCod,
        gremSerie,
        gremNumero,
      ]
    );

    if (
      normalizarTexto(
        gremExistente.rows[0]?.vfirmado
      )
    ) {
      const error = new Error(
        'No se puede editar una GREM enviada a SUNAT.'
      );

      error.statusCode = 409;

      throw error;
    }

    /*
     * ======================================================
     * 2. DESVINCULAR ENCOMIENDAS ANTERIORES
     * ======================================================
     *
     * Antes de volver a grabar la GREM quitamos la referencia
     * de las encomiendas que anteriormente pertenecían a ella.
     *
     * IMPORTANTE:
     *
     * NO usamos:
     *
     *     mve_transventa.periodo = periodo GREM
     *
     * porque una encomienda puede pertenecer a otro periodo.
     *
     * La relación correcta está en mve_transgremdet:
     *
     *     d.r_periodo -> mve_transventa.periodo
     *     d.r_cod
     *     d.r_serie
     *     d.r_numero
     */
    await client.query(
      `
        UPDATE public.mve_transventa tv

        SET grem_cod = NULL,
            grem_serie = NULL,
            grem_numero = NULL,
            grem_cdr_descripcion = NULL,
            ctrl_mod = CURRENT_TIMESTAMP,
            ctrl_mod_us = COALESCE($7, tv.ctrl_mod_us)

        FROM public.mve_transgremdet d

        WHERE d.id_usuario = $1
          AND d.documento_id = $2
          AND d.periodo = $3
          AND d.cod = $4
          AND d.serie = $5
          AND d.numero = $6

          AND tv.id_usuario = d.id_usuario
          AND tv.documento_id = d.documento_id

          -- periodo de la encomienda
          AND tv.periodo = d.r_periodo

          AND tv.r_cod = d.r_cod
          AND tv.r_serie = d.r_serie
          AND tv.r_numero = d.r_numero

          -- encomienda normal
          AND tv.elemento = 1

          AND COALESCE(tv.grem_vfirmado, '') = ''
      `,
      [
        idUsuario,
        documentoId,

        // periodo GREM
        periodo,

        gremCod,
        gremSerie,
        gremNumero,

        usuarioAuditoria,
      ]
    );

    /*
     * ======================================================
     * 3. CABECERA mve_transgrem
     * ======================================================
     *
     * periodo = periodo de la GREM
     */
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

          id_punto_venta,
          id_punto_venta_dest,

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
          ref_numero
        )
        VALUES (
          $1,
          $2,
          $3,

          $4,
          $5,
          $6,

          NULLIF($7, '')::date,
          NULLIF($8, '')::time,
          NULLIF($9, '')::date,

          $10,
          $11,

          $12,
          $13,

          $14,
          $15,

          $16,
          $17,

          $18,

          $19,
          $20,
          $21,
          $22,

          $23,

          $24,
          $25,
          $26,

          $27,
          $28,

          CURRENT_TIMESTAMP,
          $29,

          CURRENT_TIMESTAMP,
          $29,

          $30,
          $31,
          $32
        )

        ON CONFLICT (
          id_usuario,
          documento_id,
          periodo,
          cod,
          serie,
          numero
        )

        DO UPDATE SET

          fecha_emision =
            EXCLUDED.fecha_emision,

          hora_emision =
            EXCLUDED.hora_emision,

          fecha_traslado =
            EXCLUDED.fecha_traslado,

          guia_motivo_id =
            EXCLUDED.guia_motivo_id,

          guia_modalidad_id =
            EXCLUDED.guia_modalidad_id,

          id_punto_venta =
            EXCLUDED.id_punto_venta,

          id_punto_venta_dest =
            EXCLUDED.id_punto_venta_dest,

          partida_ubigeo =
            EXCLUDED.partida_ubigeo,

          partida_direccion =
            EXCLUDED.partida_direccion,

          llegada_ubigeo =
            EXCLUDED.llegada_ubigeo,

          llegada_direccion =
            EXCLUDED.llegada_direccion,

          peso_total =
            EXCLUDED.peso_total,

          conductor_dni =
            EXCLUDED.conductor_dni,

          conductor_nombres =
            EXCLUDED.conductor_nombres,

          conductor_apellidos =
            EXCLUDED.conductor_apellidos,

          conductor_licencia =
            EXCLUDED.conductor_licencia,

          vehiculo_placa =
            EXCLUDED.vehiculo_placa,

          destinatario_tipo =
            EXCLUDED.destinatario_tipo,

          destinatario_ruc_dni =
            EXCLUDED.destinatario_ruc_dni,

          destinatario_razon_social =
            EXCLUDED.destinatario_razon_social,

          vfirmado =
            COALESCE(
              EXCLUDED.vfirmado,
              grem_head.vfirmado
            ),

          glosa =
            EXCLUDED.glosa,

          ctrl_mod =
            CURRENT_TIMESTAMP,

          ctrl_mod_us =
            EXCLUDED.ctrl_mod_us,

          ref_cod =
            EXCLUDED.ref_cod,

          ref_serie =
            EXCLUDED.ref_serie,

          ref_numero =
            EXCLUDED.ref_numero
      `,
      [
        idUsuario,                         // $1
        documentoId,                      // $2

        // PERIODO GREM
        periodo,                          // $3

        gremCod,                          // $4
        gremSerie,                        // $5
        gremNumero,                       // $6

        guia.fecha_emision || null,       // $7
        guia.hora_emision || null,        // $8
        guia.fecha_traslado || null,      // $9

        guia.guia_motivo_id || null,      // $10
        guia.guia_modalidad_id || null,   // $11

        guia.id_punto_venta || null,      // $12
        guia.id_punto_venta_dest || null, // $13

        guia.partida_ubigeo || null,      // $14
        guia.partida_direccion || null,   // $15

        guia.llegada_ubigeo || null,      // $16
        guia.llegada_direccion || null,   // $17

        toNumber(
          guia.peso_total,
          0
        ),                                // $18

        guia.conductor_dni || null,       // $19
        guia.conductor_nombres || null,   // $20
        guia.conductor_apellidos || null, // $21
        guia.conductor_licencia || null,  // $22

        guia.vehiculo_placa || null,      // $23

        /*
         * Estos campos existen en mve_transgrem.
         *
         * Para GREM de una sola encomienda podemos guardar
         * el destinatario de esa encomienda en cabecera.
         *
         * Para una GREM consolidada con varios destinatarios
         * se dejan NULL.
         */
        detalles.length === 1
          ? detalles[0].destinatario_id_doc || null
          : null,                         // $24

        detalles.length === 1
          ? detalles[0].destinatario_documento_id || null
          : null,                         // $25

        detalles.length === 1
          ? detalles[0].destinatario || null
          : null,                         // $26

        grem.codigo_hash || null,         // $27

        (
          grem.respuesta_sunat_descripcion ||
          guia.glosa ||
          ''
        ).substring(0, 400),              // $28

        usuarioAuditoria,                 // $29

        /*
         * Referencia de cabecera.
         *
         * Solamente tiene sentido cuando existe una única
         * encomienda.
         */
        detalles.length === 1
          ? detalles[0].r_cod || null
          : null,                         // $30

        detalles.length === 1
          ? detalles[0].r_serie || null
          : null,                         // $31

        detalles.length === 1
          ? detalles[0].r_numero || null
          : null,                         // $32
      ]
    );

    /*
     * ======================================================
     * 4. ELIMINAR DETALLE ANTERIOR
     * ======================================================
     *
     * periodo = periodo GREM
     */
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

        // PERIODO GREM
        periodo,

        gremCod,
        gremSerie,
        gremNumero,
      ]
    );

    /*
     * ======================================================
     * 5. GRABAR DETALLE GREM
     * ======================================================
     *
     * Aquí aparecen LOS DOS PERIODOS:
     *
     * periodo
     *     = periodo de mve_transgrem
     *
     * r_periodo
     *     = periodo de mve_transventa
     */
    for (const [index, detalle] of detalles.entries()) {

      if (!normalizarTexto(detalle.r_periodo)) {
        const error = new Error(
          `Falta r_periodo de la encomienda en item ${
            detalle.item || index + 1
          }`
        );

        error.statusCode = 400;

        throw error;
      }

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
            monto_flete,

            id_producto,
            cont_und,

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
            $1,
            $2,

            $3,

            $4,
            $5,
            $6,
            $7,

            $8,
            $9,
            $10,

            $11,
            $12,

            $13,
            $14,
            $15,
            $16,

            CURRENT_TIMESTAMP,
            $17,

            CURRENT_TIMESTAMP,
            $17
          )
        `,
        [
          idUsuario,                       // $1
          documentoId,                    // $2

          // PERIODO DE LA GREM
          periodo,                        // $3

          gremCod,                        // $4
          gremSerie,                      // $5
          gremNumero,                     // $6

          detalle.item || index + 1,      // $7

          /*
           * mve_transventa actualmente no tiene cantidad
           * de bultos como columna.
           *
           * Cada registro representa una encomienda.
           */
          1,                              // $8

          (
            detalle.descripcion ||
            'ENCOMIENDA'
          ).substring(0, 300),            // $9

          toNumber(
            detalle.r_monto_total ??
            detalle.precio_neto,
            0
          ),                              // $10

          null,                           // $11 id_producto
          null,                           // $12 cont_und

          // PERIODO REAL DE mve_transventa
          detalle.r_periodo,              // $13

          detalle.r_cod,                  // $14
          detalle.r_serie,                // $15
          detalle.r_numero,               // $16

          usuarioAuditoria,               // $17
        ]
      );
    }

    /*
     * ======================================================
     * 6. VINCULAR LAS ENCOMIENDAS CON LA GREM
     * ======================================================
     *
     * Ya NO usamos:
     *
     * WHERE periodo = periodoGrem
     *
     * Cada encomienda se busca por su propio r_periodo.
     */
    const params = [
      idUsuario,                          // $1
      documentoId,                       // $2

      gremCod,                           // $3
      gremSerie,                         // $4
      gremNumero,                        // $5

      grem.codigo_hash || null,           // $6

      (
        grem.respuesta_sunat_descripcion ||
        ''
      ).substring(0, 250),                // $7

      usuarioAuditoria,                   // $8
    ];

    const condiciones = detalles.map((item) => {
      params.push(
        item.r_periodo,
        item.r_cod,
        item.r_serie,
        item.r_numero,
        item.elemento || 1
      );

      const base = params.length - 4;

      return `(
        periodo = $${base}
        AND r_cod = $${base + 1}
        AND r_serie = $${base + 2}
        AND r_numero = $${base + 3}
        AND elemento = $${base + 4}
      )`;
    });

    if (condiciones.length > 0) {
      await client.query(
        `
          UPDATE public.mve_transventa

          SET grem_cod = $3,
              grem_serie = $4,
              grem_numero = $5,

              grem_vfirmado =
                COALESCE(
                  $6,
                  grem_vfirmado
                ),

              grem_cdr_descripcion = $7,

              ctrl_mod =
                CURRENT_TIMESTAMP,

              ctrl_mod_us =
                COALESCE(
                  $8,
                  ctrl_mod_us
                )

          WHERE id_usuario = $1
            AND documento_id = $2

            AND (
              ${condiciones.join(' OR ')}
            )
        `,
        params
      );
    }

    /*
     * ======================================================
     * 7. FINALIZAR TRANSACCION
     * ======================================================
     */
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

    const apiResponse = await fetch(`${SUNAT_API_BASE_URL}/gremsunat/trans`, {
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

const generarGremPdfTransporte = async (req, res) => {
  const periodo = normalizarTexto(req.body.periodo || req.body.p_periodo);
  const idUsuario = normalizarTexto(req.body.id_usuario || req.body.id_anfitrion || req.body.p_id_usuario);
  const documentoId = normalizarTexto(req.body.documento_id || req.body.p_documento_id);
  const encomiendas = normalizarEncomiendasGrem(req.body);
  
  try {
    //console.log('generarPayloadGremTransporte body: ',req.body);
    const payload = await generarPayloadGremTransporte({
      periodo,
      idUsuario,
      documentoId,
      guia: req.body.guia || {},
      encomiendas,
    });

    if (!payload.guia.numero) {
      //console.log('generarNumeroGremTransporte: ',!payload.guia.numero);
      payload.guia.numero = await generarNumeroGremTransporte({
        idUsuario,
        documentoId,
        periodo,
        serie: normalizarSerieGremTransporte(payload.guia.serie),
      });
    }

    normalizarPayloadGremSunat(payload);
    validarHoraEmisionGremSunat(payload);

    //console.log('`${SUNAT_API_BASE_URL}/gremsunat/trans/pdf/a4` ',req.body);
    const apiResponse = await fetch(`${SUNAT_API_BASE_URL}/gremsunat/trans/pdf/a4`, {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        solo_pdf: true,
        generar_pdf: true,
        enviar_sunat: false,
      }),
      headers: { 'Content-Type': 'application/json' },
      timeout: 90000,
    });
    const responseData = await leerRespuestaSunat(apiResponse);
    const dataPdf = responseData?.data || responseData;

    if (!apiResponse.ok) {
      return res.status(apiResponse.status).json({
        success: false,
        message: dataPdf.respuesta_sunat_descripcion || dataPdf.mensaje || dataPdf.message || 'No se pudo generar el PDF de la GRE Transportista',
        mensaje_usuario: dataPdf.mensaje_usuario || dataPdf.respuesta_sunat_descripcion || dataPdf.mensaje || 'No se pudo generar el PDF de la GRE Transportista.',
        ruta_pdf: dataPdf.ruta_pdf || 'error',
      });
    }

    if (!dataPdf.ruta_pdf || dataPdf.ruta_pdf === 'error') {
      return res.status(502).json({
        success: false,
        message: dataPdf.respuesta_sunat_descripcion || dataPdf.mensaje || 'El servicio no devolvio la URL del PDF.',
        mensaje_usuario: dataPdf.mensaje_usuario || dataPdf.respuesta_sunat_descripcion || 'Se genero la solicitud, pero no se recibio la URL del PDF.',
        ruta_pdf: 'error',
      });
    }

    return res.status(200).json({
      success: true,
      titulo_usuario: 'PDF generado',
      mensaje_usuario: dataPdf.mensaje_usuario || dataPdf.respuesta_sunat_descripcion || 'PDF de GRE Transportista generado correctamente.',
      respuesta_sunat_descripcion: dataPdf.respuesta_sunat_descripcion || dataPdf.mensaje || '',
      ruta_pdf: dataPdf.ruta_pdf,
      grem_cod: '31',
      grem_serie: dataPdf.serie || payload.guia.serie,
      grem_numero: dataPdf.numero || payload.guia.numero,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error interno generando PDF de GRE Transportista',
      mensaje_usuario: error.message || 'No se pudo generar el PDF de la GRE Transportista.',
      ruta_pdf: 'error',
    });
  }
};


module.exports = {
  listarGremTransporte,
  obtenerUbigeosGremTransporte,
  grabarGremTransporte,
  responderPayloadGremTransporte,
  generarGremSunatTransporte,
  generarGremPdfTransporte,
};
