const pool = require('../db');

const presupuestoCabeceraColumnas = `
  CAST(r_fecemi AS VARCHAR(50)) AS r_fecemi,
  CAST(r_fecvcto AS VARCHAR(50)) AS r_fecvcto,
  r_cod,
  r_serie,
  r_numero,
  elemento,
  r_id_doc,
  r_documento_id,
  r_razon_social,
  r_direccion,
  contacto_nombre,
  contacto_celular,
  glosa,
  r_base001,
  r_base002,
  r_base003,
  r_base004,
  r_igv002,
  r_monto_total,
  r_moneda,
  r_tc,
  r_forma_pago_id,
  estado,
  registrado,
  ctrl_crea_us,
  ctrl_crea,
  ctrl_mod_us,
  ctrl_mod
`;

const detalleServicioColumnas = `
  item,
  CAST(r_fecemi AS VARCHAR(50)) AS r_fecemi,
  id_producto,
  descripcion,
  cantidad,
  precio_unitario,
  monto_base,
  igv,
  precio_neto,
  porc_igv,
  tipo_igv_codigo,
  cont_und,
  largo,
  ancho,
  utilidad,
  horas,
  dias,
  no_kardex,
  registrado
`;

const normalizarVacio = (valor) => (valor === undefined || valor === '' ? null : valor);

