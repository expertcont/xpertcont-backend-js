const pool = require('../db');

const columnasVentaTrans = `
  CAST(r_fecemi AS VARCHAR(50)) AS r_fecemi,
  r_cod,
  r_serie,
  r_numero,
  elemento,
  tipo_operacion,
  r_cod_ref,
  r_serie_ref,
  r_numero_ref,
  CAST(r_fecemi_ref AS VARCHAR(50)) AS r_fecemi_ref,
  id_documento,
  cliente,
  cliente_documento,
  cliente_telefono,
  id_origen,
  id_destino,
  id_servicio,
  descripcion,
  id_punto_venta,
  id_punto_venta_dest,
  placa,
  licencia,
  asiento,
  pasajero_edad,
  destinatario,
  destinatario_documento,
  destinatario_telefono,
  destinatario_direccion,
  CAST(entrega_fecha AS VARCHAR(50)) AS entrega_fecha,
  entrega_documento,
  entrega_nombres,
  entrega_ctrl_us,
  cantidad,
  precio_unitario,
  precio_neto,
  r_gravado,
  r_exonerado,
  r_igv,
  r_monto_total,
  porc_igv,
  numero_rdi,
  estado_sunat,
  ctrl_crea,
  ctrl_crea_us,
  ctrl_mod,
  ctrl_mod_us
`;

const validarTipoOperacion = (tipoOperacion) => ['B', 'E'].includes(tipoOperacion);

const calcularTributosTransporte = ({
  tipo_operacion,
  cantidad,
  precio_unitario,
  precio_neto,
  r_gravado,
  r_exonerado,
  r_igv,
  r_monto_total,
  porc_igv,
}) => {
  const cantidadNum = Number(cantidad || 1);
  const precioUnitarioNum = Number(precio_unitario || 0);
  const total = Number(precio_neto ?? (cantidadNum * precioUnitarioNum));
  const igvPorcentaje = Number(porc_igv ?? 18);

  if (
    r_gravado !== undefined ||
    r_exonerado !== undefined ||
    r_igv !== undefined ||
    r_monto_total !== undefined
  ) {
    return {
      precio_neto: precio_neto ?? total,
      r_gravado: r_gravado ?? 0,
      r_exonerado: r_exonerado ?? 0,
      r_igv: r_igv ?? 0,
      r_monto_total: r_monto_total ?? total,
      porc_igv: porc_igv ?? (tipo_operacion === 'E' ? igvPorcentaje : 0),
    };
  }

  if (tipo_operacion === 'E') {
    const base = Number((total / (1 + igvPorcentaje / 100)).toFixed(2));
    const igv = Number((total - base).toFixed(2));

    return {
      precio_neto: total,
      r_gravado: base,
      r_exonerado: 0,
      r_igv: igv,
      r_monto_total: total,
      porc_igv: igvPorcentaje,
    };
  }

  return {
    precio_neto: total,
    r_gravado: 0,
    r_exonerado: total,
    r_igv: 0,
    r_monto_total: total,
    porc_igv: 0,
  };
};

