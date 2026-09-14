const pool = require('../db');

const normalizarTexto = (value) => String(value ?? '').trim();
const normalizarCodigo = (value) => normalizarTexto(value).toUpperCase();
const esTipoMovimientoValido = (value) => ['I', 'S'].includes(normalizarCodigo(value));
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const condicionPagoVentaSql = "COALESCE(NULLIF(REGEXP_REPLACE(UPPER(COALESCE(tv.condicion_pago, '')), '[^A-Z]', '', 'g'), ''), 'PAGADO')";
const condicionPorCobrarVentaSql = `${condicionPagoVentaSql} = 'PORCOBRAR'`;

const columnasMovimientoCaja = `
  c.id_usuario,
  c.documento_id,
  c.periodo,
  c.id_movimiento,
  CAST(c.fecha AS VARCHAR(50)) AS fecha,
  c.id_punto_venta,
  pv.nombre AS punto_venta_nombre,
  c.tipo_movimiento,
  c.id_motivo,
  mt.nombre AS motivo_nombre,
  c.descripcion,
  c.importe,
  c.id_forma_pago,
  fp.nombre AS forma_pago_nombre,
  c.nro_operacion,
  c.beneficiario,
  c.documento_beneficiario,
  c.id_invitado,
  c.registrado
`;

const queryMovimientoCajaBase = `
  FROM mve_transcaja c
  LEFT JOIN mad_punto_venta pv
    ON pv.id_usuario = c.id_usuario
   AND pv.documento_id = c.documento_id
   AND pv.id_punto_venta = c.id_punto_venta
  LEFT JOIN mve_transmotivo mt
    ON mt.id_usuario = c.id_usuario
   AND mt.documento_id = c.documento_id
   AND mt.id_motivo = c.id_motivo
  LEFT JOIN mve_forma_pago fp
    ON fp.id_forma_pago = c.id_forma_pago
`;

const responderError = (res, error, mensajeDefault) => {
  console.error(mensajeDefault, error);
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.publicMessage || error.message || 'Error interno del servidor'
  });
};

const crearError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
};

const validarFormaPago = async (idFormaPago) => {
  const result = await pool.query(
    'SELECT id_forma_pago FROM mve_forma_pago WHERE id_forma_pago = $1 LIMIT 1',
    [idFormaPago]
  );

  if (result.rows.length === 0) {
    throw crearError('Forma de pago invalida');
  }
};

const validarPuntoVenta = async ({ id_usuario, documento_id, id_punto_venta, id_invitado }) => {
  const result = await pool.query(`
    SELECT pv.id_punto_venta
      FROM mad_punto_venta pv
     WHERE pv.id_usuario = $1
       AND pv.documento_id = $2
       AND pv.id_punto_venta = $3
       AND pv.activo = TRUE
       AND (
         $1 = $4
         OR EXISTS (
           SELECT 1
             FROM mad_usuario mu
            WHERE mu.id_usuario = $4
              AND mu.super = '1'
         )
         OR EXISTS (
           SELECT 1
             FROM mad_punto_venta_usuario pvu
            WHERE pvu.id_usuario = pv.id_usuario
              AND pvu.documento_id = pv.documento_id
              AND pvu.id_punto_venta = pv.id_punto_venta
              AND pvu.id_invitado = $4
              AND pvu.activo = TRUE
         )
       )
     LIMIT 1
  `, [id_usuario, documento_id, id_punto_venta, id_invitado || null]);

  if (result.rows.length === 0) {
    throw crearError('Punto de venta no valido o no autorizado', 403);
  }
};

const filtroPuntoVentaAutorizado = (alias, paramIndex, columnaPuntoVenta = 'id_punto_venta') => `
  AND (
    ${alias}.id_usuario = $${paramIndex}
    OR EXISTS (
      SELECT 1
        FROM mad_usuario mu
       WHERE mu.id_usuario = $${paramIndex}
         AND mu.super = '1'
    )
    OR EXISTS (
      SELECT 1
        FROM mad_punto_venta_usuario pvu
       WHERE pvu.id_usuario = ${alias}.id_usuario
         AND pvu.documento_id = ${alias}.documento_id
         AND pvu.id_punto_venta = ${alias}.${columnaPuntoVenta}
         AND pvu.id_invitado = $${paramIndex}
         AND pvu.activo = TRUE
    )
  )
`;

const validarMotivo = async ({ id_usuario, documento_id, id_motivo, tipo_movimiento, exigirActivo = true }) => {
  const result = await pool.query(`
    SELECT id_motivo, tipo_movimiento, activo
      FROM mve_transmotivo
     WHERE id_usuario = $1
       AND documento_id = $2
       AND id_motivo = $3
     LIMIT 1
  `, [id_usuario, documento_id, id_motivo]);

  if (result.rows.length === 0) {
    throw crearError('Motivo inexistente');
  }

  const motivo = result.rows[0];
  if (normalizarCodigo(motivo.tipo_movimiento) !== tipo_movimiento) {
    throw crearError('Motivo incompatible con el tipo de movimiento');
  }

  if (exigirActivo && Number(motivo.activo) !== 1) {
    throw crearError('Motivo inactivo');
  }
};

