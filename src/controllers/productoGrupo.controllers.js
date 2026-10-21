const pool = require('../db');
const { resolverDocumentoId } = require('../utils/libreria.utils');

function responderError(res, error) {
  console.error('Error en mantenimiento de grupos:', error.message);
  return res.status(500).json({ message: 'No se pudo completar la operación de grupos.' });
}

async function contextoGrupo(id_anfitrion, documento_id) {
  const documento = await resolverDocumentoId(pool, id_anfitrion, documento_id);
  const config = await pool.query(`SELECT u.rubro, p.producto_sku
    FROM mad_usuario u LEFT JOIN mve_parametros p
      ON p.id_usuario = u.id_usuario AND p.documento_id = $2
    WHERE u.id_usuario = $1`, [id_anfitrion, documento]);
  const habilitado = String(config.rows[0]?.rubro || '').trim().toUpperCase() === 'COMERCIAL'
    && config.rows[0]?.producto_sku === '1';
  return { documento, habilitado };
}

const obtenerConfiguracionGrupos = async (req, res, next) => {
  try {
    const { id_anfitrion, documento_id } = req.params;
    const { habilitado } = await contextoGrupo(id_anfitrion, documento_id);
    return res.json({ habilitado });
  } catch (error) { return responderError(res, error); }
};

// Restricción exclusiva del nuevo mantenimiento de grupos SKU.
const validarAccesoGrupos = async (req, res, next) => {
  try {
    const id = req.params.id_anfitrion;
    const documento = req.params.documento_id;
    if (!id || !documento) return res.status(400).json({ message: 'Indica el usuario y la empresa.' });
    const contexto = await contextoGrupo(id, documento);
    if (!contexto.habilitado) return res.status(403).json({ message: 'Los grupos requieren rubro comercial y la opción SKU activada.' });
    req.grupoContexto = { id_anfitrion: id, documento: contexto.documento };
    return next();
  } catch (error) {
    return responderError(res, error);
  }
};

const obtenerGrupos = async (req, res, next) => {
  try {
    const { id_anfitrion, documento } = req.grupoContexto;
    const result = await pool.query(`SELECT * FROM mst_producto_grupo
      WHERE id_usuario = $1 AND documento_id = $2 ORDER BY id_grupo`, [id_anfitrion, documento]);
    return res.json(result.rows);
  } catch (error) { return responderError(res, error); }
};

const guardarGrupo = async (req, res, next) => {
  try {
    const { id_anfitrion, documento } = req.grupoContexto;
    const editar = req.method === 'PUT';
    const codigo = String((editar ? req.params.id_grupo : req.body.id_grupo) || '').trim();
    const nombre = String(req.body.nombre || '').trim();
    const descripcion = String(req.body.descripcion || '').trim();
    const usuario = String(req.body.ctrl_mod_us || req.body.ctrl_crea_us || id_anfitrion).trim();
    if (!codigo || codigo.length > 15 || !nombre || nombre.length > 100 || descripcion.length > 300 || usuario.length > 50) {
      return res.status(400).json({ message: 'Completa código (máximo 15), nombre (máximo 100) y descripción (máximo 300 caracteres).' });
    }
    const keys = [id_anfitrion, documento, codigo, nombre.toUpperCase(), descripcion, usuario];
    const result = editar
      ? await pool.query(`UPDATE mst_producto_grupo SET nombre = $4, descripcion = $5,
          ctrl_mod = CURRENT_TIMESTAMP, ctrl_mod_us = $6
          WHERE id_usuario = $1 AND documento_id = $2 AND id_grupo = $3 RETURNING *`, keys)
      : await pool.query(`INSERT INTO mst_producto_grupo
          (id_usuario, documento_id, id_grupo, nombre, descripcion, origen, ctrl_crea, ctrl_crea_us)
          VALUES ($1,$2,$3,$4,$5,'MANUAL',CURRENT_TIMESTAMP,$6) RETURNING *`, keys);
    if (!result.rowCount) return res.status(404).json({ message: 'Grupo de producto no encontrado.' });
    return res.status(editar ? 200 : 201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'El código de grupo ya existe.' });
    return responderError(res, error);
  }
};

const eliminarGrupo = async (req, res, next) => {
  try {
    const { id_anfitrion, documento } = req.grupoContexto;
    const result = await pool.query(`DELETE FROM mst_producto_grupo
      WHERE id_usuario = $1 AND documento_id = $2 AND id_grupo = $3`, [id_anfitrion, documento, req.params.id_grupo]);
    if (!result.rowCount) return res.status(404).json({ message: 'Grupo de producto no encontrado.' });
    return res.sendStatus(204);
  } catch (error) {
    if (error.code === '23503') return res.status(409).json({ message: 'No se puede eliminar un grupo que está en uso.' });
    return responderError(res, error);
  }
};

module.exports = { obtenerConfiguracionGrupos, validarAccesoGrupos, obtenerGrupos, guardarGrupo, eliminarGrupo };
