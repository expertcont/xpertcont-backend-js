const pool = require('../db');

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

    return res.status(200).json({
      success: true,
      r_cod: 'NV',
      r_serie: '0001',
      elemento: 1,
      ...result.rows[0]
    });
  } catch (error) {
    console.error('Error al ejecutar fve_crear_presupuesto:', error);
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
             r_fecemi = COALESCE(NULLIF($13, '')::date, r_fecemi),
             r_fecvcto = COALESCE(NULLIF($14, '')::date, r_fecvcto),
             r_moneda = COALESCE($15, r_moneda),
             r_tc = COALESCE($16::numeric, r_tc),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = $17
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
    cont_und
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
        $9, $10, $11, $12, $13, $14, $15, $16
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
      cont_und
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

module.exports = {
  crearPresupuesto,
  obtenerServiciosPresupuesto,
  crearServicioPresupuesto,
  actualizarServiciosDatos,
  obtenerDetallesServicio,
  insertarDetalleServicio
};