const listarMotivosCaja = async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;
  const tipoMovimiento = normalizarCodigo(req.query.tipo_movimiento);
  const activo = req.query.activo;

  if (!id_anfitrion || !documento_id) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener motivos de caja'
    });
  }

  try {
    const params = [id_anfitrion, documento_id];
    const filtros = [];

    if (tipoMovimiento) {
      if (!esTipoMovimientoValido(tipoMovimiento)) {
        return res.status(400).json({ success: false, message: 'Tipo de movimiento no valido' });
      }
      params.push(tipoMovimiento);
      filtros.push(`AND tipo_movimiento = $${params.length}`);
    }

    if (activo === '0' || activo === '1') {
      params.push(Number(activo));
      filtros.push(`AND activo = $${params.length}`);
    }

    const result = await pool.query(`
      SELECT id_usuario, documento_id, id_motivo, tipo_movimiento, nombre, activo
        FROM mve_transmotivo
       WHERE id_usuario = $1
         AND documento_id = $2
         ${filtros.join('\n')}
       ORDER BY activo DESC, tipo_movimiento, nombre, id_motivo
    `, params);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    return responderError(res, error, 'Error al obtener motivos de caja:');
  }
};

const crearMotivoCaja = async (req, res) => {
  const idUsuario = normalizarTexto(req.body.id_usuario || req.body.id_anfitrion);
  const documentoId = normalizarTexto(req.body.documento_id);
  const idMotivo = normalizarCodigo(req.body.id_motivo);
  const tipoMovimiento = normalizarCodigo(req.body.tipo_movimiento);
  const nombre = normalizarTexto(req.body.nombre);

  if (!idUsuario || !documentoId || !idMotivo || !tipoMovimiento || !nombre) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para crear motivo' });
  }

  if (!esTipoMovimientoValido(tipoMovimiento)) {
    return res.status(400).json({ success: false, message: 'Tipo de movimiento no valido' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO mve_transmotivo (
        id_usuario, documento_id, id_motivo, tipo_movimiento, nombre, activo
      )
      VALUES ($1,$2,$3,$4,$5,1)
      RETURNING *
    `, [idUsuario, documentoId, idMotivo, tipoMovimiento, nombre]);

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return responderError(res, error, 'Error al crear motivo de caja:');
  }
};

const actualizarMotivoCaja = async (req, res) => {
  const { id_anfitrion, documento_id, id_motivo } = req.params;
  const nombre = normalizarTexto(req.body.nombre);
  const tipoMovimiento = normalizarCodigo(req.body.tipo_movimiento);

  if (!id_anfitrion || !documento_id || !id_motivo) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para actualizar motivo' });
  }

  if (tipoMovimiento && !esTipoMovimientoValido(tipoMovimiento)) {
    return res.status(400).json({ success: false, message: 'Tipo de movimiento no valido' });
  }

  try {
    const result = await pool.query(`
      UPDATE mve_transmotivo
         SET nombre = COALESCE(NULLIF($4, ''), nombre),
             tipo_movimiento = COALESCE(NULLIF($5, ''), tipo_movimiento)
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_motivo = $3
       RETURNING *
    `, [id_anfitrion, documento_id, normalizarCodigo(id_motivo), nombre, tipoMovimiento]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Motivo no encontrado' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return responderError(res, error, 'Error al actualizar motivo de caja:');
  }
};

const actualizarEstadoMotivoCaja = async (req, res) => {
  const { id_anfitrion, documento_id, id_motivo } = req.params;
  const activo = Number(req.body.activo);

  if (!id_anfitrion || !documento_id || !id_motivo || ![0, 1].includes(activo)) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para actualizar estado' });
  }

  try {
    const result = await pool.query(`
      UPDATE mve_transmotivo
         SET activo = $4
       WHERE id_usuario = $1
         AND documento_id = $2
         AND id_motivo = $3
       RETURNING *
    `, [id_anfitrion, documento_id, normalizarCodigo(id_motivo), activo]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Motivo no encontrado' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return responderError(res, error, 'Error al actualizar estado de motivo de caja:');
  }
};

const listarFormasPagoCaja = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_forma_pago, nombre
        FROM mve_forma_pago
       ORDER BY id_forma_pago
    `);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    return responderError(res, error, 'Error al obtener formas de pago de caja:');
  }
};

