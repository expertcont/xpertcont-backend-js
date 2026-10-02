// Reglas del nucleo TransVenta.
//
// mve_transventa es comun a encomienda ('E') y boleto ('B'). Este service decide
// que rama corresponde, valida, calcula tributos y coordina; el SQL vive en el
// repository y el HTTP en el controller.
//
// La rama de boleto todavia no esta conectada a su funcion PostgreSQL y devuelve
// 501. Ese comportamiento se conserva tal cual.
const { normalizarTexto } = require('../../utils/texto');
const repository = require('../../repositories/transporte/transventa.repository');

// ---------------------------------------------------------------------------
// Reglas transversales
// ---------------------------------------------------------------------------
const validarTipoOperacion = (tipoOperacion) => ['B', 'E'].includes(tipoOperacion);

const tieneBloqueoSunatTransporte = (operacion = {}) => (
  Boolean(normalizarTexto(operacion.r_vfirmado) || normalizarTexto(operacion.numero_rdi))
);

const mensajeBloqueoSunatTransporte = (operacion = {}) => (
  normalizarTexto(operacion.numero_rdi)
    ? `La encomienda ya fue incluida en el RDI ${operacion.numero_rdi}. No se puede modificar ni eliminar.`
    : 'La encomienda ya fue enviada a SUNAT. No se puede modificar ni eliminar.'
);

// Tributos de la operacion. Es la misma regla para encomienda y boleto:
//   encomienda -> base gravada + IGV, exonerado 0
//   boleto     -> base exonerada, gravado 0, IGV 0
// Se conserva tal cual porque el boleto se apoya en ella.
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

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------
const crearVentaTrans = async (reqBody) => {
  const tipoOperacionBody = reqBody?.tipo_operacion;

  if (!validarTipoOperacion(tipoOperacionBody)) {
    return { status: 400, body: { success: false, message: 'Tipo de operacion no valido. Use B=Boleto o E=Encomienda' } };
  }

  if (tipoOperacionBody === 'E') {
    try {
      const dataEncomienda = { ...reqBody };
      const fechaServidor = await repository.obtenerFechaServidorLima();

      if (fechaServidor) {
        dataEncomienda.r_fecemi = fechaServidor;
        dataEncomienda.periodo = fechaServidor.slice(0, 7);
      }

      let data = await repository.grabarEncomienda(dataEncomienda);

      // La funcion PostgreSQL devuelve la fila cruda (to_jsonb). Se relee con la
      // proyeccion normalizada para que la creacion devuelva exactamente la
      // misma forma que el listado y el detalle.
      //
      // Antes esta lectura era un UPDATE que ademas reescribia precio_chofer y
      // contra; ya no hace falta porque la funcion los escribe en su INSERT.
      // Por eso desaparecio la guarda Number.isFinite(precioChofer): protegia
      // una escritura, y la funcion ya habria lanzado error de cast antes de
      // devolver si el precio no fuera numerico.
      if (data) {
        const rows = await repository.obtenerOperacionCreada({
          periodo: data.periodo || dataEncomienda.periodo,
          id_usuario: data.id_usuario || dataEncomienda.id_usuario || dataEncomienda.id_anfitrion,
          documento_id: data.documento_id || dataEncomienda.documento_id,
          r_cod: data.r_cod,
          r_serie: data.r_serie,
          r_numero: data.r_numero,
          elemento: data.elemento,
        });

        data = rows[0] || data;
      }

      return { status: 200, body: { success: true, data } };
    } catch (error) {
      console.error('Error al crear encomienda de transporte:', error);

      return { status: 500, body: { success: false, message: error.message || 'Error interno del servidor' } };
    }
  }

  // Boletos se conectaran a su propia funcion PostgreSQL.
  return { status: 501, body: { success: false, message: 'La funcion PostgreSQL para boletos aun no esta conectada' } };
};

