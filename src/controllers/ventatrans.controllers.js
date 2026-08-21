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
  id_punto_venta,
  remitente_zona,
  remitente_direccion,
  id_ruta,
  descripcion,
  placa,
  licencia,
  asiento,
  pasajero_edad,
  destinatario,
  destinatario_documento,
  destinatario_telefono,
  id_punto_venta_dest,
  destinatario_zona,
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
  condicion_pago,
  CAST(llegada_aprox AS VARCHAR(50)) AS llegada_aprox,
  numero_rdi,
  estado_sunat,
  ctrl_crea,
  ctrl_crea_us,
  ctrl_mod,
  ctrl_mod_us
`;

const validarTipoOperacion = (tipoOperacion) => ['B', 'E'].includes(tipoOperacion);

const generarNumeroVentaTrans = async ({
  id_anfitrion,
  documento_id,
  periodo,
  r_cod,
  r_serie,
}) => {
  const query = `
    SELECT LPAD((COALESCE(MAX(r_numero::integer), 0) + 1)::text, 10, '0') AS r_numero
      FROM mve_transventa
     WHERE id_usuario = $1
       AND documento_id = $2
       AND periodo = $3
       AND r_cod = $4
       AND r_serie = $5
       AND r_numero ~ '^[0-9]+$'
  `;

  const result = await pool.query(query, [
    id_anfitrion,
    documento_id,
    periodo,
    r_cod,
    r_serie,
  ]);

  return result.rows[0]?.r_numero || '0000000001';
};

const obtenerRutaTransporte = async ({
  id_anfitrion,
  documento_id,
  id_ruta,
}) => {
  if (!id_anfitrion || !documento_id || !id_ruta) {
    return null;
  }

  const result = await pool.query(`
    SELECT id_ruta, id_punto_venta, id_punto_venta_dest
      FROM mve_transruta
     WHERE id_usuario = $1
       AND documento_id = $2
       AND id_ruta = $3
  `, [id_anfitrion, documento_id, id_ruta]);

  return result.rows[0] || null;
};

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
  const total = Number(precio_neto ?? r_monto_total ?? (cantidadNum * precioUnitarioNum));
  const igvPorcentaje = Number(porc_igv ?? 18);

  if (
    r_gravado !== undefined ||
    r_exonerado !== undefined ||
    r_igv !== undefined
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
    id_punto_venta, remitente_zona, remitente_direccion,
    id_ruta, descripcion,
    placa, licencia,
    asiento, pasajero_edad,
    destinatario, destinatario_documento,
    destinatario_telefono, id_punto_venta_dest,
    destinatario_zona, destinatario_direccion,
    cantidad, precio_unitario, precio_neto,
    r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
    condicion_pago, llegada_aprox, numero_rdi, estado_sunat,
    ctrl_crea_us
  } = req.body;

  const rCodFinal = r_cod || '03';
  const rSerieFinal = r_serie || 'B001';
  const elementoFinal = elemento ?? 1;

  if (
    !id_anfitrion || !documento_id || !periodo ||
    !rCodFinal || !rSerieFinal ||
    elementoFinal === undefined || !r_fecemi || !tipo_operacion
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

  if (!id_ruta) {
    return res.status(400).json({
      success: false,
      message: 'La ruta es requerida para la operacion de transporte'
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
    const rutaTransporte = await obtenerRutaTransporte({
      id_anfitrion,
      documento_id,
      id_ruta,
    });

    if (!rutaTransporte) {
      return res.status(400).json({
        success: false,
        message: 'La ruta indicada no existe para la empresa seleccionada'
      });
    }

    const idPuntoVentaFinal = id_punto_venta || rutaTransporte.id_punto_venta;
    const idPuntoVentaDestFinal = id_punto_venta_dest || rutaTransporte.id_punto_venta_dest;

    const rNumeroFinal = r_numero || await generarNumeroVentaTrans({
      id_anfitrion,
      documento_id,
      periodo,
      r_cod: rCodFinal,
      r_serie: rSerieFinal,
    });

    const query = `
      INSERT INTO mve_transventa (
        id_usuario, documento_id, periodo,
        r_cod, r_serie, r_numero, elemento, r_fecemi,
        tipo_operacion,
        r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
        id_documento, cliente, cliente_documento, cliente_telefono,
        id_punto_venta, remitente_zona, remitente_direccion,
        id_ruta, descripcion,
        placa, licencia,
        asiento, pasajero_edad,
        destinatario, destinatario_documento,
        destinatario_telefono, id_punto_venta_dest,
        destinatario_zona, destinatario_direccion,
        cantidad, precio_unitario, precio_neto,
        r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
        condicion_pago, llegada_aprox, numero_rdi, estado_sunat,
        ctrl_crea, ctrl_crea_us
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,$20,
        $21,$22,
        $23,$24,
        $25,$26,
        $27,$28,$29,$30,$31,$32,
        $33,$34,$35,
        $36,$37,$38,$39,$40,
        $41,$42,$43,$44,
        CURRENT_TIMESTAMP,$45
      )
      RETURNING ${columnasVentaTrans}
    `;

    const params = [
      id_anfitrion, documento_id, periodo,
      rCodFinal, rSerieFinal, rNumeroFinal, elementoFinal, r_fecemi,
      tipo_operacion,
      r_cod_ref || null, r_serie_ref || null,
      r_numero_ref || null, r_fecemi_ref || null,
      id_documento || null, cliente || null,
      cliente_documento || null, cliente_telefono || null,
      idPuntoVentaFinal || null, remitente_zona || null, remitente_direccion || null,
      id_ruta || null, descripcion || null,
      placa || null, licencia || null,
      asiento || null, pasajero_edad ?? null,
      destinatario || null, destinatario_documento || null,
      destinatario_telefono || null, idPuntoVentaDestFinal || null,
      destinatario_zona || null, destinatario_direccion || null,
      cantidad ?? 1, precio_unitario ?? 0, tributos.precio_neto,
      tributos.r_gravado, tributos.r_exonerado, tributos.r_igv,
      tributos.r_monto_total, tributos.porc_igv,
      condicion_pago || null, llegada_aprox || null,
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
        FROM mve_transventa
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
        FROM mve_transventa
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
    id_punto_venta, remitente_zona, remitente_direccion,
    id_ruta, descripcion,
    placa, licencia,
    asiento, pasajero_edad,
    destinatario, destinatario_documento,
    destinatario_telefono, id_punto_venta_dest,
    destinatario_zona, destinatario_direccion,
    cantidad, precio_unitario, precio_neto,
    r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
    condicion_pago, llegada_aprox, numero_rdi, estado_sunat,
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
    const rutaTransporte = id_ruta ? await obtenerRutaTransporte({
      id_anfitrion,
      documento_id,
      id_ruta,
    }) : null;

    if (id_ruta && !rutaTransporte) {
      return res.status(400).json({
        success: false,
        message: 'La ruta indicada no existe para la empresa seleccionada'
      });
    }

    const idPuntoVentaFinal = id_punto_venta || rutaTransporte?.id_punto_venta || null;
    const idPuntoVentaDestFinal = id_punto_venta_dest || rutaTransporte?.id_punto_venta_dest || null;

    const query = `
      UPDATE mve_transventa
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
             id_punto_venta = COALESCE($18, id_punto_venta),
             remitente_zona = COALESCE($19, remitente_zona),
             remitente_direccion = COALESCE($20, remitente_direccion),
             id_ruta = COALESCE($21, id_ruta),
             descripcion = COALESCE($22, descripcion),
             placa = COALESCE($23, placa),
             licencia = COALESCE($24, licencia),
             asiento = COALESCE($25, asiento),
             pasajero_edad = COALESCE($26::integer, pasajero_edad),
             destinatario = COALESCE($27, destinatario),
             destinatario_documento = COALESCE($28, destinatario_documento),
             destinatario_telefono = COALESCE($29, destinatario_telefono),
             id_punto_venta_dest = COALESCE($30, id_punto_venta_dest),
             destinatario_zona = COALESCE($31, destinatario_zona),
             destinatario_direccion = COALESCE($32, destinatario_direccion),
             cantidad = COALESCE($33::numeric, cantidad),
             precio_unitario = COALESCE($34::numeric, precio_unitario),
             precio_neto = COALESCE($35::numeric, precio_neto),
             r_gravado = COALESCE($36::numeric, r_gravado),
             r_exonerado = COALESCE($37::numeric, r_exonerado),
             r_igv = COALESCE($38::numeric, r_igv),
             r_monto_total = COALESCE($39::numeric, r_monto_total),
             porc_igv = COALESCE($40::numeric, porc_igv),
             condicion_pago = COALESCE($41, condicion_pago),
             llegada_aprox = COALESCE(NULLIF($42, '')::time, llegada_aprox),
             numero_rdi = COALESCE($43, numero_rdi),
             estado_sunat = COALESCE($44, estado_sunat),
             ctrl_mod = CURRENT_TIMESTAMP,
             ctrl_mod_us = COALESCE($45, ctrl_mod_us)
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
      idPuntoVentaFinal, remitente_zona, remitente_direccion,
      id_ruta, descripcion,
      placa, licencia,
      asiento, pasajero_edad,
      destinatario, destinatario_documento,
      destinatario_telefono, idPuntoVentaDestFinal,
      destinatario_zona, destinatario_direccion,
      cantidad, precio_unitario, precio_neto,
      r_gravado, r_exonerado, r_igv, r_monto_total, porc_igv,
      condicion_pago, llegada_aprox, numero_rdi, estado_sunat, ctrl_mod_us
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
      DELETE FROM mve_transventa
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
      UPDATE mve_transventa
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