const listarMovimientosCaja = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const {
    id_punto_venta,
    tipo_movimiento,
    fecha_desde,
    fecha_hasta,
    id_motivo,
    id_forma_pago,
    registrado,
    id_invitado
  } = req.query;

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para obtener caja' });
  }

  try {
    const params = [id_anfitrion, documento_id, periodo];
    const filtros = [];

    if (id_punto_venta) {
      params.push(normalizarCodigo(id_punto_venta));
      filtros.push(`AND c.id_punto_venta = $${params.length}`);
    }

    if (id_invitado) {
      params.push(normalizarTexto(id_invitado));
      filtros.push(filtroPuntoVentaAutorizado('c', params.length));
      filtros.push(`AND c.id_invitado = $${params.length}`);
    }

    if (tipo_movimiento) {
      const tipo = normalizarCodigo(tipo_movimiento);
      if (!esTipoMovimientoValido(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo de movimiento no valido' });
      }
      params.push(tipo);
      filtros.push(`AND c.tipo_movimiento = $${params.length}`);
    }

    if (fecha_desde) {
      params.push(fecha_desde);
      filtros.push(`AND c.fecha::date >= $${params.length}::date`);
    }

    if (fecha_hasta) {
      params.push(fecha_hasta);
      filtros.push(`AND c.fecha::date <= $${params.length}::date`);
    }

    if (id_motivo) {
      params.push(normalizarCodigo(id_motivo));
      filtros.push(`AND c.id_motivo = $${params.length}`);
    }

    if (id_forma_pago) {
      params.push(normalizarTexto(id_forma_pago));
      filtros.push(`AND c.id_forma_pago = $${params.length}`);
    }

    if (registrado === '0' || registrado === '1') {
      params.push(Number(registrado));
      filtros.push(`AND c.registrado = $${params.length}`);
    }

    const result = await pool.query(`
      SELECT ${columnasMovimientoCaja}
        ${queryMovimientoCajaBase}
       WHERE c.id_usuario = $1
         AND c.documento_id = $2
         AND c.periodo = $3
         ${filtros.join('\n')}
       ORDER BY c.fecha DESC, c.id_movimiento DESC
    `, params);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    return responderError(res, error, 'Error al obtener movimientos de caja:');
  }
};

const obtenerMovimientoCaja = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, id_movimiento } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || !id_movimiento) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para obtener movimiento' });
  }

  try {
    const result = await pool.query(`
      SELECT ${columnasMovimientoCaja}
        ${queryMovimientoCajaBase}
       WHERE c.id_usuario = $1
         AND c.documento_id = $2
         AND c.periodo = $3
         AND c.id_movimiento = $4
       LIMIT 1
    `, [id_anfitrion, documento_id, periodo, id_movimiento]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Movimiento no encontrado' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return responderError(res, error, 'Error al obtener movimiento de caja:');
  }
};

