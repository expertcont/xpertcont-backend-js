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
  fact_cod,
  fact_serie,
  fact_num,
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
      SELECT CAST(mv.r_fecemi AS VARCHAR(50)) AS r_fecemi,
             CAST(mv.r_fecvcto AS VARCHAR(50)) AS r_fecvcto,
             mv.r_cod,
             mv.r_serie,
             mv.r_numero,
             mv.elemento,
             mv.r_id_doc,
             mv.r_documento_id,
             mv.r_razon_social,
             mv.r_direccion,
             mv.contacto_nombre,
             mv.contacto_celular,
             mv.glosa,
             mv.r_base001,
             mv.r_base002,
             mv.r_base003,
             mv.r_base004,
             mv.r_igv002,
             mv.r_monto_total,
             mv.r_moneda,
             mv.r_tc,
             mv.r_forma_pago_id,
             COALESCE(mv.fact_cod, mvff.r_cod) AS fact_cod,
             COALESCE(mv.fact_serie, mvff.r_serie) AS fact_serie,
             COALESCE(mv.fact_num, mvff.r_numero) AS fact_num,
             mv.estado,
             mv.registrado,
             mv.ctrl_crea_us,
             mv.ctrl_crea,
             mv.ctrl_mod_us,
             mv.ctrl_mod,
             (mv.r_cod || '-' || mv.r_serie || '-' || mv.r_numero || '-' || mv.elemento)::varchar AS comprobante_key,
             (
               COALESCE(mv.fact_cod, mvff.r_cod) || '-' ||
               COALESCE(mv.fact_serie, mvff.r_serie) || '-' ||
               COALESCE(mv.fact_num, mvff.r_numero) || '-' ||
               COALESCE(mvf.elemento, mvff.elemento, 1)
             )::varchar AS fact_comprobante_key,
             (
               COALESCE(mv.fact_cod, mvff.r_cod) || '-' ||
               COALESCE(mv.fact_serie, mvff.r_serie) || '-' ||
               COALESCE(mv.fact_num, mvff.r_numero)
             )::varchar AS fact_comprobante,
             COALESCE(mvf.elemento, mvff.elemento) AS fact_elemento,
             COALESCE(mvf.r_vfirmado, mvff.r_vfirmado) AS fact_r_vfirmado,
             COALESCE(mvf.cdr_pendiente, mvff.cdr_pendiente) AS fact_cdr_pendiente,
             COALESCE(mvf.cdr_nivel, mvff.cdr_nivel) AS fact_cdr_nivel,
             (
               SELECT COUNT(*)::integer
                 FROM mve_ventaserv ms
                WHERE ms.periodo = mv.periodo
                  AND ms.id_usuario = mv.id_usuario
                  AND ms.documento_id = mv.documento_id
                  AND ms.r_cod = mv.r_cod
                  AND ms.r_serie = mv.r_serie
                 AND ms.r_numero = mv.r_numero
                  AND ms.elemento = mv.elemento
             ) AS servicios_count
        FROM mve_venta mv
        LEFT JOIN mve_venta mvf
          ON mvf.periodo = mv.periodo
         AND mvf.id_usuario = mv.id_usuario
         AND mvf.documento_id = mv.documento_id
         AND mvf.r_cod = mv.fact_cod
         AND mvf.r_serie = mv.fact_serie
         AND mvf.r_numero = mv.fact_num
         AND COALESCE(mvf.registrado, 1) = 1
        LEFT JOIN LATERAL (
          SELECT mvfb.r_cod,
                 mvfb.r_serie,
                 mvfb.r_numero,
                 mvfb.elemento,
                 mvfb.r_vfirmado,
                 mvfb.cdr_pendiente,
                 mvfb.cdr_nivel
            FROM mve_venta mvfb
           WHERE mv.fact_cod IS NULL
             AND mv.fact_serie IS NULL
             AND mv.fact_num IS NULL
             AND mvfb.periodo = mv.periodo
             AND mvfb.id_usuario = mv.id_usuario
             AND mvfb.documento_id = mv.documento_id
             AND mvfb.r_cod <> 'NV'
             AND COALESCE(mvfb.registrado, 1) = 1
             AND COALESCE(mvfb.r_documento_id, '') = COALESCE(mv.r_documento_id, '')
             AND COALESCE(mvfb.r_monto_total, 0)::numeric(14,2) = COALESCE(mv.r_monto_total, 0)::numeric(14,2)
             AND (
               mv.ctrl_mod IS NULL
               OR mvfb.ctrl_crea IS NULL
               OR ABS(EXTRACT(EPOCH FROM (mvfb.ctrl_crea - mv.ctrl_mod))) <= 5
             )
           ORDER BY mvfb.ctrl_crea DESC
           LIMIT 1
        ) mvff ON true
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
      SELECT servicio, descripcion, r_monto_total
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
    r_monto_total,
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
             r_monto_total = COALESCE($18::numeric, r_monto_total),
             r_base002 = CASE
               WHEN $18::numeric IS NOT NULL THEN ROUND($18::numeric / (1 + (COALESCE($16::numeric, porc_igv, 18) / 100)), 2)
               ELSE r_base002
             END,
             r_igv002 = CASE
               WHEN $18::numeric IS NOT NULL THEN ROUND($18::numeric - ROUND($18::numeric / (1 + (COALESCE($16::numeric, porc_igv, 18) / 100)), 2), 2)
               ELSE r_igv002
             END,
             r_fecemi = COALESCE(NULLIF($19, '')::date, r_fecemi),
             r_fecvcto = COALESCE(NULLIF($20, '')::date, NULLIF($19, '')::date, r_fecvcto, r_fecemi),
             r_moneda = COALESCE($21, r_moneda, 'PEN'),
             r_tc = COALESCE($22::numeric, r_tc, 1),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($23, ctrl_mod_us)
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
      r_monto_total,
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

    await pool.query(`
      SELECT fve_ventaserv_rtotales($1, $2, $3, $4, $5, $6, $7)
    `, [
      id_anfitrion,
      documento_id,
      periodo,
      r_cod,
      r_serie,
      r_numero,
      elemento
    ]);

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