const crearPresupuesto = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    periodo,
    id_invitado,
    fecha
  } = req.body;

  if (!id_anfitrion || !documento_id || !periodo || !id_invitado || !fecha) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear presupuesto'
    });
  }

  try {
    const query = `
      SELECT r_numero, r_fecemi, r_monto_total
      FROM fve_crear_presupuesto($1, $2, $3, $4, $5)
    `;

    const params = [
      id_anfitrion,
      documento_id,
      periodo,
      id_invitado,
      fecha
    ];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron resultados o no se pudo crear el presupuesto.'
      });
    }

    const creado = result.rows[0];

    await pool.query(`
      UPDATE mve_venta
         SET r_fecvcto = COALESCE(r_fecvcto, r_fecemi),
             r_id_doc = COALESCE(r_id_doc, '6'),
             r_moneda = COALESCE(r_moneda, 'PEN'),
             r_tc = COALESCE(r_tc, 1),
             estado = COALESCE(estado, 'P')
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = 'NV'
         AND r_serie = '0001'
         AND r_numero = $4
         AND elemento = 1
    `, [periodo, id_anfitrion, documento_id, creado.r_numero]);

    return res.status(200).json({
      success: true,
      r_cod: 'NV',
      r_serie: '0001',
      elemento: 1,
      ...creado,
      r_fecvcto: creado.r_fecemi,
      r_id_doc: '6',
      r_moneda: 'PEN',
      r_tc: '1.000',
      estado: 'P'
    });
  } catch (error) {
    console.error('Error al ejecutar fve_crear_presupuesto:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerPresupuestos = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || dia === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener presupuestos'
    });
  }

  try {
    let query = `
      SELECT ${presupuestoCabeceraColumnas},
             (mv.r_cod || '-' || mv.r_serie || '-' || mv.r_numero || '-' || mv.elemento)::varchar AS comprobante_key,
             COALESCE((
               SELECT json_agg(
                 json_build_object(
                   'servicio', ms.servicio,
                   'descripcion', ms.descripcion,
                   'especificacion', ms.especificacion,
                   'cantidad', ms.cantidad,
                   'precio_unitario', ms.precio_unitario,
                   'precio_neto', ms.precio_neto,
                   'utilidad', ms.utilidad,
                   'r_monto_total', ms.r_monto_total,
                   'detalles_count', COALESCE(det.detalles_count, 0)
                 )
                 ORDER BY ms.servicio
               )
               FROM mve_ventaserv ms
               LEFT JOIN LATERAL (
                 SELECT COUNT(*)::integer AS detalles_count
                   FROM mve_ventaservdet md
                  WHERE md.periodo = ms.periodo
                    AND md.id_usuario = ms.id_usuario
                    AND md.documento_id = ms.documento_id
                    AND md.r_cod = ms.r_cod
                    AND md.r_serie = ms.r_serie
                    AND md.r_numero = ms.r_numero
                    AND md.elemento = ms.elemento
                    AND md.servicio = ms.servicio
               ) det ON TRUE
               WHERE ms.periodo = mv.periodo
                 AND ms.id_usuario = mv.id_usuario
                 AND ms.documento_id = mv.documento_id
                 AND ms.r_cod = mv.r_cod
                 AND ms.r_serie = mv.r_serie
                 AND ms.r_numero = mv.r_numero
                 AND ms.elemento = mv.elemento
             ), '[]'::json) AS servicios
        FROM mve_venta mv
       WHERE mv.periodo = $1
         AND mv.id_usuario = $2
         AND mv.documento_id = $3
         AND mv.r_cod = 'NV'
         AND mv.registrado = 1
    `;

    const params = [periodo, id_anfitrion, documento_id];

    if (dia !== '*') {
      query += ' AND mv.r_fecemi = $4';
      params.push(`${periodo}-${dia}`);
    }

    query += ' ORDER BY mv.r_fecemi DESC, mv.r_serie, mv.r_numero DESC, mv.elemento';

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error al obtener presupuestos:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerPresupuesto = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, cod, serie, num, elem } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || !cod || !serie || !num || elem === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener presupuesto'
    });
  }

  try {
    const query = `
      SELECT ${presupuestoCabeceraColumnas}
        FROM mve_venta
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `;

    const result = await pool.query(query, [
      periodo,
      id_anfitrion,
      documento_id,
      cod,
      serie,
      num,
      elem
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Presupuesto no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al obtener presupuesto:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerPresupuestoFull = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, cod, serie, num, elem } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || !cod || !serie || !num || elem === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener presupuesto completo'
    });
  }

  try {
    const cabeceraResult = await pool.query(`
      SELECT ${presupuestoCabeceraColumnas}
        FROM mve_venta
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem]);

    if (cabeceraResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Presupuesto no encontrado'
      });
    }

    const serviciosResult = await pool.query(`
      SELECT
        servicio,
        origen,
        id_producto,
        descripcion,
        especificacion,
        cont_und,
        cantidad,
        precio_unitario,
        utilidad,
        monto_base,
        igv,
        precio_neto,
        porc_igv,
        r_base001,
        r_base002,
        r_base003,
        r_base004,
        r_igv002,
        r_base_gratuita,
        r_total_gratuito,
        r_monto_total,
        r_moneda,
        r_tc,
        CAST(r_fecemi AS VARCHAR(50)) AS r_fecemi,
        CAST(r_fecvcto AS VARCHAR(50)) AS r_fecvcto,
        registrado
      FROM mve_ventaserv
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
      ORDER BY servicio
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem]);

    const detallesResult = await pool.query(`
      SELECT servicio, ${detalleServicioColumnas}
      FROM mve_ventaservdet
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
      ORDER BY servicio, item
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem]);

    const detallesPorServicio = detallesResult.rows.reduce((acc, detalle) => {
      const key = String(detalle.servicio);
      if (!acc[key]) acc[key] = [];
      const { servicio, ...detalleSinServicio } = detalle;
      acc[key].push(detalleSinServicio);
      return acc;
    }, {});

    const servicios = serviciosResult.rows.map((servicio) => ({
      ...servicio,
      detalles: detallesPorServicio[String(servicio.servicio)] || []
    }));

    return res.status(200).json({
      success: true,
      data: {
        ...cabeceraResult.rows[0],
        servicios
      }
    });
  } catch (error) {
    console.error('Error al obtener presupuesto completo:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarPresupuesto = async (req, res) => {
  const {
    periodo,
    id_anfitrion,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    r_fecemi,
    r_fecvcto,
    r_id_doc,
    r_documento_id,
    r_razon_social,
    r_direccion,
    contacto_nombre,
    contacto_celular,
    glosa,
    r_moneda,
    r_tc,
    r_forma_pago_id,
    estado,
    ctrl_mod_us
  } = req.body;

  if (
    !periodo ||
    !id_anfitrion ||
    !documento_id ||
    !r_cod ||
    !r_serie ||
    !r_numero ||
    elemento === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar presupuesto'
    });
  }

  try {
    const query = `
      UPDATE mve_venta
         SET r_fecemi = COALESCE(NULLIF($8, '')::date, r_fecemi),
             r_fecvcto = COALESCE(NULLIF($9, '')::date, NULLIF($8, '')::date, r_fecvcto, r_fecemi),
             r_id_doc = COALESCE($10, r_id_doc, '6'),
             r_documento_id = COALESCE($11, r_documento_id),
             r_razon_social = COALESCE($12, r_razon_social),
             r_direccion = COALESCE($13, r_direccion),
             contacto_nombre = COALESCE($14, contacto_nombre),
             contacto_celular = COALESCE($15, contacto_celular),
             glosa = COALESCE($16, glosa),
             r_moneda = COALESCE($17, r_moneda, 'PEN'),
             r_tc = COALESCE($18::numeric, r_tc, 1),
             r_forma_pago_id = COALESCE($19, r_forma_pago_id),
             estado = COALESCE($20, estado, 'P'),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($21, ctrl_mod_us)
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
       RETURNING ${presupuestoCabeceraColumnas}
    `;

    const params = [
      periodo,
      id_anfitrion,
      documento_id,
      r_cod,
      r_serie,
      r_numero,
      elemento,
      normalizarVacio(r_fecemi),
      normalizarVacio(r_fecvcto),
      normalizarVacio(r_id_doc),
      normalizarVacio(r_documento_id),
      normalizarVacio(r_razon_social),
      normalizarVacio(r_direccion),
      normalizarVacio(contacto_nombre),
      normalizarVacio(contacto_celular),
      normalizarVacio(glosa),
      normalizarVacio(r_moneda),
      normalizarVacio(r_tc),
      normalizarVacio(r_forma_pago_id),
      normalizarVacio(estado),
      normalizarVacio(ctrl_mod_us)
    ];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Presupuesto no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar presupuesto:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerServiciosPresupuesto = async (req, res) => {
  const {
    periodo,
    id_anfitrion,
    documento_id,
    cod,
    serie,
    num,
    elem
  } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || !cod || !serie || !num || elem === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener servicios'
    });
  }

  try {
    const query = `
      SELECT
        servicio,
        origen,
        id_producto,
        descripcion,
        especificacion,
        cont_und,
        cantidad,
        precio_unitario,
        utilidad,
        monto_base,
        igv,
        precio_neto,
        porc_igv,
        r_base001,
        r_base002,
        r_base003,
        r_base004,
        r_igv002,
        r_base_gratuita,
        r_total_gratuito,
        r_monto_total,
        r_moneda,
        r_tc,
        CAST(r_fecemi AS VARCHAR(50)) AS r_fecemi,
        CAST(r_fecvcto AS VARCHAR(50)) AS r_fecvcto,
        registrado
      FROM mve_ventaserv
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
      ORDER BY servicio
    `;

    const params = [
      periodo,
      id_anfitrion,
      documento_id,
      cod,
      serie,
      num,
      elem
    ];

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error al obtener servicios de presupuesto:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const crearServicioPresupuesto = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    periodo,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    id_invitado,
    fecha
  } = req.body;

  if (
    !id_anfitrion ||
    !documento_id ||
    !periodo ||
    !r_cod ||
    !r_serie ||
    !r_numero ||
    elemento === undefined ||
    !id_invitado ||
    !fecha
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear servicio'
    });
  }

  try {
    const query = `
      SELECT servicio, descripcion, precio_neto
      FROM fve_crear_servicio(
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9
      )
    `;

    const params = [
      id_anfitrion,
      documento_id,
      periodo,
      r_cod,
      r_serie,
      r_numero,
      elemento,
      id_invitado,
      fecha
    ];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se pudo crear el servicio'
      });
    }

    return res.status(200).json({
      success: true,
      ...result.rows[0]
    });
  } catch (error) {
    console.error('Error al ejecutar fve_crear_servicio:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarServiciosDatos = async (req, res) => {
  const {
    periodo,
    id_anfitrion,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    servicio,
    id_producto,
    descripcion,
    especificacion,
    cont_und,
    cantidad,
    precio_unitario,
    precio_neto,
    porc_igv,
    utilidad,
    r_fecemi,
    r_fecvcto,
    r_moneda,
    r_tc,
    ctrl_mod_us
  } = req.body;

  if (
    !periodo ||
    !id_anfitrion ||
    !documento_id ||
    !r_cod ||
    !r_serie ||
    !r_numero ||
    elemento === undefined ||
    servicio === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar cabecera de servicio'
    });
  }

  try {
    const query = `
      UPDATE mve_ventaserv
         SET id_producto = COALESCE($9, id_producto),
             descripcion = COALESCE($10, descripcion),
             especificacion = COALESCE($11, especificacion),
             cont_und = COALESCE($12, cont_und),
             cantidad = COALESCE($13::numeric, cantidad),
             precio_unitario = COALESCE($14::numeric, precio_unitario),
             precio_neto = COALESCE($15::numeric, precio_neto),
             porc_igv = COALESCE($16::numeric, porc_igv),
             utilidad = COALESCE($17::numeric, utilidad),
             r_fecemi = COALESCE(NULLIF($18, '')::date, r_fecemi),
             r_fecvcto = COALESCE(NULLIF($19, '')::date, NULLIF($18, '')::date, r_fecvcto, r_fecemi),
             r_moneda = COALESCE($20, r_moneda, 'PEN'),
             r_tc = COALESCE($21::numeric, r_tc, 1),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($22, ctrl_mod_us)
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND servicio = $8
       RETURNING
         servicio,
         origen,
         id_producto,
         descripcion,
         especificacion,
         cont_und,
         cantidad,
         precio_unitario,
         utilidad,
         monto_base,
         igv,
         precio_neto,
         porc_igv,
         r_base001,
         r_base002,
         r_base003,
         r_base004,
         r_igv002,
         r_base_gratuita,
         r_total_gratuito,
         r_monto_total,
         r_moneda,
         r_tc,
         CAST(r_fecemi AS VARCHAR(50)) AS r_fecemi,
         CAST(r_fecvcto AS VARCHAR(50)) AS r_fecvcto,
         registrado
    `;

    const params = [
      periodo,
      id_anfitrion,
      documento_id,
      r_cod,
      r_serie,
      r_numero,
      elemento,
      servicio,
      id_producto,
      descripcion,
      especificacion,
      cont_und,
      cantidad,
      precio_unitario,
      precio_neto,
      porc_igv,
      utilidad,
      r_fecemi,
      r_fecvcto,
      r_moneda,
      r_tc,
      ctrl_mod_us
    ];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Servicio no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar cabecera de servicio:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerDetallesServicio = async (req, res) => {
  const {
    periodo,
    id_anfitrion,
    documento_id,
    cod,
    serie,
    num,
    elem,
    servicio
  } = req.params;

  if (
    !periodo ||
    !id_anfitrion ||
    !documento_id ||
    !cod ||
    !serie ||
    !num ||
    elem === undefined ||
    servicio === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener detalles del servicio'
    });
  }

  try {
    const query = `
      SELECT
        item,
        CAST(r_fecemi AS VARCHAR(50)) AS r_fecemi,
        id_producto,
        descripcion,
        cantidad,
        precio_unitario,
        monto_base,
        igv,
        precio_neto,
        porc_igv,
        tipo_igv_codigo,
        cont_und,
        largo,
        ancho,
        utilidad,
        horas,
        dias,
        no_kardex,
        registrado
      FROM mve_ventaservdet
      WHERE periodo = $1
        AND id_usuario = $2
        AND documento_id = $3
        AND r_cod = $4
        AND r_serie = $5
        AND r_numero = $6
        AND elemento = $7
        AND servicio = $8
      ORDER BY item
    `;

    const params = [
      periodo,
      id_anfitrion,
      documento_id,
      cod,
      serie,
      num,
      elem,
      servicio
    ];

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error al obtener detalle de servicio:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const insertarDetalleServicio = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    periodo,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    servicio,
    r_fecemi,
    id_producto,
    descripcion,
    cantidad,
    precio_unitario,
    precio_neto,
    porc_igv,
    cont_und,
    largo,
    ancho,
    utilidad,
    horas,
    dias
  } = req.body;

  if (
    !id_anfitrion ||
    !documento_id ||
    !periodo ||
    !r_cod ||
    !r_serie ||
    !r_numero ||
    elemento === undefined ||
    servicio === undefined ||
    !r_fecemi ||
    !descripcion
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para insertar detalle de servicio'
    });
  }

  try {
    const query = `
      SELECT fve_ventaservdet_inserta(
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21
      ) AS success
    `;

    const params = [
      id_anfitrion,
      documento_id,
      periodo,
      r_cod,
      r_serie,
      r_numero,
      elemento,
      servicio,
      r_fecemi,
      id_producto,
      descripcion,
      cantidad,
      precio_unitario,
      precio_neto,
      porc_igv,
      cont_und,
      largo,
      ancho,
      utilidad,
      horas,
      dias
    ];

    const result = await pool.query(query, params);
    const success = result.rows[0]?.success === true;

    if (!success) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo insertar el detalle del servicio'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Detalle de servicio insertado correctamente'
    });
  } catch (error) {
    console.error('Error al ejecutar fve_ventaservdet_inserta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarDetalleServicio = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, cod, serie, num, elem, servicio, item } = req.params;
  const {
    r_fecemi,
    id_producto,
    descripcion,
    cantidad,
    precio_unitario,
    precio_neto,
    porc_igv,
    cont_und,
    largo,
    ancho,
    utilidad,
    horas,
    dias
  } = req.body;

  if (
    !periodo ||
    !id_anfitrion ||
    !documento_id ||
    !cod ||
    !serie ||
    !num ||
    elem === undefined ||
    servicio === undefined ||
    item === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar detalle de servicio'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const query = `
      UPDATE mve_ventaservdet
         SET r_fecemi = COALESCE(NULLIF($9, '')::date, r_fecemi),
             id_producto = COALESCE($10, id_producto),
             descripcion = COALESCE($11, descripcion),
             cantidad = COALESCE($12::numeric, cantidad),
             precio_unitario = COALESCE($13::numeric, precio_unitario),
             precio_neto = COALESCE($14::numeric, precio_neto),
             porc_igv = COALESCE($15::numeric, porc_igv),
             cont_und = COALESCE($16, cont_und),
             largo = COALESCE($17::numeric, largo),
             ancho = COALESCE($18::numeric, ancho),
             utilidad = COALESCE($19::numeric, utilidad),
             horas = COALESCE($20::numeric, horas),
             dias = COALESCE($21::numeric, dias),
             monto_base = CASE
               WHEN COALESCE($15::numeric, porc_igv, 0) > 0 THEN
                 ROUND(
                   (COALESCE($14::numeric, precio_neto, 0) / NULLIF(COALESCE($12::numeric, cantidad, 0), 0))
                   / (1 + (COALESCE($15::numeric, porc_igv, 0) / 100)),
                   6
                 )
               ELSE
                 ROUND(
                   COALESCE($14::numeric, precio_neto, 0) / NULLIF(COALESCE($12::numeric, cantidad, 0), 0),
                   6
                 )
             END,
             igv = CASE
               WHEN COALESCE($15::numeric, porc_igv, 0) > 0 THEN
                 COALESCE($13::numeric, precio_unitario, 0)
                 - ROUND(
                   COALESCE($13::numeric, precio_unitario, 0) / (1 + (COALESCE($15::numeric, porc_igv, 0) / 100)),
                   4
                 )
               ELSE 0
             END,
             tipo_igv_codigo = CASE
               WHEN COALESCE($15::numeric, porc_igv, 0) > 0 THEN '10'
               ELSE '20'
             END
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND servicio = $8
         AND item = $22
       RETURNING ${detalleServicioColumnas}
    `;

    const params = [
      periodo,
      id_anfitrion,
      documento_id,
      cod,
      serie,
      num,
      elem,
      servicio,
      normalizarVacio(r_fecemi),
      normalizarVacio(id_producto),
      normalizarVacio(descripcion),
      normalizarVacio(cantidad),
      normalizarVacio(precio_unitario),
      normalizarVacio(precio_neto),
      normalizarVacio(porc_igv),
      normalizarVacio(cont_und),
      normalizarVacio(largo),
      normalizarVacio(ancho),
      normalizarVacio(utilidad),
      normalizarVacio(horas),
      normalizarVacio(dias),
      item
    ];

    const result = await client.query(query, params);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Detalle de servicio no encontrado'
      });
    }

    const recalcResult = await client.query(`
      SELECT fve_ventaservdet_rtotales($1, $2, $3, $4, $5, $6, $7, $8) AS success
    `, [id_anfitrion, documento_id, periodo, cod, serie, num, elem, servicio]);

    if (recalcResult.rows[0]?.success !== true) {
      throw new Error('No se pudo recalcular totales del servicio');
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar detalle de servicio:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
};

const eliminarDetalleServicio = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, cod, serie, num, elem, servicio, item } = req.params;

  if (
    !periodo ||
    !id_anfitrion ||
    !documento_id ||
    !cod ||
    !serie ||
    !num ||
    elem === undefined ||
    servicio === undefined ||
    item === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar detalle de servicio'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(`
      DELETE FROM mve_ventaservdet
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND servicio = $8
         AND item = $9
       RETURNING item
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem, servicio, item]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Detalle de servicio no encontrado'
      });
    }

    const recalcResult = await client.query(`
      SELECT fve_ventaservdet_rtotales($1, $2, $3, $4, $5, $6, $7, $8) AS success
    `, [id_anfitrion, documento_id, periodo, cod, serie, num, elem, servicio]);

    if (recalcResult.rows[0]?.success !== true) {
      throw new Error('No se pudo recalcular totales del servicio');
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Detalle de servicio eliminado correctamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar detalle de servicio:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
};

