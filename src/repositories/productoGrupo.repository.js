/**
 * Persistencia de Grupos Color: PostgreSQL y resolución multiempresa.
 * No conoce Express ni decide acceso. Cada consulta incluye la clave del tenant.
 */
const pool = require('../db');
const { resolverDocumentoId } = require('../utils/libreria.utils');

const resolverDocumento = (idAnfitrion, documentoId) =>
  resolverDocumentoId(pool, idAnfitrion, documentoId);

async function obtenerConfiguracion({ id_anfitrion, documento }) {
  const result = await pool.query(`
    SELECT u.rubro, p.producto_sku
    FROM mad_usuario u
    LEFT JOIN mve_parametros p
      ON p.id_usuario = u.id_usuario AND p.documento_id = $2
    WHERE u.id_usuario = $1
  `, [id_anfitrion, documento]);

  return result.rows[0] || null;
}

async function listar({ id_anfitrion, documento }) {
  const result = await pool.query(`
    SELECT * FROM mst_producto_grupo
    WHERE id_usuario = $1 AND documento_id = $2
    ORDER BY id_grupo
  `, [id_anfitrion, documento]);

  return result.rows;
}

// INSERT y UPDATE comparten el orden: clave compuesta, campos editables y operador.
function parametrosGuardado({ id_anfitrion, documento }, grupo) {
  return [id_anfitrion, documento, grupo.codigo, grupo.nombre, grupo.descripcion, grupo.usuario];
}

async function crear(contexto, grupo) {
  const result = await pool.query(`
    INSERT INTO mst_producto_grupo
      (id_usuario, documento_id, id_grupo, nombre, descripcion, origen, ctrl_crea, ctrl_crea_us)
    VALUES ($1, $2, $3, $4, $5, 'MANUAL', CURRENT_TIMESTAMP, $6)
    RETURNING *
  `, parametrosGuardado(contexto, grupo));

  return result.rows[0] || null;
}

async function actualizar(contexto, grupo) {
  // La edición conserva la clave, el origen y la auditoría de creación.
  const result = await pool.query(`
    UPDATE mst_producto_grupo
    SET nombre = $4, descripcion = $5,
        ctrl_mod = CURRENT_TIMESTAMP, ctrl_mod_us = $6
    WHERE id_usuario = $1 AND documento_id = $2 AND id_grupo = $3
    RETURNING *
  `, parametrosGuardado(contexto, grupo));

  return result.rows[0] || null;
}

async function eliminar({ id_anfitrion, documento }, codigo) {
  const result = await pool.query(`
    DELETE FROM mst_producto_grupo
    WHERE id_usuario = $1 AND documento_id = $2 AND id_grupo = $3
  `, [id_anfitrion, documento, codigo]);

  return result.rowCount > 0;
}

module.exports = { resolverDocumento, obtenerConfiguracion, listar, crear, actualizar, eliminar };