const crearMovimientoCaja = async (req, res) => {
  const idUsuario = normalizarTexto(req.body.id_usuario || req.body.id_anfitrion);
  const documentoId = normalizarTexto(req.body.documento_id);
  const periodo = normalizarTexto(req.body.periodo);
  const idPuntoVenta = normalizarCodigo(req.body.id_punto_venta);
  const tipoMovimiento = normalizarCodigo(req.body.tipo_movimiento || 'S');
  const idMotivo = normalizarCodigo(req.body.id_motivo);
  const importe = toNumber(req.body.importe);
  const idFormaPago = normalizarTexto(req.body.id_forma_pago);
  const idInvitado = normalizarTexto(req.body.id_invitado);

  if (!idUsuario || !documentoId || !periodo || !idPuntoVenta || !tipoMovimiento || !idMotivo || !idFormaPago || !idInvitado) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para crear movimiento' });
  }

  if (!esTipoMovimientoValido(tipoMovimiento)) {
    return res.status(400).json({ success: false, message: 'Tipo de movimiento no valido' });
  }

  if (importe <= 0) {
    return res.status(400).json({ success: false, message: 'El importe debe ser mayor a cero' });
  }

  const client = await pool.connect();
  try {
    await validarMotivo({ id_usuario: idUsuario, documento_id: documentoId, id_motivo: idMotivo, tipo_movimiento: tipoMovimiento });
    await validarFormaPago(idFormaPago);
    await validarPuntoVenta({ id_usuario: idUsuario, documento_id: documentoId, id_punto_venta: idPuntoVenta, id_invitado: idInvitado });

    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mve_transcaja:${idUsuario}:${documentoId}:${periodo}`]);

    const correlativo = await client.query(`
      SELECT COALESCE(MAX(id_movimiento), 0) + 1 AS id_movimiento
        FROM mve_transcaja
       WHERE id_usuario = $1
         AND documento_id = $2
         AND periodo = $3
    `, [idUsuario, documentoId, periodo]);

    const idMovimiento = correlativo.rows[0].id_movimiento;
    const result = await client.query(`
      INSERT INTO mve_transcaja (
        id_usuario, documento_id, periodo, id_movimiento,
        fecha, id_punto_venta, tipo_movimiento, id_motivo,
        descripcion, importe, id_forma_pago, nro_operacion,
        beneficiario, documento_beneficiario, id_invitado, registrado
      )
      VALUES (
        $1,$2,$3,$4,
        COALESCE(NULLIF($5, '')::timestamp, CURRENT_TIMESTAMP),
        $6,$7,$8,
        NULLIF($9, ''),$10,$11,NULLIF($12, ''),
        NULLIF($13, ''),NULLIF($14, ''),NULLIF($15, ''),1
      )
      RETURNING *
    `, [
      idUsuario,
      documentoId,
      periodo,
      idMovimiento,
      normalizarTexto(req.body.fecha),
      idPuntoVenta,
      tipoMovimiento,
      idMotivo,
      normalizarTexto(req.body.descripcion),
      importe,
      idFormaPago,
      normalizarTexto(req.body.nro_operacion),
      normalizarTexto(req.body.beneficiario),
      normalizarTexto(req.body.documento_beneficiario),
      idInvitado
    ]);

    await client.query('COMMIT');
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return responderError(res, error, 'Error al crear movimiento de caja:');
  } finally {
    client.release();
  }
};

const actualizarMovimientoCaja = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, id_movimiento } = req.params;
  const idPuntoVenta = normalizarCodigo(req.body.id_punto_venta);
  const idMotivo = normalizarCodigo(req.body.id_motivo);
  const importe = toNumber(req.body.importe);
  const idFormaPago = normalizarTexto(req.body.id_forma_pago);

  if (!periodo || !id_anfitrion || !documento_id || !id_movimiento) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para actualizar movimiento' });
  }

  if (req.body.importe !== undefined && importe <= 0) {
    return res.status(400).json({ success: false, message: 'El importe debe ser mayor a cero' });
  }

  try {
    const idInvitado = normalizarTexto(req.body.id_invitado);
    if (!idInvitado) {
      return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para validar punto de venta' });
    }

    const actual = await pool.query(`
      SELECT tipo_movimiento, registrado, id_punto_venta
        FROM mve_transcaja
       WHERE id_usuario = $1
         AND documento_id = $2
         AND periodo = $3
         AND id_movimiento = $4
       LIMIT 1
    `, [id_anfitrion, documento_id, periodo, id_movimiento]);

    if (actual.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Movimiento no encontrado' });
    }

    if (Number(actual.rows[0].registrado) !== 1) {
      return res.status(409).json({ success: false, message: 'No se puede editar un movimiento anulado' });
    }

    const tipoMovimiento = normalizarCodigo(actual.rows[0].tipo_movimiento);
    await validarPuntoVenta({
      id_usuario: id_anfitrion,
      documento_id,
      id_punto_venta: actual.rows[0].id_punto_venta,
      id_invitado: idInvitado
    });

    if (idMotivo) {
      await validarMotivo({ id_usuario: id_anfitrion, documento_id, id_motivo: idMotivo, tipo_movimiento: tipoMovimiento });
    }

    if (idFormaPago) {
      await validarFormaPago(idFormaPago);
    }

    if (idPuntoVenta) {
      await validarPuntoVenta({
        id_usuario: id_anfitrion,
        documento_id,
        id_punto_venta: idPuntoVenta,
        id_invitado: idInvitado
      });
    }

    const result = await pool.query(`
      UPDATE mve_transcaja
         SET fecha = COALESCE(NULLIF($5, '')::timestamp, fecha),
             id_punto_venta = COALESCE(NULLIF($6, ''), id_punto_venta),
             id_motivo = COALESCE(NULLIF($7, ''), id_motivo),
             descripcion = $8,
             importe = COALESCE($9::numeric, importe),
             id_forma_pago = COALESCE(NULLIF($10, ''), id_forma_pago),
             nro_operacion = $11,
             beneficiario = $12,
             documento_beneficiario = $13
       WHERE id_usuario = $1
         AND documento_id = $2
         AND periodo = $3
         AND id_movimiento = $4
         AND registrado = 1
       RETURNING *
    `, [
      id_anfitrion,
      documento_id,
      periodo,
      id_movimiento,
      normalizarTexto(req.body.fecha),
      idPuntoVenta,
      idMotivo,
      req.body.descripcion ?? null,
      req.body.importe === undefined ? null : importe,
      idFormaPago,
      req.body.nro_operacion ?? null,
      req.body.beneficiario ?? null,
      req.body.documento_beneficiario ?? null
    ]);

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return responderError(res, error, 'Error al actualizar movimiento de caja:');
  }
};

const anularMovimientoCaja = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, id_movimiento } = req.params;
  const idInvitado = normalizarTexto(req.query.id_invitado || req.body?.id_invitado);

  if (!periodo || !id_anfitrion || !documento_id || !id_movimiento || !idInvitado) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para anular movimiento' });
  }

  try {
    const actual = await pool.query(`
      SELECT id_punto_venta
        FROM mve_transcaja
       WHERE id_usuario = $1
         AND documento_id = $2
         AND periodo = $3
         AND id_movimiento = $4
       LIMIT 1
    `, [id_anfitrion, documento_id, periodo, id_movimiento]);

    if (actual.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Movimiento no encontrado' });
    }

    await validarPuntoVenta({
      id_usuario: id_anfitrion,
      documento_id,
      id_punto_venta: actual.rows[0].id_punto_venta,
      id_invitado: idInvitado
    });

    const result = await pool.query(`
      UPDATE mve_transcaja
         SET registrado = 0
       WHERE id_usuario = $1
         AND documento_id = $2
         AND periodo = $3
         AND id_movimiento = $4
         AND registrado = 1
       RETURNING id_movimiento
    `, [id_anfitrion, documento_id, periodo, id_movimiento]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Movimiento no encontrado o ya anulado' });
    }

    return res.status(200).json({
      success: true,
      message: 'Movimiento anulado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    return responderError(res, error, 'Error al anular movimiento de caja:');
  }
};

const obtenerConsolidadoCaja = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const { id_punto_venta, fecha_desde, fecha_hasta, id_forma_pago, id_invitado } = req.query;

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para consolidado de caja' });
  }

  try {
    const params = [id_anfitrion, documento_id, periodo];
    const filtrosVentaOrigen = [];
    const filtrosVentaDestino = [];
    const filtrosCaja = [];

    if (id_punto_venta) {
      params.push(normalizarCodigo(id_punto_venta));
      filtrosVentaOrigen.push(`AND tv.id_punto_venta = $${params.length}`);
      filtrosVentaDestino.push(`AND tv.id_punto_venta_dest = $${params.length}`);
      filtrosCaja.push(`AND c.id_punto_venta = $${params.length}`);
    }

    if (id_invitado) {
      params.push(normalizarTexto(id_invitado));
      filtrosVentaOrigen.push(filtroPuntoVentaAutorizado('tv', params.length));
      filtrosVentaOrigen.push(`AND tv.ctrl_crea_us = $${params.length}`);
      filtrosVentaDestino.push(filtroPuntoVentaAutorizado('tv', params.length, 'id_punto_venta_dest'));
      filtrosVentaDestino.push(`AND tv.entrega_ctrl_us = $${params.length}`);
      filtrosCaja.push(filtroPuntoVentaAutorizado('c', params.length));
      filtrosCaja.push(`AND c.id_invitado = $${params.length}`);
    }

    if (fecha_desde) {
      params.push(fecha_desde);
      filtrosVentaOrigen.push(`AND tv.r_fecemi >= $${params.length}::date`);
      filtrosVentaDestino.push(`AND tv.entrega_fecha::date >= $${params.length}::date`);
      filtrosCaja.push(`AND c.fecha::date >= $${params.length}::date`);
    }

    if (fecha_hasta) {
      params.push(fecha_hasta);
      filtrosVentaOrigen.push(`AND tv.r_fecemi <= $${params.length}::date`);
      filtrosVentaDestino.push(`AND tv.entrega_fecha::date <= $${params.length}::date`);
      filtrosCaja.push(`AND c.fecha::date <= $${params.length}::date`);
    }

    if (id_forma_pago) {
      params.push(normalizarTexto(id_forma_pago));
      filtrosCaja.push(`AND c.id_forma_pago = $${params.length}`);
    }

    const result = await pool.query(`
      WITH movimientos AS (
        SELECT
          tv.r_fecemi::timestamp AS fecha,
          tv.id_punto_venta,
          'I'::char(1) AS tipo_movimiento,
          COALESCE(tv.r_monto_total, 0)::numeric AS importe,
          COALESCE(tv.registrado, 1)::integer AS registrado,
          'ENCOMIENDA'::varchar AS origen
        FROM mve_transventa tv
        WHERE tv.id_usuario = $1
          AND tv.documento_id = $2
          AND tv.periodo = $3
          AND tv.tipo_operacion = 'E'
          AND NOT (${condicionPorCobrarVentaSql})
          ${filtrosVentaOrigen.join('\n')}

        UNION ALL

        SELECT
          tv.entrega_fecha::timestamp AS fecha,
          tv.id_punto_venta_dest AS id_punto_venta,
          'I'::char(1) AS tipo_movimiento,
          COALESCE(tv.r_monto_total, 0)::numeric AS importe,
          COALESCE(tv.registrado, 1)::integer AS registrado,
          'ENCOMIENDA_POR_COBRAR_ENTREGADA'::varchar AS origen
        FROM mve_transventa tv
        WHERE tv.id_usuario = $1
          AND tv.documento_id = $2
          AND tv.periodo = $3
          AND tv.tipo_operacion = 'E'
          AND ${condicionPorCobrarVentaSql}
          AND tv.entrega_fecha IS NOT NULL
          ${filtrosVentaDestino.join('\n')}

        UNION ALL

        SELECT
          c.fecha,
          c.id_punto_venta,
          c.tipo_movimiento,
          c.importe,
          c.registrado,
          'CAJA'::varchar AS origen
        FROM mve_transcaja c
        WHERE c.id_usuario = $1
          AND c.documento_id = $2
          AND c.periodo = $3
          ${filtrosCaja.join('\n')}
      )
      SELECT
        COALESCE(SUM(CASE WHEN tipo_movimiento = 'I' THEN importe * registrado ELSE 0 END), 0)::numeric AS total_ingresos,
        COALESCE(SUM(CASE WHEN tipo_movimiento = 'S' THEN importe * registrado ELSE 0 END), 0)::numeric AS total_salidas,
        COALESCE(SUM(CASE
          WHEN tipo_movimiento = 'I' THEN importe * registrado
          WHEN tipo_movimiento = 'S' THEN (importe * registrado) * -1
          ELSE 0
        END), 0)::numeric AS neto
      FROM movimientos
    `, params);

    const data = result.rows[0] || {};
    return res.status(200).json({
      success: true,
      data: {
        total_ingresos: Number(data.total_ingresos || 0),
        total_salidas: Number(data.total_salidas || 0),
        neto: Number(data.neto || 0)
      }
    });
  } catch (error) {
    return responderError(res, error, 'Error al obtener consolidado de caja:');
  }
};

const listarIngresosEncomiendasCaja = async (req, res) => {
  const { periodo, id_anfitrion, documento_id } = req.params;
  const { id_punto_venta, fecha_desde, fecha_hasta, id_invitado } = req.query;

  if (!periodo || !id_anfitrion || !documento_id) {
    return res.status(400).json({ success: false, message: 'Faltan parametros requeridos para ingresos de caja' });
  }

  try {
    const params = [id_anfitrion, documento_id, periodo];
    const filtrosVentaOrigen = [];
    const filtrosVentaOrigenReferencia = [];
    const filtrosVentaDestino = [];
    const filtrosVentaDestinoPendiente = [];

    if (id_punto_venta) {
      params.push(normalizarCodigo(id_punto_venta));
      filtrosVentaOrigen.push(`AND tv.id_punto_venta = $${params.length}`);
      filtrosVentaOrigenReferencia.push(`AND tv.id_punto_venta = $${params.length}`);
      filtrosVentaDestino.push(`AND tv.id_punto_venta_dest = $${params.length}`);
      filtrosVentaDestinoPendiente.push(`AND tv.id_punto_venta_dest = $${params.length}`);
    }

    if (id_invitado) {
      params.push(normalizarTexto(id_invitado));
      filtrosVentaOrigen.push(filtroPuntoVentaAutorizado('tv', params.length));
      filtrosVentaOrigen.push(`AND tv.ctrl_crea_us = $${params.length}`);
      filtrosVentaOrigenReferencia.push(filtroPuntoVentaAutorizado('tv', params.length));
      filtrosVentaOrigenReferencia.push(`AND tv.ctrl_crea_us = $${params.length}`);
      filtrosVentaDestino.push(filtroPuntoVentaAutorizado('tv', params.length, 'id_punto_venta_dest'));
      filtrosVentaDestino.push(`AND tv.entrega_ctrl_us = $${params.length}`);
      filtrosVentaDestinoPendiente.push(filtroPuntoVentaAutorizado('tv', params.length, 'id_punto_venta_dest'));
    }

    if (fecha_desde) {
      params.push(fecha_desde);
      filtrosVentaOrigen.push(`AND tv.r_fecemi >= $${params.length}::date`);
      filtrosVentaOrigenReferencia.push(`AND tv.r_fecemi >= $${params.length}::date`);
      filtrosVentaDestino.push(`AND tv.entrega_fecha::date >= $${params.length}::date`);
      filtrosVentaDestinoPendiente.push(`AND tv.r_fecemi >= $${params.length}::date`);
    }

    if (fecha_hasta) {
      params.push(fecha_hasta);
      filtrosVentaOrigen.push(`AND tv.r_fecemi <= $${params.length}::date`);
      filtrosVentaOrigenReferencia.push(`AND tv.r_fecemi <= $${params.length}::date`);
      filtrosVentaDestino.push(`AND tv.entrega_fecha::date <= $${params.length}::date`);
      filtrosVentaDestinoPendiente.push(`AND tv.r_fecemi <= $${params.length}::date`);
    }

    const result = await pool.query(`
      SELECT *
        FROM (
          SELECT
            TO_CHAR(COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp), 'YYYY-MM-DD HH24:MI') AS fecha_caja,
            'ORIGEN'::varchar AS tipo_ingreso,
            tv.id_punto_venta AS id_punto_venta_caja,
            punto_caja.nombre AS punto_venta_caja_nombre,
            tv.id_punto_venta AS id_punto_venta_origen,
            punto_origen.nombre AS punto_venta_origen_nombre,
            tv.id_punto_venta_dest,
            punto_destino.nombre AS punto_venta_dest_nombre,
            tv.r_cod,
            tv.r_serie,
            tv.r_numero,
            tv.elemento,
            tv.condicion_pago,
            tv.r_monto_total,
            tv.cliente,
            tv.destinatario,
            tv.descripcion,
            tv.ctrl_crea_us AS id_operador_caja,
            COALESCE(tv.registrado, 1)::integer AS registrado,
            (COALESCE(tv.registrado, 1) = 1)::boolean AS contabiliza,
            CASE WHEN COALESCE(tv.registrado, 1) = 0 THEN 'Anulado' ELSE '' END::varchar AS observacion_caja
          FROM mve_transventa tv
          LEFT JOIN mad_punto_venta punto_caja
            ON punto_caja.id_usuario = tv.id_usuario
           AND punto_caja.documento_id = tv.documento_id
           AND punto_caja.id_punto_venta = tv.id_punto_venta
          LEFT JOIN mad_punto_venta punto_origen
            ON punto_origen.id_usuario = tv.id_usuario
           AND punto_origen.documento_id = tv.documento_id
           AND punto_origen.id_punto_venta = tv.id_punto_venta
          LEFT JOIN mad_punto_venta punto_destino
            ON punto_destino.id_usuario = tv.id_usuario
           AND punto_destino.documento_id = tv.documento_id
           AND punto_destino.id_punto_venta = tv.id_punto_venta_dest
          WHERE tv.id_usuario = $1
            AND tv.documento_id = $2
            AND tv.periodo = $3
            AND tv.tipo_operacion = 'E'
            AND NOT (${condicionPorCobrarVentaSql})
            ${filtrosVentaOrigen.join('\n')}

          UNION ALL

          SELECT
            TO_CHAR(COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp), 'YYYY-MM-DD HH24:MI') AS fecha_caja,
            'ORIGEN_POR_COBRAR_REFERENCIA'::varchar AS tipo_ingreso,
            tv.id_punto_venta AS id_punto_venta_caja,
            punto_caja.nombre AS punto_venta_caja_nombre,
            tv.id_punto_venta AS id_punto_venta_origen,
            punto_origen.nombre AS punto_venta_origen_nombre,
            tv.id_punto_venta_dest,
            punto_destino.nombre AS punto_venta_dest_nombre,
            tv.r_cod,
            tv.r_serie,
            tv.r_numero,
            tv.elemento,
            tv.condicion_pago,
            tv.r_monto_total,
            tv.cliente,
            tv.destinatario,
            tv.descripcion,
            tv.ctrl_crea_us AS id_operador_caja,
            COALESCE(tv.registrado, 1)::integer AS registrado,
            false AS contabiliza,
            CASE
              WHEN COALESCE(tv.registrado, 1) = 0 THEN 'Anulado - no aplica'
              ELSE 'Cobrar en Destino'
            END::varchar AS observacion_caja
          FROM mve_transventa tv
          LEFT JOIN mad_punto_venta punto_caja
            ON punto_caja.id_usuario = tv.id_usuario
           AND punto_caja.documento_id = tv.documento_id
           AND punto_caja.id_punto_venta = tv.id_punto_venta
          LEFT JOIN mad_punto_venta punto_origen
            ON punto_origen.id_usuario = tv.id_usuario
           AND punto_origen.documento_id = tv.documento_id
           AND punto_origen.id_punto_venta = tv.id_punto_venta
          LEFT JOIN mad_punto_venta punto_destino
            ON punto_destino.id_usuario = tv.id_usuario
           AND punto_destino.documento_id = tv.documento_id
           AND punto_destino.id_punto_venta = tv.id_punto_venta_dest
          WHERE tv.id_usuario = $1
            AND tv.documento_id = $2
            AND tv.periodo = $3
            AND tv.tipo_operacion = 'E'
            AND ${condicionPorCobrarVentaSql}
            ${filtrosVentaOrigenReferencia.join('\n')}

          UNION ALL

          SELECT
            TO_CHAR(tv.entrega_fecha::timestamp, 'YYYY-MM-DD HH24:MI') AS fecha_caja,
            'DESTINO_POR_COBRAR'::varchar AS tipo_ingreso,
            tv.id_punto_venta_dest AS id_punto_venta_caja,
            punto_caja.nombre AS punto_venta_caja_nombre,
            tv.id_punto_venta AS id_punto_venta_origen,
            punto_origen.nombre AS punto_venta_origen_nombre,
            tv.id_punto_venta_dest,
            punto_destino.nombre AS punto_venta_dest_nombre,
            tv.r_cod,
            tv.r_serie,
            tv.r_numero,
            tv.elemento,
            tv.condicion_pago,
            tv.r_monto_total,
            tv.cliente,
            tv.destinatario,
            tv.descripcion,
            tv.entrega_ctrl_us AS id_operador_caja,
            COALESCE(tv.registrado, 1)::integer AS registrado,
            (COALESCE(tv.registrado, 1) = 1)::boolean AS contabiliza,
            CASE WHEN COALESCE(tv.registrado, 1) = 0 THEN 'Anulado' ELSE '' END::varchar AS observacion_caja
          FROM mve_transventa tv
          LEFT JOIN mad_punto_venta punto_caja
            ON punto_caja.id_usuario = tv.id_usuario
           AND punto_caja.documento_id = tv.documento_id
           AND punto_caja.id_punto_venta = tv.id_punto_venta_dest
          LEFT JOIN mad_punto_venta punto_origen
            ON punto_origen.id_usuario = tv.id_usuario
           AND punto_origen.documento_id = tv.documento_id
           AND punto_origen.id_punto_venta = tv.id_punto_venta
          LEFT JOIN mad_punto_venta punto_destino
            ON punto_destino.id_usuario = tv.id_usuario
           AND punto_destino.documento_id = tv.documento_id
           AND punto_destino.id_punto_venta = tv.id_punto_venta_dest
          WHERE tv.id_usuario = $1
            AND tv.documento_id = $2
            AND tv.periodo = $3
            AND tv.tipo_operacion = 'E'
            AND ${condicionPorCobrarVentaSql}
            AND tv.entrega_fecha IS NOT NULL
            ${filtrosVentaDestino.join('\n')}

          UNION ALL

          SELECT
            TO_CHAR(COALESCE(tv.ctrl_crea, tv.r_fecemi::timestamp), 'YYYY-MM-DD HH24:MI') AS fecha_caja,
            'DESTINO_POR_COBRAR_PENDIENTE'::varchar AS tipo_ingreso,
            tv.id_punto_venta_dest AS id_punto_venta_caja,
            punto_caja.nombre AS punto_venta_caja_nombre,
            tv.id_punto_venta AS id_punto_venta_origen,
            punto_origen.nombre AS punto_venta_origen_nombre,
            tv.id_punto_venta_dest,
            punto_destino.nombre AS punto_venta_dest_nombre,
            tv.r_cod,
            tv.r_serie,
            tv.r_numero,
            tv.elemento,
            tv.condicion_pago,
            tv.r_monto_total,
            tv.cliente,
            tv.destinatario,
            tv.descripcion,
            tv.ctrl_crea_us AS id_operador_caja,
            COALESCE(tv.registrado, 1)::integer AS registrado,
            false AS contabiliza,
            CASE
              WHEN COALESCE(tv.registrado, 1) = 0 THEN 'Anulado - no contabiliza'
              ELSE 'No contabiliza'
            END::varchar AS observacion_caja
          FROM mve_transventa tv
          LEFT JOIN mad_punto_venta punto_caja
            ON punto_caja.id_usuario = tv.id_usuario
           AND punto_caja.documento_id = tv.documento_id
           AND punto_caja.id_punto_venta = tv.id_punto_venta_dest
          LEFT JOIN mad_punto_venta punto_origen
            ON punto_origen.id_usuario = tv.id_usuario
           AND punto_origen.documento_id = tv.documento_id
           AND punto_origen.id_punto_venta = tv.id_punto_venta
          LEFT JOIN mad_punto_venta punto_destino
            ON punto_destino.id_usuario = tv.id_usuario
           AND punto_destino.documento_id = tv.documento_id
           AND punto_destino.id_punto_venta = tv.id_punto_venta_dest
          WHERE tv.id_usuario = $1
            AND tv.documento_id = $2
            AND tv.periodo = $3
            AND tv.tipo_operacion = 'E'
            AND ${condicionPorCobrarVentaSql}
            AND tv.entrega_fecha IS NULL
            ${filtrosVentaDestinoPendiente.join('\n')}
        ) ingresos
       ORDER BY fecha_caja DESC, r_serie, r_numero DESC, elemento
    `, params);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    return responderError(res, error, 'Error al obtener ingresos de encomiendas de caja:');
  }
};

module.exports = {
  listarMotivosCaja,
  crearMotivoCaja,
  actualizarMotivoCaja,
  actualizarEstadoMotivoCaja,
  listarFormasPagoCaja,
  listarMovimientosCaja,
  obtenerMovimientoCaja,
  crearMovimientoCaja,
  actualizarMovimientoCaja,
  anularMovimientoCaja,
  obtenerConsolidadoCaja,
  listarIngresosEncomiendasCaja
};
