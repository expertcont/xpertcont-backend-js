const pool = require('../db');

const normalizar = (valor) => (valor || '').toString().trim();
const normalizarBool = (valor) => valor === true || valor === 'true' || valor === '1' || valor === 1;

const columnasItem = `
  id_item,
  id_padre,
  rubro,
  tipo,
  nombre,
  descripcion,
  ruta,
  icono,
  orden,
  requiere_admin,
  requiere_supervisor,
  activo
`;

const columnasAccion = `
  id_accion,
  id_item,
  nombre,
  descripcion,
  orden,
  requiere_admin,
  requiere_supervisor,
  activo
`;

const validarAdministradorCatalogo = async (req, res) => {
  const idAnfitrion = normalizar(req.params.id_anfitrion || req.body.id_anfitrion);
  const idInvitado = normalizar(req.params.id_invitado || req.body.id_invitado);

  if (!idAnfitrion || !idInvitado) {
    res.status(400).json({
      success: false,
      message: 'Faltan id_anfitrion o id_invitado'
    });
    return null;
  }

  if (idAnfitrion === idInvitado) {
    return { idAnfitrion, idInvitado, autorizado: true };
  }

  const result = await pool.query(
    "SELECT 1 FROM mad_usuario WHERE id_usuario = $1 AND super = '1' LIMIT 1",
    [idInvitado]
  );

  if (result.rows.length === 0) {
    res.status(403).json({
      success: false,
      message: 'Solo el usuario anfitrion o un super usuario puede configurar el catalogo de menus.'
    });
    return null;
  }

  return { idAnfitrion, idInvitado, autorizado: true };
};

const listarMenuItems = async (req, res) => {
  try {
    const acceso = await validarAdministradorCatalogo(req, res);
    if (!acceso) return;

    const rubro = normalizar(req.query.rubro || req.params.rubro || 'TRANSPORTE').toUpperCase();
    const result = await pool.query(
      `
        SELECT ${columnasItem}
          FROM mad_menu_item
         WHERE ($1::varchar IS NULL OR rubro = $1)
         ORDER BY orden, id_item
      `,
      [rubro || null]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listando menu items:', error);
    res.status(500).json({ success: false, message: error.message || 'Error interno' });
  }
};

const guardarMenuItem = async (req, res) => {
  try {
    const acceso = await validarAdministradorCatalogo(req, res);
    if (!acceso) return;

    const item = req.body || {};
    const idItem = normalizar(item.id_item);
    const rubro = normalizar(item.rubro || 'TRANSPORTE').toUpperCase();
    const tipo = normalizar(item.tipo || 'PANTALLA').toUpperCase();
    const nombre = normalizar(item.nombre);

    if (!idItem || !rubro || !tipo || !nombre) {
      return res.status(400).json({
        success: false,
        message: 'id_item, rubro, tipo y nombre son requeridos.'
      });
    }

    const result = await pool.query(
      `
        INSERT INTO mad_menu_item (
          id_item, id_padre, rubro, tipo, nombre, descripcion, ruta, icono,
          orden, requiere_admin, requiere_supervisor, activo
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id_item) DO UPDATE
        SET id_padre = EXCLUDED.id_padre,
            rubro = EXCLUDED.rubro,
            tipo = EXCLUDED.tipo,
            nombre = EXCLUDED.nombre,
            descripcion = EXCLUDED.descripcion,
            ruta = EXCLUDED.ruta,
            icono = EXCLUDED.icono,
            orden = EXCLUDED.orden,
            requiere_admin = EXCLUDED.requiere_admin,
            requiere_supervisor = EXCLUDED.requiere_supervisor,
            activo = EXCLUDED.activo
        RETURNING ${columnasItem}
      `,
      [
        idItem,
        normalizar(item.id_padre) || null,
        rubro,
        tipo,
        nombre,
        normalizar(item.descripcion) || null,
        normalizar(item.ruta) || null,
        normalizar(item.icono) || null,
        Number(item.orden || 0),
        normalizarBool(item.requiere_admin),
        normalizarBool(item.requiere_supervisor),
        item.activo === undefined ? true : normalizarBool(item.activo),
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error guardando menu item:', error);
    res.status(500).json({ success: false, message: error.message || 'Error interno' });
  }
};

const eliminarMenuItem = async (req, res) => {
  try {
    const acceso = await validarAdministradorCatalogo(req, res);
    if (!acceso) return;

    const idItem = normalizar(req.params.id_item);
    const result = await pool.query(
      `
        UPDATE mad_menu_item
           SET activo = FALSE
         WHERE id_item = $1
        RETURNING ${columnasItem}
      `,
      [idItem]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item de menu no encontrado' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error desactivando menu item:', error);
    res.status(500).json({ success: false, message: error.message || 'Error interno' });
  }
};

const listarMenuAcciones = async (req, res) => {
  try {
    const acceso = await validarAdministradorCatalogo(req, res);
    if (!acceso) return;

    const idItem = normalizar(req.query.id_item);
    const result = await pool.query(
      `
        SELECT ${columnasAccion}
          FROM mad_menu_accion
         WHERE ($1::varchar IS NULL OR id_item = $1)
         ORDER BY id_item, orden, id_accion
      `,
      [idItem || null]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listando menu acciones:', error);
    res.status(500).json({ success: false, message: error.message || 'Error interno' });
  }
};

const guardarMenuAccion = async (req, res) => {
  try {
    const acceso = await validarAdministradorCatalogo(req, res);
    if (!acceso) return;

    const accion = req.body || {};
    const idAccion = normalizar(accion.id_accion);
    const idItem = normalizar(accion.id_item);
    const nombre = normalizar(accion.nombre);

    if (!idAccion || !idItem || !nombre) {
      return res.status(400).json({
        success: false,
        message: 'id_accion, id_item y nombre son requeridos.'
      });
    }

    const result = await pool.query(
      `
        INSERT INTO mad_menu_accion (
          id_accion, id_item, nombre, descripcion, orden,
          requiere_admin, requiere_supervisor, activo
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id_accion) DO UPDATE
        SET id_item = EXCLUDED.id_item,
            nombre = EXCLUDED.nombre,
            descripcion = EXCLUDED.descripcion,
            orden = EXCLUDED.orden,
            requiere_admin = EXCLUDED.requiere_admin,
            requiere_supervisor = EXCLUDED.requiere_supervisor,
            activo = EXCLUDED.activo
        RETURNING ${columnasAccion}
      `,
      [
        idAccion,
        idItem,
        nombre,
        normalizar(accion.descripcion) || null,
        Number(accion.orden || 0),
        normalizarBool(accion.requiere_admin),
        normalizarBool(accion.requiere_supervisor),
        accion.activo === undefined ? true : normalizarBool(accion.activo),
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error guardando menu accion:', error);
    res.status(500).json({ success: false, message: error.message || 'Error interno' });
  }
};

const eliminarMenuAccion = async (req, res) => {
  try {
    const acceso = await validarAdministradorCatalogo(req, res);
    if (!acceso) return;

    const idAccion = normalizar(req.params.id_accion);
    const result = await pool.query(
      `
        UPDATE mad_menu_accion
           SET activo = FALSE
         WHERE id_accion = $1
        RETURNING ${columnasAccion}
      `,
      [idAccion]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Accion de menu no encontrada' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error desactivando menu accion:', error);
    res.status(500).json({ success: false, message: error.message || 'Error interno' });
  }
};

module.exports = {
  listarMenuItems,
  guardarMenuItem,
  eliminarMenuItem,
  listarMenuAcciones,
  guardarMenuAccion,
  eliminarMenuAccion,
};