// ---------------------------------------------------------------------------
// Listar y obtener
// ---------------------------------------------------------------------------
const obtenerVentasTrans = async ({ periodo, id_anfitrion, documento_id, dia, idPuntoVentaCrudo, estadoCrudo }) => {
  const idPuntoVenta = normalizarTexto(idPuntoVentaCrudo);
  const estadoListado = normalizarTexto(estadoCrudo).toLowerCase();

  try {
    const rows = await repository.obtenerOperaciones({
      periodo,
      id_anfitrion,
      documento_id,
      estadoListado,
      dia,
      idPuntoVenta,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: rows
      }
    };
  } catch (error) {
    console.error('Error al obtener operaciones de transporte:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor'
      }
    };
  }
};

const obtenerVentaTrans = async ({ periodo, id_anfitrion, documento_id, cod, serie, num, elem }) => {
  try {
    const rows = await repository.obtenerOperacion({
      periodo,
      id_anfitrion,
      documento_id,
      cod,
      serie,
      num,
      elem,
    });

    if (rows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Operacion de transporte no encontrada'
        }
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        data: rows[0]
      }
    };
  } catch (error) {
    console.error('Error al obtener operacion de transporte:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor'
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Actualizar
// ---------------------------------------------------------------------------
const actualizarVentaTrans = async (reqBody) => {
  const {
    periodo, id_usuario, id_anfitrion, id_invitado, documento_id,
    r_cod, r_serie, r_numero, elemento,
    r_fecemi, tipo_operacion,
    r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref,
    id_documento, cliente_id_doc,
    cliente, cliente_documento, cliente_documento_id,
    cliente_telefono, cliente_direccion_fact,
    cliente_zona, cliente_direccion,
    id_punto_venta, remitente_zona, remitente_direccion,
    id_ruta, descripcion,
    placa, licencia,
    asiento, pasajero_edad,
    destinatario_id_doc,
    destinatario, destinatario_documento, destinatario_documento_id,
    destinatario_telefono, id_punto_venta_dest,
    destinatario_zona, destinatario_direccion,
    cantidad, precio_unitario, precio_neto,
    r_gravado, r_exonerado, r_igv, r_monto_total, precio_chofer, porc_igv,
    condicion_pago, llegada_aprox, numero_rdi, estado_sunat, contra,
    ctrl_mod_us
  } = reqBody;
  const idUsuarioFinal = id_usuario || id_anfitrion;
  const ctrlModUsFinal = ctrl_mod_us || id_invitado || null;

  if (tipo_operacion && !validarTipoOperacion(tipo_operacion)) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Tipo de operacion no valido. Use B=Boleto o E=Encomienda'
      }
    };
  }

  try {
    const operacionActualRows = await repository.obtenerEstadoSunat({
      periodo,
      id_usuario: idUsuarioFinal,
      documento_id,
      r_cod,
      r_serie,
      r_numero,
      elemento,
    });

    if (operacionActualRows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Operacion de transporte no encontrada'
        }
      };
    }

    const operacionActual = operacionActualRows[0];
    if (tieneBloqueoSunatTransporte(operacionActual)) {
      return {
        status: 409,
        body: {
          success: false,
          message: mensajeBloqueoSunatTransporte(operacionActual)
        }
      };
    }

    const rutaTransporte = id_ruta ? await repository.obtenerRuta({
      id_anfitrion: idUsuarioFinal,
      documento_id,
      id_ruta,
    }) : null;

    if (id_ruta && !rutaTransporte) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'La ruta indicada no existe para la empresa seleccionada'
        }
      };
    }

    const idPuntoVentaFinal = id_punto_venta || rutaTransporte?.id_punto_venta || null;
    const idPuntoVentaDestFinal = id_punto_venta_dest || rutaTransporte?.id_punto_venta_dest || null;
    const clienteIdDocFinal = cliente_id_doc || id_documento || null;
    const clienteDocumentoIdFinal = cliente_documento_id || cliente_documento || null;
    const clienteZonaFinal = cliente_zona ?? remitente_zona ?? null;
    const clienteDireccionFinal = cliente_direccion ?? remitente_direccion ?? null;
    const destinatarioDocumentoIdFinal = destinatario_documento_id || destinatario_documento || null;
    const debeActualizarTributos = [
      cantidad,
      precio_unitario,
      precio_neto,
      r_gravado,
      r_exonerado,
      r_igv,
      r_monto_total,
      porc_igv,
    ].some((value) => value !== undefined && value !== null && value !== '');
    const tributosFinales = debeActualizarTributos
      ? calcularTributosTransporte({
        tipo_operacion,
        cantidad,
        precio_unitario,
        precio_neto,
        r_gravado,
        r_exonerado,
        r_igv,
        r_monto_total,
        porc_igv,
      })
      : {
        precio_neto,
        r_gravado,
        r_exonerado,
        r_igv,
        r_monto_total,
        porc_igv,
      };

    const rows = await repository.actualizarOperacion({
      periodo,
      idUsuarioFinal,
      documento_id,
      r_cod,
      r_serie,
      r_numero,
      elemento,
      r_fecemi,
      tipo_operacion,
      r_cod_ref,
      r_serie_ref,
      r_numero_ref,
      r_fecemi_ref,
      clienteIdDocFinal,
      cliente,
      clienteDocumentoIdFinal,
      cliente_telefono,
      cliente_direccion_fact,
      idPuntoVentaFinal,
      clienteZonaFinal,
      clienteDireccionFinal,
      id_ruta,
      descripcion,
      placa,
      licencia,
      asiento,
      pasajero_edad,
      destinatario_id_doc,
      destinatario,
      destinatarioDocumentoIdFinal,
      destinatario_telefono,
      idPuntoVentaDestFinal,
      destinatario_zona,
      destinatario_direccion,
      tributosFinales,
      precio_chofer,
      condicion_pago,
      llegada_aprox,
      numero_rdi,
      estado_sunat,
      ctrlModUsFinal,
      contra,
    });

    if (rows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Operacion de transporte no encontrada'
        }
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        data: rows[0]
      }
    };
  } catch (error) {
    console.error('Error al actualizar operacion de transporte:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor'
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Eliminar
// ---------------------------------------------------------------------------
const eliminarVentaTrans = async ({ periodo, id_anfitrion, documento_id, cod, serie, num, elem }) => {
  try {
    const operacionActualRows = await repository.obtenerEstadoSunat({
      periodo,
      id_usuario: id_anfitrion,
      documento_id,
      r_cod: cod,
      r_serie: serie,
      r_numero: num,
      elemento: elem,
    });

    if (operacionActualRows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Operacion de transporte no encontrada'
        }
      };
    }

    const operacionActual = operacionActualRows[0];
    if (tieneBloqueoSunatTransporte(operacionActual)) {
      return {
        status: 409,
        body: {
          success: false,
          message: mensajeBloqueoSunatTransporte(operacionActual)
        }
      };
    }

    const rows = await repository.eliminarOperacion({
      periodo,
      id_usuario: id_anfitrion,
      documento_id,
      r_cod: cod,
      r_serie: serie,
      r_numero: num,
      elemento: elem,
    });

    if (rows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Operacion de transporte no encontrada'
        }
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Operacion de transporte eliminada correctamente',
        data: rows[0]
      }
    };
  } catch (error) {
    console.error('Error al eliminar operacion de transporte:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor'
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Anular
// ---------------------------------------------------------------------------
const anularVentaTrans = async ({ periodo, id_anfitrion, documento_id, cod, serie, num, elem, ctrlModUsCrudo }) => {
  const ctrlModUs = normalizarTexto(ctrlModUsCrudo);

  try {
    const rows = await repository.anularOperacion({
      periodo,
      id_usuario: id_anfitrion,
      documento_id,
      r_cod: cod,
      r_serie: serie,
      r_numero: num,
      elemento: elem,
      ctrlModUs,
    });

    if (rows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Operacion de transporte no encontrada'
        }
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        data: rows[0]
      }
    };
  } catch (error) {
    console.error('Error al anular operacion de transporte:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor'
      }
    };
  }
};

module.exports = {
  crearVentaTrans,
  obtenerVentasTrans,
  obtenerVentaTrans,
  actualizarVentaTrans,
  eliminarVentaTrans,
  anularVentaTrans,
};
