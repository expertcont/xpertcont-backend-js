const pool = require('../db');

const normalizarLicencia = (value) => String(value || '').trim().toUpperCase();

const listarLicenciasTransporte = async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;

  if (!id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener licencias'
    });
  }

  try {
    const result = await pool.query(`
      SELECT id_usuario,
             documento_id,
             licencia,
             nombres,
             apellidos,
             TRIM(CONCAT(COALESCE(nombres, ''), ' ', COALESCE(apellidos, ''))) AS nombre,
             dni,
             descripcion
        FROM mve_translicencia
       WHERE id_usuario = $1
         AND documento_id = $2
       ORDER BY apellidos, nombres, licencia
    `, [id_anfitrion, documento_id]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener licencias de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const crearLicenciaTransporte = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    licencia,
    nombres,
    apellidos,
    dni,
    descripcion
  } = req.body;

  if (!id_anfitrion || !documento_id || !licencia) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear licencia'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO mve_translicencia (
        id_usuario,
        documento_id,
        licencia,
        nombres,
        apellidos,
        dni,
        descripcion
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *,
        TRIM(CONCAT(COALESCE(nombres, ''), ' ', COALESCE(apellidos, ''))) AS nombre
    `, [
      id_anfitrion,
      documento_id,
      normalizarLicencia(licencia),
      nombres || null,
      apellidos || null,
      dni || null,
      descripcion || null
    ]);

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al crear licencia de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarLicenciaTransporte = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    licencia,
    nombres,
    apellidos,
    dni,
    descripcion
  } = req.body;

  if (!id_anfitrion || !documento_id || !licencia) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar licencia'
    });
  }

  try {
    const result = await pool.query(`
      UPDATE mve_translicencia
         SET nombres = $4,
             apellidos = $5,
             dni = $6,
             descripcion = $7
       WHERE id_usuario = $1
         AND documento_id = $2
         AND licencia = $3
       RETURNING *,
        TRIM(CONCAT(COALESCE(nombres, ''), ' ', COALESCE(apellidos, ''))) AS nombre
    `, [
      id_anfitrion,
      documento_id,
      normalizarLicencia(licencia),
      nombres || null,
      apellidos || null,
      dni || null,
      descripcion || null
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Licencia no encontrada'
      });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar licencia de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const eliminarLicenciaTransporte = async (req, res) => {
  const { id_anfitrion, documento_id, licencia } = req.params;

  if (!id_anfitrion || !documento_id || !licencia) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar licencia'
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM mve_translicencia
       WHERE id_usuario = $1
         AND documento_id = $2
         AND licencia = $3
       RETURNING licencia
    `, [id_anfitrion, documento_id, normalizarLicencia(licencia)]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Licencia no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Licencia eliminada correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar licencia de transporte:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

module.exports = {
  listarLicenciasTransporte,
  crearLicenciaTransporte,
  actualizarLicenciaTransporte,
  eliminarLicenciaTransporte
};