const crearVentaTrans = async (req, res) => {
  const {
    id_anfitrion, documento_id, periodo,
    r_cod, r_serie, r_numero, elemento, r_fecemi,
    tipo_operacion,
    r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
    id_documento, cliente, cliente_documento, cliente_telefono,
    id_origen, id_destino, id_servicio, descripcion,
    id_punto_venta, id_punto_venta_dest,
    placa, licencia,
    asiento, pasajero_edad,
    destinatario, destinatario_documento,
    destinatario_telefono, destinatario_direccion,
    cantidad, precio_unitario, precio_neto,
    r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
    numero_rdi, estado_sunat,
    ctrl_crea_us
  } = req.body;

  if (
    !id_anfitrion || !documento_id || !periodo ||
    !r_cod || !r_serie || !r_numero ||
    elemento === undefined || !r_fecemi || !tipo_operacion
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para crear operacion de transporte'
    });
  }

  if (!validarTipoOperacion(tipo_operacion)) {
    return res.status(400).json({
      success: false,
      message: 'Tipo de operacion no valido. Use B=Boleto o E=Encomienda'
    });
  }

  if (tipo_operacion === 'B' && !asiento) {
    return res.status(400).json({
      success: false,
      message: 'El asiento es requerido para un boleto'
    });
  }

  if (tipo_operacion === 'E' && !destinatario) {
    return res.status(400).json({
      success: false,
      message: 'El destinatario es requerido para una encomienda'
    });
  }

  const tributos = calcularTributosTransporte({
    tipo_operacion,
    cantidad,
    precio_unitario,
    precio_neto,
    r_gravado,
    r_exonerado,
    r_igv,
    r_monto_total,
    porc_igv,
  });

  try {
    const query = `
      INSERT INTO mve_ventatrans (
        id_usuario, documento_id, periodo,
        r_cod, r_serie, r_numero, elemento, r_fecemi,
        tipo_operacion,
        r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
        id_documento, cliente, cliente_documento, cliente_telefono,
        id_origen, id_destino, id_servicio, descripcion,
        id_punto_venta, id_punto_venta_dest,
        placa, licencia,
        asiento, pasajero_edad,
        destinatario, destinatario_documento,
        destinatario_telefono, destinatario_direccion,
        cantidad, precio_unitario, precio_neto,
        r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
        numero_rdi, estado_sunat,
        ctrl_crea, ctrl_crea_us
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,$20,$21,
        $22,$23,$24,$25,
        $26,$27,
        $28,$29,$30,$31,
        $32,$33,$34,
        $35,$36,$37,$38,$39,
        $40,$41,
        CURRENT_TIMESTAMP,$42
      )
      RETURNING ${columnasVentaTrans}
    `;

    const params = [
      id_anfitrion, documento_id, periodo,
      r_cod, r_serie, r_numero, elemento, r_fecemi,
      tipo_operacion,
      r_cod_ref || null, r_serie_ref || null,
      r_numero_ref || null, r_fecemi_ref || null,
      id_documento || null, cliente || null,
      cliente_documento || null, cliente_telefono || null,
      id_origen || null, id_destino || null,
      id_servicio || null, descripcion || null,
      id_punto_venta || null, id_punto_venta_dest || null,
      placa || null, licencia || null,
      asiento || null, pasajero_edad ?? null,
      destinatario || null, destinatario_documento || null,
      destinatario_telefono || null, destinatario_direccion || null,
      cantidad ?? 1, precio_unitario ?? 0, tributos.precio_neto,
      tributos.r_gravado, tributos.r_exonerado, tributos.r_igv,
      tributos.r_monto_total, tributos.porc_igv,
      numero_rdi || null, estado_sunat || null,
      ctrl_crea_us || null
    ];

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear operacion de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerVentasTrans = async (req, res) => {
  const { periodo, id_anfitrion, documento_id, dia } = req.params;

  if (!periodo || !id_anfitrion || !documento_id || dia === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener operaciones de transporte'
    });
  }

  try {
    let query = `
      SELECT ${columnasVentaTrans}
        FROM mve_ventatrans
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
    `;

    const params = [periodo, id_anfitrion, documento_id];

    if (dia !== '*') {
      query += ` AND r_fecemi = $4 `;
      params.push(`${periodo}-${dia}`);
    }

    query += `
      ORDER BY r_fecemi DESC, r_serie, r_numero DESC, elemento
    `;

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error al obtener operaciones de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const obtenerVentaTrans = async (req, res) => {
  const {
    periodo, id_anfitrion, documento_id,
    cod, serie, num, elem
  } = req.params;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !cod || !serie || !num || elem === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para obtener operacion de transporte'
    });
  }

  try {
    const query = `
      SELECT ${columnasVentaTrans}
        FROM mve_ventatrans
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
    `;

    const result = await pool.query(query, [
      periodo, id_anfitrion, documento_id,
      cod, serie, num, elem
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Operacion de transporte no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al obtener operacion de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const actualizarVentaTrans = async (req, res) => {
  const {
    periodo, id_anfitrion, documento_id,
    r_cod, r_serie, r_numero, elemento,
    r_fecemi, tipo_operacion,
    r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
    id_documento, cliente, cliente_documento, cliente_telefono,
    id_origen, id_destino, id_servicio, descripcion,
    id_punto_venta, id_punto_venta_dest,
    placa, licencia,
    asiento, pasajero_edad,
    destinatario, destinatario_documento,
    destinatario_telefono, destinatario_direccion,
    cantidad, precio_unitario, precio_neto,
    r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
    numero_rdi, estado_sunat,
    ctrl_mod_us
  } = req.body;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !r_cod || !r_serie || !r_numero ||
    elemento === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para actualizar operacion de transporte'
    });
  }

  if (tipo_operacion && !validarTipoOperacion(tipo_operacion)) {
    return res.status(400).json({
      success: false,
      message: 'Tipo de operacion no valido. Use B=Boleto o E=Encomienda'
    });
  }

  try {
    const query = `
      UPDATE mve_ventatrans
         SET r_fecemi = COALESCE(NULLIF($8, '')::date, r_fecemi),
             tipo_operacion = COALESCE($9, tipo_operacion),
             r_cod_ref = COALESCE($10, r_cod_ref),
             r_serie_ref = COALESCE($11, r_serie_ref),
             r_numero_ref = COALESCE($12, r_numero_ref),
             r_fecemi_ref = COALESCE(NULLIF($13, '')::date, r_fecemi_ref),
             id_documento = COALESCE($14, id_documento),
             cliente = COALESCE($15, cliente),
             cliente_documento = COALESCE($16, cliente_documento),
             cliente_telefono = COALESCE($17, cliente_telefono),
             id_origen = COALESCE($18, id_origen),
             id_destino = COALESCE($19, id_destino),
             id_servicio = COALESCE($20, id_servicio),
             descripcion = COALESCE($21, descripcion),
             id_punto_venta = COALESCE($22, id_punto_venta),
             id_punto_venta_dest = COALESCE($23, id_punto_venta_dest),
             placa = COALESCE($24, placa),
             licencia = COALESCE($25, licencia),
             asiento = COALESCE($26, asiento),
             pasajero_edad = COALESCE($27::integer, pasajero_edad),
             destinatario = COALESCE($28, destinatario),
             destinatario_documento = COALESCE($29, destinatario_documento),
             destinatario_telefono = COALESCE($30, destinatario_telefono),
             destinatario_direccion = COALESCE($31, destinatario_direccion),
             cantidad = COALESCE($32::numeric, cantidad),
             precio_unitario = COALESCE($33::numeric, precio_unitario),
             precio_neto = COALESCE($34::numeric, precio_neto),
             r_gravado = COALESCE($35::numeric, r_gravado),
             r_exonerado = COALESCE($36::numeric, r_exonerado),
             r_igv = COALESCE($37::numeric, r_igv),
             r_monto_total = COALESCE($38::numeric, r_monto_total),
             porc_igv = COALESCE($39::numeric, porc_igv),
             numero_rdi = COALESCE($40, numero_rdi),
             estado_sunat = COALESCE($41, estado_sunat),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($42, ctrl_mod_us)
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
       RETURNING ${columnasVentaTrans}
    `;

    const params = [
      periodo, id_anfitrion, documento_id,
      r_cod, r_serie, r_numero, elemento,
      r_fecemi, tipo_operacion,
      r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
      id_documento, cliente, cliente_documento, cliente_telefono,
      id_origen, id_destino, id_servicio, descripcion,
      id_punto_venta, id_punto_venta_dest,
      placa, licencia,
      asiento, pasajero_edad,
      destinatario, destinatario_documento,
      destinatario_telefono, destinatario_direccion,
      cantidad, precio_unitario, precio_neto,
      r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
      numero_rdi, estado_sunat, ctrl_mod_us
    ];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Operacion de transporte no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar operacion de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const eliminarVentaTrans = async (req, res) => {
  const {
    periodo, id_anfitrion, documento_id,
    cod, serie, num, elem
  } = req.params;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !cod || !serie || !num || elem === undefined
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para eliminar operacion de transporte'
    });
  }

  try {
    const query = `
      DELETE FROM mve_ventatrans
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
       RETURNING r_cod, r_serie, r_numero, elemento
    `;

    const result = await pool.query(query, [
      periodo, id_anfitrion, documento_id,
      cod, serie, num, elem
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Operacion de transporte no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Operacion de transporte eliminada correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al eliminar operacion de transporte:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

const registrarEntregaEncomienda = async (req, res) => {
  const {
    periodo,
    id_anfitrion,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    entrega_fecha,
    entrega_documento,
    entrega_nombres,
    entrega_ctrl_us
  } = req.body;

  if (
    !periodo || !id_anfitrion || !documento_id ||
    !r_cod || !r_serie || !r_numero ||
    elemento === undefined ||
    !entrega_fecha || !entrega_documento || !entrega_nombres
  ) {
    return res.status(400).json({
      success: false,
      message: 'Faltan parametros requeridos para registrar entrega'
    });
  }

  try {
    const query = `
      UPDATE mve_ventatrans
         SET entrega_fecha = $8::date,
             entrega_documento = $9,
             entrega_nombres = $10,
             entrega_ctrl_us = $11,
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = $11
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND tipo_operacion = 'E'
       RETURNING ${columnasVentaTrans}
    `;

    const result = await pool.query(query, [
      periodo, id_anfitrion, documento_id,
      r_cod, r_serie, r_numero, elemento,
      entrega_fecha, entrega_documento,
      entrega_nombres, entrega_ctrl_us
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Encomienda no encontrada'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al registrar entrega de encomienda:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
    });
  }
};

module.exports = {
  crearVentaTrans,
  obtenerVentasTrans,
  obtenerVentaTrans,
  actualizarVentaTrans,
  eliminarVentaTrans,
  registrarEntregaEncomienda
};
