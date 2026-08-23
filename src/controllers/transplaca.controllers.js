const pool = require('../db');

const listarPlacasTransporte = async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;

  if (!id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener placas'
    });
  }

  try {
    const result = await pool.query(`
      SELECT id_usuario,
             documento_id,
             placa,
             marca,
             certificado
        FROM mve_transplaca
       WHERE id_usuario = $1
         AND documento_id = $2
       ORDER BY placa
    `, [id_anfitrion, documento_id]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener placas de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const crearPlacaTransporte = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    placa,
    marca,
    certificado
  } = req.body;

  if (!id_anfitrion || !documento_id || !placa) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear placa'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO mve_transplaca (
        id_usuario,
        documento_id,
        placa,
        marca,
        certificado
      )
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [
      id_anfitrion,
      documento_id,
      String(placa).trim().toUpperCase(),
      marca || null,
      certificado || null
    ]);

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al crear placa de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarPlacaTransporte = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    placa,
    marca,
    certificado
  } = req.body;

  if (!id_anfitrion || !documento_id || !placa) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar placa'
    });
  }

  try {
    const result = await pool.query(`
      UPDATE mve_transplaca
         SET marca = COALESCE($4, marca),
             certificado = COALESCE($5, certificado)
       WHERE id_usuario = $1
         AND documento_id = $2
         AND placa = $3
       RETURNING *
    `, [
      id_anfitrion,
      documento_id,
      String(placa).trim().toUpperCase(),
      marca || null,
      certificado || null
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Placa no encontrada'
      });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar placa de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const eliminarPlacaTransporte = async (req, res) => {
  const { id_anfitrion, documento_id, placa } = req.params;

  if (!id_anfitrion || !documento_id || !placa) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar placa'
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM mve_transplaca
       WHERE id_usuario = $1
         AND documento_id = $2
         AND placa = $3
       RETURNING placa
    `, [id_anfitrion, documento_id, String(placa).trim().toUpperCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Placa no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Placa eliminada correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar placa de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

module.exports = {
  listarPlacasTransporte,
  crearPlacaTransporte,
  actualizarPlacaTransporte,
  eliminarPlacaTransporte
};
