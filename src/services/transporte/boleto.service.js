// Reglas del boleto de transporte (tipo_operacion = 'B').
//
// El boleto lo compra un pasajero: se registra desde una agencia, viaja al
// destino de la ruta y no lleva remitente/destinatario distintos como la
// encomienda. Los datos minimos son la ruta, el documento y el nombre del
// pasajero; el destino y el precio los resuelve el backend a partir de la ruta.
//
// A diferencia de la encomienda, el frontend elige la ruta (el modal ya lista las
// rutas con pasaje configurado de la agencia) y no la envia implicita: una
// agencia puede tener varias rutas activas y son destinos distintos, no datos
// redundantes.
//
// Origen, destino y precio viajan en descripcion/precio_neto. La funcion
// PostgreSQL protege los fallback desde la ruta cuando no llegan.
const { normalizarTexto } = require('../../utils/texto');
const repository = require('../../repositories/transporte/boleto.repository');
const transventaRepository = require('../../repositories/transporte/transventa.repository');

// Datos minimos sin los cuales no hay un boleto registrable.
const MINIMO = ['id_ruta', 'cliente', 'cliente_documento'];
const tieneBloqueoSunatTransporte = (operacion = {}) => (
  Boolean(normalizarTexto(operacion.r_vfirmado) || normalizarTexto(operacion.numero_rdi))
);