const eliminarPresupuesto = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, cod, serie, num, elem } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || !cod || !serie || !num || elem === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar presupuesto'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const presupuestoResult = await client.query(`
      SELECT estado
        FROM mve_venta
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem]);

    if (presupuestoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Presupuesto no encontrado'
      });
    }

    if ((presupuestoResult.rows[0].estado || 'P') !== 'P') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Solo se pueden eliminar presupuestos pendientes'
      });
    }

    await client.query(`
      DELETE FROM mve_ventaservdet
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem]);

    await client.query(`
      DELETE FROM mve_ventaserv
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem]);

    await client.query(`
      DELETE FROM mve_venta
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `, [periodo, id_anfitrion, documento_id, cod, serie, num, elem]);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Presupuesto eliminado correctamente'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar presupuesto:', error);
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

const clonarServicioPresupuesto = async (req, res) => {
  const {
    id_anfitrion,
    id_invitado,
    origen,
    destino
  } = req.body;

  if (
    !id_anfitrion ||
    !id_invitado ||
    !origen ||
    !destino ||
    !origen.documento_id ||
    !origen.periodo ||
    !origen.r_cod ||
    !origen.r_serie ||
    !origen.r_numero ||
    origen.elemento === undefined ||
    origen.servicio === undefined ||
    !destino.documento_id ||
    !destino.periodo ||
    !destino.r_cod ||
    !destino.r_serie ||
    !destino.r_numero ||
    destino.elemento === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para clonar servicio'
    });
  }

  try {
    const result = await pool.query(`
      SELECT success, nuevo_servicio, mensaje
        FROM fve_presupuesto_clonar_trabajo(
          $1,
          $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15
        )
    `, [
      id_anfitrion,
      origen.documento_id,
      origen.periodo,
      origen.r_cod,
      origen.r_serie,
      origen.r_numero,
      origen.elemento,
      origen.servicio,
      destino.documento_id,
      destino.periodo,
      destino.r_cod,
      destino.r_serie,
      destino.r_numero,
      destino.elemento,
      id_invitado
    ]);

    const clonado = result.rows[0];

    if (!clonado?.success) {
      return res.status(400).json({
        success: false,
        message: clonado?.mensaje || 'No se pudo clonar el servicio'
      });
    }

    return res.status(200).json({
      success: true,
      data: clonado
    });
  } catch (error) {
    console.error('Error al clonar servicio de presupuesto:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const generarComprobantePresupuesto = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    periodo,
    id_invitado,
    fecha,
    origen = {},
    destino = {},
    cliente = {},
    pago = {},
    r_cod,
    r_serie,
    r_numero,
    elemento,
    r_cod_emitir,
    r_serie_emitir,
    r_id_doc,
    r_documento_id,
    r_razon_social,
    r_direccion,
    efectivo,
    vuelto,
    forma_pago2,
    efectivo2,
    r_moneda,
    r_forma_pago_id,
    dias_credito,
    id_producto,
    cont_und_default
  } = req.body;

  const origenCod = origen.r_cod || r_cod || 'NV';
  const origenSerie = origen.r_serie || r_serie || '0001';
  const origenNumero = origen.r_numero || r_numero;
  const origenElemento = origen.elemento ?? elemento ?? 1;
  const destinoCod = destino.r_cod_emitir || r_cod_emitir;
  const destinoSerie = destino.r_serie_emitir || r_serie_emitir;

  if (
    !id_anfitrion ||
    !documento_id ||
    !periodo ||
    !id_invitado ||
    !origenCod ||
    !origenSerie ||
    !origenNumero ||
    origenElemento === undefined ||
    !destinoCod ||
    !destinoSerie
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para generar comprobante desde presupuesto'
    });
  }

  try {
    const result = await pool.query(`
      SELECT r_cod, r_serie, r_numero, elemento, r_fecemi, r_monto_total
        FROM fve_presupuesto_generar_comprobante(
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22,
          $23, $24
        )
    `, [
      id_anfitrion,
      documento_id,
      periodo,
      id_invitado,
      normalizarVacio(fecha),
      origenCod,
      origenSerie,
      origenNumero,
      origenElemento,
      destinoCod,
      destinoSerie,
      normalizarVacio(cliente.r_id_doc || r_id_doc),
      normalizarVacio(cliente.r_documento_id || r_documento_id),
      normalizarVacio(cliente.r_razon_social || r_razon_social),
      normalizarVacio(cliente.r_direccion || r_direccion),
      normalizarVacio(pago.efectivo ?? efectivo),
      normalizarVacio(pago.vuelto ?? vuelto ?? 0),
      normalizarVacio(pago.forma_pago2 || forma_pago2),
      normalizarVacio(pago.efectivo2 ?? efectivo2 ?? 0),
      normalizarVacio(pago.r_moneda || r_moneda || 'PEN'),
      normalizarVacio(pago.r_forma_pago_id || r_forma_pago_id || 'Contado'),
      normalizarVacio(pago.dias_credito ?? dias_credito ?? 0),
      normalizarVacio(id_producto || '0000'),
      normalizarVacio(cont_und_default || 'ZZ')
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se pudo generar el comprobante desde el presupuesto.'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
      ...result.rows[0]
    });
  } catch (error) {
    console.error('Error al generar comprobante desde presupuesto:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

module.exports = {
  crearPresupuesto,
  obtenerPresupuestos,
  obtenerPresupuesto,
  obtenerPresupuestoFull,
  actualizarPresupuesto,
  eliminarPresupuesto,
  obtenerServiciosPresupuesto,
  crearServicioPresupuesto,
  actualizarServiciosDatos,
  eliminarServicioPresupuesto,
  obtenerDetallesServicio,
  insertarDetalleServicio,
  actualizarDetalleServicio,
  eliminarDetalleServicio,
  clonarServicioPresupuesto,
  generarComprobantePresupuesto
};
