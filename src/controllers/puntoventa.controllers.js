const pool = require('../db');

const columnasPuntoVenta = `
  id_usuario,
  documento_id,
  id_punto_venta,
  nombre,
  direccion,
  ubigeo,
  pais,
  activo,
  ctrl_crea,
  ctrl_crea_us,
  ctrl_mod,
  ctrl_mod_us
`;

const listarPuntosVenta = async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;

  if (!id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener puntos de venta'
    });
  }

  try {
    const result = await pool.query(`
      SELECT ${columnasPuntoVenta}
        FROM mad_punto_venta
       WHERE id_usuario = $1
         AND documento_id = $2
       ORDER BY activo DESC, nombre, id_punto_venta
    `, [id_anfitrion, documento_id]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener puntos de venta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const listarPuntosVentaUsuario = async (req, res) => {
  const { id_anfitrion, documento_id, id_invitado } = req.params;

  if (!id_anfitrion || !documento_id || !id_invitado) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener puntos de venta del usuario'
    });
  }

  try {
    const result = await pool.query(`
      SELECT pv.id_punto_venta,
             pv.nombre
        FROM mad_punto_venta pv
        LEFT JOIN mad_punto_venta_usuario pvu
          ON pv.id_usuario = pvu.id_usuario
         AND pv.documento_id = pvu.documento_id
         AND pv.id_punto_venta = pvu.id_punto_venta
       WHERE pvu.id_usuario = $1
         AND pvu.documento_id = $2
         AND pvu.id_invitado = $3
         AND pvu.activo = TRUE
         AND pvu.sin_restriccion = TRUE
       ORDER BY pv.nombre, pv.id_punto_venta
    `, [id_anfitrion, documento_id, id_invitado]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener puntos de venta del usuario:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const crearPuntoVenta = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    id_punto_venta,
    nombre,
    direccion,
    ubigeo,
    pais,
    activo = true,
    ctrl_crea_us
  } = req.body;

  if (!id_anfitrion || !documento_id || !id_punto_venta || !nombre) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear punto de venta'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO mad_punto_venta (
        id_usuario, documento_id, id_punto_venta,
        nombre, direccion, ubigeo, pais, activo,
        ctrl_crea, ctrl_crea_us
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$9)
      RETURNING ${columnasPuntoVenta}
    `, [
      id_anfitrion,
      documento_id,
      id_punto_venta,
      nombre,
      direccion || null,
      ubigeo || null,
      pais || 'PE',
      activo !== false,
      ctrl_crea_us || null
    ]);

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al crear punto de venta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarPuntoVenta = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    id_punto_venta,
    nombre,
    direccion,
    ubigeo,
    pais,
    activo,
    ctrl_mod_us
  } = req.body;

  if (!id_anfitrion || !documento_id || !id_punto_venta) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar punto de venta'
    });
  }

  try {
    const result = await pool.query(`
      UPDATE mad_punto_venta
         SET nombre = COALESCE($4, nombre),
             direccion = COALESCE($5, direccion),
             ubigeo = COALESCE($6, ubigeo),
             pais = COALESCE($7, pais),
             activo = COALESCE($8::boolean, activo),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($9, ctrl_mod_us)
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_punto_venta = $3
       RETURNING ${columnasPuntoVenta}
    `, [
      id_anfitrion,
      documento_id,
      id_punto_venta,
      nombre || null,
      direccion || null,
      ubigeo || null,
      pais || null,
      activo,
      ctrl_mod_us || null
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Punto de venta no encontrado'
      });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar punto de venta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const eliminarPuntoVenta = async (req, res) => {
  const { id_anfitrion, documento_id, id_punto_venta } = req.params;

  if (!id_anfitrion || !documento_id || !id_punto_venta) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar punto de venta'
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM mad_punto_venta
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_punto_venta = $3
       RETURNING id_punto_venta
    `, [id_anfitrion, documento_id, id_punto_venta]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Punto de venta no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Punto de venta eliminado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar punto de venta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

module.exports = {
  listarPuntosVenta,
  listarPuntosVentaUsuario,
  crearPuntoVenta,
  actualizarPuntoVenta,
  eliminarPuntoVenta
};
