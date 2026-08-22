const pool = require('../db');

const columnasPuntoVenta = `
  id_usuario,
  documento_id,
  id_punto_venta,
  nombre,
  direccion,
  id_ubigeo,
  id_ubigeo AS ubigeo,
  id_pais,
  id_pais AS pais,
  telefono,
  activo,
  ctrl_crea,
  ctrl_crea_us,
  ctrl_mod,
  ctrl_mod_us,
  serie
`;

const columnasPuntoVentaUsuario = `
  pvu.id_usuario,
  pvu.documento_id,
  pvu.id_punto_venta,
  pv.nombre AS punto_venta_nombre,
  pvu.id_invitado,
  pvu.nombres,
  pvu.fecha_ingreso,
  pvu.activo,
  pvu.sin_restriccion,
  pvu.turno1_inicio,
  pvu.turno1_fin,
  pvu.turno2_inicio,
  pvu.turno2_fin,
  pvu.turno3_inicio,
  pvu.turno3_fin,
  pvu.ultimo_login
`;

const normalizarTiempo = (value) => value || null;

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
       WHERE pv.id_usuario = $1
         AND pv.documento_id = $2
         AND pv.activo = TRUE
         AND (
           EXISTS (
             SELECT 1
               FROM mad_punto_venta_usuario pvu
              WHERE pvu.id_usuario = pv.id_usuario
                AND pvu.documento_id = pv.documento_id
                AND pvu.id_invitado = $3
                AND pvu.activo = TRUE
                AND pvu.sin_restriccion = TRUE
           )
           OR EXISTS (
             SELECT 1
               FROM mad_punto_venta_usuario pvu
              WHERE pvu.id_usuario = pv.id_usuario
                AND pvu.documento_id = pv.documento_id
                AND pvu.id_punto_venta = pv.id_punto_venta
                AND pvu.id_invitado = $3
                AND pvu.activo = TRUE
                AND (
                  (
                    pvu.turno1_inicio IS NOT NULL
                    AND pvu.turno1_fin IS NOT NULL
                    AND (
                      (
                        pvu.turno1_inicio <= pvu.turno1_fin
                        AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN pvu.turno1_inicio AND pvu.turno1_fin
                      )
                      OR (
                        pvu.turno1_inicio > pvu.turno1_fin
                        AND (
                          (now() AT TIME ZONE 'America/Lima')::time >= pvu.turno1_inicio
                          OR (now() AT TIME ZONE 'America/Lima')::time <= pvu.turno1_fin
                        )
                      )
                    )
                  )
                  OR (
                    pvu.turno2_inicio IS NOT NULL
                    AND pvu.turno2_fin IS NOT NULL
                    AND (
                      (
                        pvu.turno2_inicio <= pvu.turno2_fin
                        AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN pvu.turno2_inicio AND pvu.turno2_fin
                      )
                      OR (
                        pvu.turno2_inicio > pvu.turno2_fin
                        AND (
                          (now() AT TIME ZONE 'America/Lima')::time >= pvu.turno2_inicio
                          OR (now() AT TIME ZONE 'America/Lima')::time <= pvu.turno2_fin
                        )
                      )
                    )
                  )
                  OR (
                    pvu.turno3_inicio IS NOT NULL
                    AND pvu.turno3_fin IS NOT NULL
                    AND (
                      (
                        pvu.turno3_inicio <= pvu.turno3_fin
                        AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN pvu.turno3_inicio AND pvu.turno3_fin
                      )
                      OR (
                        pvu.turno3_inicio > pvu.turno3_fin
                        AND (
                          (now() AT TIME ZONE 'America/Lima')::time >= pvu.turno3_inicio
                          OR (now() AT TIME ZONE 'America/Lima')::time <= pvu.turno3_fin
                        )
                      )
                    )
                  )
                )
           )
         )
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

