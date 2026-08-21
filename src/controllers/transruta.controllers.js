const pool = require('../db');

const columnasRuta = `
  r.id_usuario,
  r.documento_id,
  r.id_ruta,
  r.id_punto_venta,
  r.id_punto_venta_dest,
  r.nombre,
  r.precio_pasaje,
  r.activo,
  r.ctrl_crea,
  r.ctrl_crea_us,
  r.ctrl_mod,
  r.ctrl_mod_us,
  po.nombre AS punto_venta_nombre,
  pd.nombre AS punto_venta_dest_nombre
`;

const listarRutasTransporte = async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;
  const { solo_pasaje } = req.query;

  if (!id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener rutas'
    });
  }

  try {
    const params = [id_anfitrion, documento_id];
    let filtroPasaje = '';

    if (solo_pasaje === 'true') {
      filtroPasaje = ' AND r.precio_pasaje > 0 ';
    }

    const result = await pool.query(`
      SELECT ${columnasRuta}
        FROM mve_transruta r
        LEFT JOIN mad_punto_venta po
          ON po.id_usuario = r.id_usuario
         AND po.documento_id = r.documento_id
         AND po.id_punto_venta = r.id_punto_venta
        LEFT JOIN mad_punto_venta pd
          ON pd.id_usuario = r.id_usuario
         AND pd.documento_id = r.documento_id
         AND pd.id_punto_venta = r.id_punto_venta_dest
       WHERE r.id_usuario = $1
         AND r.documento_id = $2
         ${filtroPasaje}
       ORDER BY r.activo DESC, r.nombre, r.id_ruta
    `, params);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener rutas de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const listarRutasEncomienda = async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;

  if (!id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener rutas de encomienda'
    });
  }

  try {
    const result = await pool.query(`
      SELECT r.id_ruta,
             r.nombre,
             r.id_punto_venta,
             r.id_punto_venta_dest,
             po.nombre AS punto_venta_nombre,
             pd.nombre AS punto_venta_dest_nombre
        FROM mve_transruta r
        LEFT JOIN mad_punto_venta po
          ON po.id_usuario = r.id_usuario
         AND po.documento_id = r.documento_id
         AND po.id_punto_venta = r.id_punto_venta
        LEFT JOIN mad_punto_venta pd
          ON pd.id_usuario = r.id_usuario
         AND pd.documento_id = r.documento_id
         AND pd.id_punto_venta = r.id_punto_venta_dest
       WHERE r.id_usuario = $1
         AND r.documento_id = $2
         AND r.activo = TRUE
       ORDER BY r.nombre, r.id_ruta
    `, [id_anfitrion, documento_id]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener rutas de encomienda:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const crearRutaTransporte = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    id_ruta,
    id_punto_venta,
    id_punto_venta_dest,
    nombre,
    precio_pasaje,
    activo = true,
    ctrl_crea_us
  } = req.body;

  if (!id_anfitrion || !documento_id || !id_ruta || !id_punto_venta || !id_punto_venta_dest || !nombre) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear ruta'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO mve_transruta (
        id_usuario, documento_id, id_ruta,
        id_punto_venta, id_punto_venta_dest,
        nombre, precio_pasaje, activo,
        ctrl_crea, ctrl_crea_us
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$9)
      RETURNING *
    `, [
      id_anfitrion,
      documento_id,
      id_ruta,
      id_punto_venta,
      id_punto_venta_dest,
      nombre,
      precio_pasaje ?? 0,
      activo !== false,
      ctrl_crea_us || null
    ]);

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al crear ruta de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarRutaTransporte = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    id_ruta,
    id_punto_venta,
    id_punto_venta_dest,
    nombre,
    precio_pasaje,
    activo,
    ctrl_mod_us
  } = req.body;

  if (!id_anfitrion || !documento_id || !id_ruta) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar ruta'
    });
  }

  try {
    const result = await pool.query(`
      UPDATE mve_transruta
         SET id_punto_venta = COALESCE($4, id_punto_venta),
             id_punto_venta_dest = COALESCE($5, id_punto_venta_dest),
             nombre = COALESCE($6, nombre),
             precio_pasaje = COALESCE($7::numeric, precio_pasaje),
             activo = COALESCE($8::boolean, activo),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($9, ctrl_mod_us)
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_ruta = $3
       RETURNING *
    `, [
      id_anfitrion,
      documento_id,
      id_ruta,
      id_punto_venta || null,
      id_punto_venta_dest || null,
      nombre || null,
      precio_pasaje,
      activo,
      ctrl_mod_us || null
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ruta no encontrada'
      });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar ruta de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const eliminarRutaTransporte = async (req, res) => {
  const { id_anfitrion, documento_id, id_ruta } = req.params;

  if (!id_anfitrion || !documento_id || !id_ruta) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar ruta'
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM mve_transruta
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_ruta = $3
       RETURNING id_ruta
    `, [id_anfitrion, documento_id, id_ruta]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ruta no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Ruta eliminada correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar ruta de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

module.exports = {
  listarRutasTransporte,
  listarRutasEncomienda,
  crearRutaTransporte,
  actualizarRutaTransporte,
  eliminarRutaTransporte
};
