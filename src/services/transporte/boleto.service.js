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
// El precio NUNCA viene del frontend. Sale de mve_transruta.precio_pasaje y lo
// aplica la funcion PostgreSQL, de modo que un total manipulado en el request no
// se guarda. El service solo lee la ruta para validar.
const { normalizarTexto } = require('../../utils/texto');
const repository = require('../../repositories/transporte/boleto.repository');
const transventaRepository = require('../../repositories/transporte/transventa.repository');

// Datos minimos sin los cuales no hay un boleto registrable.
const MINIMO = ['id_ruta', 'cliente', 'cliente_documento'];

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
    asiento,
    id_manifiesto,
    elemento,
    id_invitado,
    ctrl_crea_us,
  } = reqBody;

  const idUsuario = id_usuario || id_anfitrion;
  const clienteDocumento = cliente_documento_id || cliente_documento;

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

    if (!(Number(ruta.precio_pasaje) > 0)) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'La ruta no tiene un precio de pasaje configurado'
        }
      };
    }

    // El precio y el destino definitivos los aplica la funcion PostgreSQL desde
    // la ruta; aca solo se arma lo que ella necesita para resolverlos.
    const payload = {
      id_usuario: idUsuario,
      documento_id,
      id_ruta: ruta.id_ruta,
      id_punto_venta: id_punto_venta || ruta.id_punto_venta,
      id_punto_venta_dest: id_punto_venta_dest || ruta.id_punto_venta_dest,
      cliente_documento: clienteDocumento,
      cliente,
      cliente_telefono: cliente_telefono || null,
      asiento: asiento || null,
      id_manifiesto: id_manifiesto || null,
      elemento: elemento === undefined || elemento === null ? 1 : elemento,
      ctrl_crea_us: id_invitado || ctrl_crea_us || null,
    };

    if (fechaServidor) {
      payload.r_fecemi = fechaServidor;
      payload.periodo = fechaServidor.slice(0, 7);
    } else {
      payload.r_fecemi = reqBody.r_fecemi;
      payload.periodo = reqBody.periodo;
    }

    let data = await repository.grabarBoleto(payload);

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

// ---------------------------------------------------------------------------
// Lo del MANIFIESTO tiene su propia capa: services/transporte/transmanifiesto.service.js
// ---------------------------------------------------------------------------

module.exports = {
  crearBoleto,
  listarBoletos,
};