const crearBoleto = async (reqBody = {}) => {
  const {
    id_usuario,
    id_anfitrion,
    documento_id,
    id_ruta,
    id_punto_venta,
    id_punto_venta_dest,
    cliente_documento,
    cliente_documento_id,
    cliente,
    cliente_telefono,
    cliente_direccion_fact,
    id_documento,
    r_cod,
    r_serie,
    ref_pasajero_dni,
    ref_pasajero_nombres,
    descripcion,
    precio_neto,
    r_monto_total,
    asiento,
    id_manifiesto,
    elemento,
    id_invitado,
    ctrl_crea_us,
  } = reqBody;

  const idUsuario = id_usuario || id_anfitrion;
  const clienteDocumento = cliente_documento_id || cliente_documento;
  const esFactura = normalizarTexto(clienteDocumento).replace(/\D/g, '').length === 11;

  const faltan = [
    ...MINIMO.map((campo) => ({ campo, valor: { id_ruta, cliente, cliente_documento: clienteDocumento }[campo] })),
  ].filter((x) => !normalizarTexto(x.valor)).map((x) => x.campo);

  if (!idUsuario || !normalizarTexto(documento_id) || faltan.length > 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Faltan datos requeridos para registrar boleto de transporte'
      }
    };
  }

  try {
    // La fecha la resuelve el servidor, igual que en la encomienda. El frontend
    // de boleto no manda una r_fecemi confiable.
    const fechaServidor = await transventaRepository.obtenerFechaServidorLima();

    const ruta = await repository.obtenerRutaPorIdRuta({
      id_usuario: idUsuario,
      documento_id,
      id_ruta,
    });

    if (!ruta) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'No existe una ruta activa configurada para el punto de venta'
        }
      };
    }

    const precioPasaje = Number(precio_neto || r_monto_total || ruta.precio_pasaje || 0);

    if (!Number.isFinite(precioPasaje) || !(precioPasaje > 0)) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'La ruta no tiene un precio de pasaje configurado'
        }
      };
    }

    // La descripcion personalizada (ORIGEN - DESTINO) y el precio viajan a la
    // funcion. Si llegan vacios, la funcion usa la ruta como respaldo.
    const payload = {
      id_usuario: idUsuario,
      documento_id,
      id_ruta: ruta.id_ruta,
      id_punto_venta: id_punto_venta || ruta.id_punto_venta,
      id_punto_venta_dest: id_punto_venta_dest || ruta.id_punto_venta_dest,
      r_cod: esFactura ? '01' : (r_cod || '03'),
      r_serie: esFactura ? (r_serie || 'F001') : (r_serie || 'B001'),
      id_documento: esFactura ? '6' : (id_documento || '1'),
      cliente_documento: clienteDocumento,
      cliente,
      cliente_telefono: cliente_telefono || null,
      cliente_direccion_fact: esFactura ? (cliente_direccion_fact || null) : null,
      ref_pasajero_dni: esFactura ? (ref_pasajero_dni || null) : null,
      ref_pasajero_nombres: esFactura ? (ref_pasajero_nombres || null) : null,
      descripcion: descripcion || null,
      asiento: asiento || null,
      id_manifiesto: id_manifiesto || null,
      elemento: elemento === undefined || elemento === null ? 1 : elemento,
      ctrl_crea_us: id_invitado || ctrl_crea_us || null,
      precio_pasaje: precioPasaje,
      precio_neto: precioPasaje,
    };

    if (fechaServidor) {
      payload.r_fecemi = fechaServidor;
      payload.periodo = fechaServidor.slice(0, 7);
    } else {
      payload.r_fecemi = reqBody.r_fecemi;
      payload.periodo = reqBody.periodo;
    }

    // Liberar asiento marca el boleto con registrado = 0. Si llega un pasajero
    // nuevo al mismo manifiesto, se reactiva ese boleto para conservar el
    // correlativo del viaje; si no existe, se genera un boleto nuevo.
    let data = await repository.recuperarBoletoLiberado(payload);

    if (!data) {
      data = await repository.grabarBoleto(payload);
    }

    if (data && id_manifiesto) {
      data = await repository.vincularBoletoAManifiesto({
        periodo: data.periodo || payload.periodo,
        id_usuario: data.id_usuario || idUsuario,
        documento_id: data.documento_id || documento_id,
        r_cod: data.r_cod,
        r_serie: data.r_serie,
        r_numero: data.r_numero,
        elemento: data.elemento,
        id_manifiesto,
        asiento: asiento || null,
        ctrl_mod_us: id_invitado || ctrl_crea_us || null,
      }) || data;
    }

    // La funcion devuelve la fila cruda. Se relee con la proyeccion
    // normalizada para que el alta del boleto tenga la misma forma que el
    // listado y el detalle.
    if (data) {
      const rows = await repository.obtenerOperacionBoleto({
        periodo: data.periodo || payload.periodo,
        id_usuario: data.id_usuario || idUsuario,
        documento_id: data.documento_id || documento_id,
        r_cod: data.r_cod,
        r_serie: data.r_serie,
        r_numero: data.r_numero,
        elemento: data.elemento,
      });

      data = rows[0] || data;
    }

    return {
      status: 200,
      body: {
        success: true,
        data
      }
    };
  } catch (error) {
    console.error('Error al crear boleto de transporte:', error);

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
// Listado de boletos
//
// El listado general del nucleo trae encomiendas y boletos juntos, y el frontend
// descarta las que no le sirven. Este listado pregunta solo por boletos, para que
// la base no devuelva el doble de filas y el panel no dependa de un filtro en el
// navegador. Es el insumo de un manifiesto: son los pasajeros que se pueden subir.
//
// Reutiliza la consulta del nucleo con el filtro de tipo, asi que devuelve
// exactamente las mismas columnas y los mismos filtros de estado y fecha.
// ---------------------------------------------------------------------------
const listarBoletos = async ({ periodo, id_anfitrion, documento_id, dia, idPuntoVentaCrudo, estadoCrudo }) => {
  const idPuntoVenta = normalizarTexto(idPuntoVentaCrudo);
  const estadoListado = normalizarTexto(estadoCrudo).toLowerCase();

  try {
    const rows = await transventaRepository.obtenerOperaciones({
      periodo,
      id_anfitrion,
      documento_id,
      estadoListado,
      dia,
      idPuntoVenta,
      tipoOperacion: 'B',
    });

    return {
      status: 200,
      body: {
        success: true,
        data: rows
      }
    };
  } catch (error) {
    console.error('Error al obtener boletos de transporte:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor'
      }
    };
  }
};