const eliminarServicioPresupuesto = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, cod, serie, num, elem, servicio } = req.params;

  if (
    !periodo ||
    !id_anfitrion ||
    !documento_id ||
    !cod ||
    !serie ||
    !num ||
    elem === undefined ||
    servicio === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar servicio'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      DELETE FROM mve_ventaservdet
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND servicio = $8
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem, servicio]);

    const result = await client.query(`
      DELETE FROM mve_ventaserv
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND servicio = $8
       RETURNING servicio
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem, servicio]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Servicio no encontrado'
      });
    }

    const recalcResult = await client.query(`
      SELECT fve_ventaserv_rtotales($1, $2, $3, $4, $5, $6, $7) AS success
    `, [id_anfitrion, documento_id, periodo, cod, serie, num, elem]);

    if (recalcResult.rows[0]?.success !== true) {
      throw new Error('No se pudo recalcular totales del presupuesto');
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Servicio eliminado correctamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar servicio:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
};

module.exports = {
  crearPresupuesto,
  obtenerPresupuestos,
  obtenerPresupuesto,
  obtenerPresupuestoFull,
  actualizarPresupuesto,
  obtenerServiciosPresupuesto,
  crearServicioPresupuesto,
  actualizarServiciosDatos,
  eliminarServicioPresupuesto,
  obtenerDetallesServicio,
  insertarDetalleServicio,
  actualizarDetalleServicio,
  eliminarDetalleServicio
};