const listarPuntosVentaUsuarios = async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;

  if (!id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para listar usuarios por punto de venta'
    });
  }

  try {
    const result = await pool.query(`
      SELECT ${columnasPuntoVentaUsuario}
        FROM mad_punto_venta_usuario pvu
        LEFT JOIN mad_punto_venta pv
          ON pv.id_usuario = pvu.id_usuario
         AND pv.documento_id = pvu.documento_id
         AND pv.id_punto_venta = pvu.id_punto_venta
       WHERE pvu.id_usuario = $1
         AND pvu.documento_id = $2
       ORDER BY pvu.activo DESC, pvu.id_invitado, pv.nombre, pvu.id_punto_venta
    `, [id_anfitrion, documento_id]);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al listar usuarios por punto de venta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerPuntoVentaUsuario = async (req, res) => {
  const { id_anfitrion, documento_id, id_punto_venta, id_invitado } = req.params;

  if (!id_anfitrion || !documento_id || !id_punto_venta || !id_invitado) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener usuario por punto de venta'
    });
  }

  try {
    const result = await pool.query(`
      SELECT ${columnasPuntoVentaUsuario}
        FROM mad_punto_venta_usuario pvu
        LEFT JOIN mad_punto_venta pv
          ON pv.id_usuario = pvu.id_usuario
         AND pv.documento_id = pvu.documento_id
         AND pv.id_punto_venta = pvu.id_punto_venta
       WHERE pvu.id_usuario = $1
         AND pvu.documento_id = $2
         AND pvu.id_punto_venta = $3
         AND pvu.id_invitado = $4
    `, [id_anfitrion, documento_id, id_punto_venta, id_invitado]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario por punto de venta no encontrado'
      });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener usuario por punto de venta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const crearPuntoVentaUsuario = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    id_punto_venta,
    id_invitado,
    nombres,
    fecha_ingreso,
    activo = true,
    sin_restriccion = false,
    turno1_inicio,
    turno1_fin,
    turno2_inicio,
    turno2_fin,
    turno3_inicio,
    turno3_fin,
    ultimo_login
  } = req.body;

  if (!id_anfitrion || !documento_id || !id_punto_venta || !id_invitado) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear usuario por punto de venta'
    });
  }

  try {
    const result = await pool.query(`
      WITH registro AS (
        INSERT INTO mad_punto_venta_usuario (
          id_usuario, documento_id, id_punto_venta, id_invitado, nombres,
          fecha_ingreso, activo, sin_restriccion,
          turno1_inicio, turno1_fin,
          turno2_inicio, turno2_fin,
          turno3_inicio, turno3_fin,
          ultimo_login
        )
        VALUES (
          $1,$2,$3,$4,$5,
          COALESCE(NULLIF($6, '')::timestamp, CURRENT_TIMESTAMP),
          $7,$8,
          NULLIF($9, '')::time, NULLIF($10, '')::time,
          NULLIF($11, '')::time, NULLIF($12, '')::time,
          NULLIF($13, '')::time, NULLIF($14, '')::time,
          NULLIF($15, '')::timestamp
        )
        RETURNING *
      )
      SELECT registro.id_usuario,
             registro.documento_id,
             registro.id_punto_venta,
             pv.nombre AS punto_venta_nombre,
             registro.id_invitado,
             registro.nombres,
             registro.fecha_ingreso,
             registro.activo,
             registro.sin_restriccion,
             registro.turno1_inicio,
             registro.turno1_fin,
             registro.turno2_inicio,
             registro.turno2_fin,
             registro.turno3_inicio,
             registro.turno3_fin,
             registro.ultimo_login
        FROM registro
        LEFT JOIN mad_punto_venta pv
          ON pv.id_usuario = registro.id_usuario
         AND pv.documento_id = registro.documento_id
         AND pv.id_punto_venta = registro.id_punto_venta
    `, [
      id_anfitrion,
      documento_id,
      id_punto_venta,
      id_invitado,
      nombres || null,
      fecha_ingreso || null,
      activo !== false,
      sin_restriccion === true,
      normalizarTiempo(turno1_inicio),
      normalizarTiempo(turno1_fin),
      normalizarTiempo(turno2_inicio),
      normalizarTiempo(turno2_fin),
      normalizarTiempo(turno3_inicio),
      normalizarTiempo(turno3_fin),
      ultimo_login || null
    ]);

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al crear usuario por punto de venta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarPuntoVentaUsuario = async (req, res) => {
  const {
    id_anfitrion,
    documento_id,
    id_punto_venta,
    id_invitado,
    nombres,
    fecha_ingreso,
    activo,
    sin_restriccion,
    turno1_inicio,
    turno1_fin,
    turno2_inicio,
    turno2_fin,
    turno3_inicio,
    turno3_fin,
    ultimo_login
  } = req.body;

  if (!id_anfitrion || !documento_id || !id_punto_venta || !id_invitado) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar usuario por punto de venta'
    });
  }

  try {
    const result = await pool.query(`
      WITH registro AS (
        UPDATE mad_punto_venta_usuario
           SET fecha_ingreso = COALESCE(NULLIF($5, '')::timestamp, fecha_ingreso),
               nombres = COALESCE($6, nombres),
               activo = COALESCE($7::boolean, activo),
               sin_restriccion = COALESCE($8::boolean, sin_restriccion),
               turno1_inicio = NULLIF($9, '')::time,
               turno1_fin = NULLIF($10, '')::time,
               turno2_inicio = NULLIF($11, '')::time,
               turno2_fin = NULLIF($12, '')::time,
               turno3_inicio = NULLIF($13, '')::time,
               turno3_fin = NULLIF($14, '')::time,
               ultimo_login = COALESCE(NULLIF($15, '')::timestamp, ultimo_login)
         WHERE id_usuario = $1
           AND documento_id = $2
           AND id_punto_venta = $3
           AND id_invitado = $4
         RETURNING *
      )
      SELECT registro.id_usuario,
             registro.documento_id,
             registro.id_punto_venta,
             pv.nombre AS punto_venta_nombre,
             registro.id_invitado,
             registro.nombres,
             registro.fecha_ingreso,
             registro.activo,
             registro.sin_restriccion,
             registro.turno1_inicio,
             registro.turno1_fin,
             registro.turno2_inicio,
             registro.turno2_fin,
             registro.turno3_inicio,
             registro.turno3_fin,
             registro.ultimo_login
        FROM registro
        LEFT JOIN mad_punto_venta pv
          ON pv.id_usuario = registro.id_usuario
         AND pv.documento_id = registro.documento_id
         AND pv.id_punto_venta = registro.id_punto_venta
    `, [
      id_anfitrion,
      documento_id,
      id_punto_venta,
      id_invitado,
      fecha_ingreso || null,
      nombres || null,
      activo,
      sin_restriccion,
      normalizarTiempo(turno1_inicio),
      normalizarTiempo(turno1_fin),
      normalizarTiempo(turno2_inicio),
      normalizarTiempo(turno2_fin),
      normalizarTiempo(turno3_inicio),
      normalizarTiempo(turno3_fin),
      ultimo_login || null
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario por punto de venta no encontrado'
      });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar usuario por punto de venta:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const eliminarPuntoVentaUsuario = async (req, res) => {
  const { id_anfitrion, documento_id, id_punto_venta, id_invitado } = req.params;

  if (!id_anfitrion || !documento_id || !id_punto_venta || !id_invitado) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar usuario por punto de venta'
    });
  }

  try {
    const result = await pool.query(`
      DELETE FROM mad_punto_venta_usuario
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_punto_venta = $3
         AND id_invitado = $4
       RETURNING id_usuario, documento_id, id_punto_venta, id_invitado
    `, [id_anfitrion, documento_id, id_punto_venta, id_invitado]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario por punto de venta no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Usuario por punto de venta eliminado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar usuario por punto de venta:', error);
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
    id_ubigeo,
    pais,
    id_pais,
    telefono,
    serie,
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
        nombre, direccion, id_ubigeo, id_pais,
        telefono, activo, ctrl_crea, ctrl_crea_us,
        serie
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$9,$10)
      RETURNING ${columnasPuntoVenta}
    `, [
      id_anfitrion,
      documento_id,
      id_punto_venta,
      nombre,
      direccion || null,
      id_ubigeo || ubigeo || null,
      id_pais || pais || 'PE',
      telefono || null,
      activo !== false,
      ctrl_crea_us || null,
      serie || null
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
    id_ubigeo,
    pais,
    id_pais,
    telefono,
    activo,
    ctrl_mod_us,
    serie
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
             id_ubigeo = COALESCE($6, id_ubigeo),
             id_pais = COALESCE($7, id_pais),
             telefono = COALESCE($8, telefono),
             activo = COALESCE($9::boolean, activo),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($10, ctrl_mod_us),
             serie = COALESCE($11, serie)
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
      id_ubigeo || ubigeo || null,
      id_pais || pais || null,
      telefono || null,
      activo,
      ctrl_mod_us || null,
      serie || null
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
  listarPuntosVentaUsuarios,
  obtenerPuntoVentaUsuario,
  crearPuntoVentaUsuario,
  actualizarPuntoVentaUsuario,
  eliminarPuntoVentaUsuario,
  crearPuntoVenta,
  actualizarPuntoVenta,
  eliminarPuntoVenta
};