const actualizarBoleto = async (reqBody = {}) => {
  const {
    periodo,
    id_usuario,
    id_anfitrion,
    id_invitado,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    r_fecemi,
    id_ruta,
    id_punto_venta,
    id_punto_venta_dest,
    cliente_documento,
    cliente_documento_id,
    cliente,
    cliente_telefono,
    cliente_direccion_fact,
    id_documento,
    cliente_id_doc,
    ref_pasajero_dni,
    ref_pasajero_nombres,
    descripcion,
    precio_neto,
    r_monto_total,
    asiento,
    id_manifiesto,
    ctrl_mod_us,
  } = reqBody;

  const idUsuario = id_usuario || id_anfitrion;
  const clienteDocumento = cliente_documento_id || cliente_documento;
  const esFactura = normalizarTexto(clienteDocumento).replace(/\D/g, '').length === 11;

  if (!periodo || !idUsuario || !documento_id || !r_cod || !r_serie || !r_numero) {
    return {
      status: 400,
      body: { success: false, message: 'Faltan datos requeridos para actualizar boleto de transporte' }
    };
  }

  if (!normalizarTexto(clienteDocumento) || !normalizarTexto(cliente)) {
    return {
      status: 400,
      body: { success: false, message: esFactura ? 'Indique RUC y razon social.' : 'Indique documento y nombres del pasajero.' }
    };
  }

  if (esFactura && !normalizarTexto(cliente_direccion_fact)) {
    return {
      status: 400,
      body: { success: false, message: 'Indique direccion de facturacion.' }
    };
  }

    if (esFactura && (!normalizarTexto(ref_pasajero_dni) || !normalizarTexto(ref_pasajero_nombres))) {
    return {
      status: 400,
      body: { success: false, message: 'Indique DNI y nombres del pasajero.' }
    };
  }

  try {
    const estadoRows = await transventaRepository.obtenerEstadoSunat({
      periodo,
      id_usuario: idUsuario,
      documento_id,
      r_cod,
      r_serie,
      r_numero,
      elemento: elemento || 1,
    });

    if (estadoRows.length === 0) {
      return {
        status: 404,
        body: { success: false, message: 'Boleto de transporte no encontrado' }
      };
    }

    const precioBoleto = Number(precio_neto || r_monto_total || 0);

    if (tieneBloqueoSunatTransporte(estadoRows[0])) {
      return {
        status: 409,
        body: { success: false, message: 'El boleto ya fue enviado a SUNAT. No se puede modificar.' }
      };
    }

    const rows = await repository.actualizarBoleto({
      periodo,
      id_usuario: idUsuario,
      documento_id,
      r_cod,
      r_serie,
      r_numero,
      elemento: elemento || 1,
      r_fecemi,
      cliente_id_doc: esFactura ? '6' : (cliente_id_doc || id_documento || '1'),
      cliente_documento_id: clienteDocumento,
      cliente,
      cliente_telefono,
      cliente_direccion_fact: esFactura ? cliente_direccion_fact : null,
      ref_pasajero_dni: esFactura ? ref_pasajero_dni : null,
      ref_pasajero_nombres: esFactura ? ref_pasajero_nombres : null,
      descripcion,
      precio_neto: Number.isFinite(precioBoleto) && precioBoleto > 0 ? precioBoleto : null,
      id_ruta,
      id_punto_venta,
      id_punto_venta_dest,
      asiento,
      id_manifiesto,
      ctrl_mod_us: ctrl_mod_us || id_invitado || null,
    });

    if (rows.length === 0) {
      return {
        status: 404,
        body: { success: false, message: 'Boleto de transporte no encontrado' }
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
    console.error('Error al actualizar boleto de transporte:', error);

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
// Lo del MANIFIESTO tiene su propia capa: services/transporte/transmanifiesto.service.js
// ---------------------------------------------------------------------------

module.exports = {
  crearBoleto,
  listarBoletos,
  actualizarBoleto,
};
