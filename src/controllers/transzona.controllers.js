const pool = require('../db');

const normalizarCodigo = (value) => String(value || '').trim().toUpperCase();

const listarZonasTransporte = async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;

  if (!id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener zonas'
    });
  }

  try {
    const result = await pool.query(`
      SELECT z.id_usuario,
             z.documento_id,
             z.id_punto_venta,
             z.id_zona,
             z.nombre,
             z.descripcion,
             pv.nombre AS punto_venta_nombre
        FROM mve_transzona z
        LEFT JOIN mad_punto_venta pv
          ON pv.id_usuario = z.id_usuario
         AND pv.documento_id = z.documento_id
         AND pv.id_punto_venta = z.id_punto_venta
       WHERE z.id_usuario = $1
         AND z.documento_id = $2
       ORDER BY pv.nombre, z.id_punto_venta, z.nombre, z.id_zona
    `, [id_anfitrion, documento_id]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener zonas de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const crearZonaTransporte = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    id_punto_venta,
    id_zona,
    nombre,
    descripcion
  } = req.body;

  if (!id_anfitrion || !documento_id || !id_punto_venta || !id_zona || !nombre || !descripcion) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear zona'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO mve_transzona (
        id_usuario,
        documento_id,
        id_punto_venta,
        id_zona,
        nombre,
        descripcion
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [
      id_anfitrion,
      documento_id,
      normalizarCodigo(id_punto_venta),
      normalizarCodigo(id_zona),
      nombre,
      descripcion
    ]);

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al crear zona de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarZonaTransporte = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    id_punto_venta,
    id_zona,
    nombre,
    descripcion
  } = req.body;

  if (!id_anfitrion || !documento_id || !id_punto_venta || !id_zona) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar zona'
    });
  }

  try {
    const result = await pool.query(`
      UPDATE mve_transzona
         SET nombre = COALESCE($5, nombre),
             descripcion = COALESCE($6, descripcion)
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_punto_venta = $3
         AND id_zona = $4
       RETURNING *
    `, [
      id_anfitrion,
      documento_id,
      normalizarCodigo(id_punto_venta),
      normalizarCodigo(id_zona),
      nombre || null,
      descripcion || null
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zona no encontrada'
      });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar zona de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const eliminarZonaTransporte = async (req, res) => {
  const { id_anfitrion, documento_id, id_punto_venta, id_zona } = req.params;

  if (!id_anfitrion || !documento_id || !id_punto_venta || !id_zona) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar zona'
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM mve_transzona
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_punto_venta = $3
         AND id_zona = $4
       RETURNING id_punto_venta, id_zona
    `, [
      id_anfitrion,
      documento_id,
      normalizarCodigo(id_punto_venta),
      normalizarCodigo(id_zona)
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zona no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Zona eliminada correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar zona de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

module.exports = {
  listarZonasTransporte,
  crearZonaTransporte,
  actualizarZonaTransporte,
  eliminarZonaTransporte
};
