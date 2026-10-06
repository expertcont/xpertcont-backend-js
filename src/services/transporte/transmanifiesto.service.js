// ===========================================================================
// Reglas del MANIFIESTO DE PASAJEROS (transmanifiesto).
//
// El manifiesto agrupa los boletos de un viaje (fecha, agencia origen y
// destino). Su detalle no se guarda: son los boletos que apuntan a el, asi que
// los datos del pasajero viven en un solo lado.
//
// Se llama "transmanifiesto" y no "manifiesto" para no confundirse con el
// manifiesto legado de otra base (src/controllers/manifiesto.controllers.js).
// El manifiesto es un concepto propio, con tabla y ciclo de vida propios: por eso
// tiene su propio service, su propio repository y su propio controller, y no
// vive mezclado dentro del boleto.
//
// No hay aqui nada de encomienda ni del alta de boleto: eso vive en
// transventa.service y boleto.service.
// ===========================================================================
const { normalizarTexto } = require('../../utils/texto');
const repository = require('../../repositories/transporte/transmanifiesto.repository');

// ---------------------------------------------------------------------------
// Reglas que se respetan aca:
//   - un boleto va a lo sumo a un manifiesto;
//   - solo se suben o sacan pasajeros con el manifiesto ABIERTO;
//   - no se cierra un manifiesto vacio;
//   - un manifiesto CERRADO ya no se modifica.
// ---------------------------------------------------------------------------

// Clave con la que se identifica un boleto en el manifiesto. Viene del cuerpo
// del frontend y es la misma que usa el resto del nucleo.
const clavePasajero = (body = {}) => {
  const {
    periodo, id_usuario, id_anfitrion, documento_id,
    r_cod, r_serie, r_numero, elemento,
  } = body;

  return {
    periodo,
    id_usuario: id_usuario || id_anfitrion,
    documento_id,
    r_cod,
    r_serie,
    r_numero,
    elemento: elemento === undefined || elemento === null ? 1 : elemento,
  };
};

const faltanClavesPasajero = (clave) => (
  !clave.periodo || !clave.id_usuario || !clave.documento_id ||
  !clave.r_cod || !clave.r_serie || !clave.r_numero
);

const listarBoletosDisponibles = async (reqBody = {}) => {
  const {
    periodo, id_usuario, id_anfitrion, documento_id,
    fecha, id_punto_venta, id_punto_venta_dest,
  } = reqBody;

  const idUsuario = id_usuario || id_anfitrion;

  if (!periodo || !idUsuario || !documento_id) {
    return {
      status: 400,
      body: { success: false, message: 'Faltan parametros requeridos para listar boletos disponibles' }
    };
  }

  try {
    const rows = await repository.listarBoletosDisponibles({
      periodo,
      id_usuario: idUsuario,
      documento_id,
      fecha: normalizarTexto(fecha) || null,
      idPuntoVenta: normalizarTexto(id_punto_venta) || null,
      destinoIdPuntoVenta: normalizarTexto(id_punto_venta_dest) || null,
    });

    return { status: 200, body: { success: true, data: rows } };
  } catch (error) {
    console.error('Error al listar boletos disponibles:', error);
    return { status: 500, body: { success: false, message: error.message || 'Error interno del servidor' } };
  }
};

const obtenerManifiestos = async (reqBody = {}) => {
  const { id_usuario, id_anfitrion, documento_id, periodo, fecha, estado, id_punto_venta } = reqBody;
  const idUsuario = id_usuario || id_anfitrion;

  if (!idUsuario || !documento_id) {
    return {
      status: 400,
      body: { success: false, message: 'Faltan parametros requeridos para listar manifiestos' }
    };
  }

  try {
    const rows = await repository.obtenerManifiestos({
      id_usuario: idUsuario,
      documento_id,
      periodo: normalizarTexto(periodo) || null,
      fecha: normalizarTexto(fecha) || null,
      estado: normalizarTexto(estado).toUpperCase() || null,
      idPuntoVenta: normalizarTexto(id_punto_venta) || null,
    });

    return { status: 200, body: { success: true, data: rows } };
  } catch (error) {
    console.error('Error al listar manifiestos:', error);
    return { status: 500, body: { success: false, message: error.message || 'Error interno del servidor' } };
  }
};

const obtenerManifiesto = async ({ id_manifiesto }) => {
  if (!id_manifiesto) {
    return {
      status: 400,
      body: { success: false, message: 'Falta el manifiesto a consultar' }
    };
  }

  try {
    const manifiesto = await repository.obtenerManifiesto({ id_manifiesto: Number(id_manifiesto) });

    if (!manifiesto) {
      return {
        status: 404,
        body: { success: false, message: 'Manifiesto no encontrado' }
      };
    }

    // El detalle son los boletos vinculados. Se listan con la proyeccion del
    // nucleo para que el pasajero se vea igual que en cualquier otra pantalla.
    const pasajeros = await repository.obtenerPasajerosDelManifiesto({
      id_manifiesto: Number(id_manifiesto),
    });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          ...manifiesto,
          pasajeros
        }
      }
    };
  } catch (error) {
    console.error('Error al obtener manifiesto:', error);
    return { status: 500, body: { success: false, message: error.message || 'Error interno del servidor' } };
  }
};

const crearManifiesto = async (reqBody = {}) => {
  const {
    id_usuario, id_anfitrion, documento_id, fecha, periodo,
    hora_salida, id_ruta, id_punto_venta, id_punto_venta_dest,
    placa, licencia, observacion, ctrl_crea_us, id_invitado,
  } = reqBody;

  const idUsuario = id_usuario || id_anfitrion;

  if (!idUsuario || !documento_id || !fecha || !id_ruta || !id_punto_venta || !id_punto_venta_dest) {
    return {
      status: 400,
      body: { success: false, message: 'Faltan datos requeridos para crear el manifiesto' }
    };
  }

  // La fecha va a una columna date y de ella se deriva el periodo. Se exige
  // AAAA-MM-DD para no mandar basura al cast de PostgreSQL ni guardar un
  // periodo basura como "15/09/".
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizarTexto(fecha))) {
    return {
      status: 400,
      body: { success: false, message: 'La fecha del manifiesto debe tener formato AAAA-MM-DD' }
    };
  }

  try {
    const manifiesto = await repository.crearManifiesto({
      id_usuario: idUsuario,
      documento_id,
      periodo: normalizarTexto(periodo) || normalizarTexto(fecha).slice(0, 7),
      fecha,
      hora_salida,
      id_ruta,
      id_punto_venta,
      id_punto_venta_dest,
      placa,
      licencia,
      observacion,
      ctrl_crea_us: ctrl_crea_us || id_invitado,
    });

    return { status: 200, body: { success: true, data: manifiesto } };
  } catch (error) {
    // El indice unico parcial rechaza dos manifiestos abiertos para el mismo
    // viaje. No es un error del servidor, es una regla de negocio.
    // Se busca por el nombre sin el prefijo mve_ para no depender de como se
    // llame la tabla: el mensaje de PostgreSQL trae el nombre del indice tal
    // como esta en el DDL (mve_transmanifiesto_unico_abierto_ux).
    if (/transmanifiesto_unico_abierto_ux/.test(error.message || '')) {
      return {
        status: 409,
        body: {
          success: false,
          message: 'Ya existe un manifiesto abierto para esa fecha, agencia y destino'
        }
      };
    }

    console.error('Error al crear manifiesto:', error);
    return { status: 500, body: { success: false, message: error.message || 'Error interno del servidor' } };
  }
};

const agregarPasajero = async ({ id_manifiesto, ...reqBody }) => {
  const clave = clavePasajero(reqBody);

  if (!id_manifiesto || faltanClavesPasajero(clave)) {
    return {
      status: 400,
      body: { success: false, message: 'Faltan datos requeridos para agregar el pasajero al manifiesto' }
    };
  }

  try {
    const manifiesto = await repository.obtenerManifiesto({ id_manifiesto: Number(id_manifiesto) });

    if (!manifiesto) {
      return { status: 404, body: { success: false, message: 'Manifiesto no encontrado' } };
    }

    if (manifiesto.estado !== 'ABIERTO') {
      return {
        status: 409,
        body: { success: false, message: `El manifiesto esta ${manifiesto.estado} y no admite cambios` }
      };
    }

    const pasajero = await repository.vincularPasajero({
      ...clave,
      id_manifiesto: Number(id_manifiesto),
      ctrl_mod_us: reqBody.ctrl_mod_us || reqBody.id_invitado,
    });

    if (!pasajero) {
      // El UPDATE con guarda no toca nada cuando el boleto ya estaba en otro
      // manifiesto. Una consulta extra, solo en este camino raro, dice cual de
      // los dos casos fue.
      const actual = await repository.obtenerManifiestoDeBoleto(clave);

      if (!actual) {
        return { status: 404, body: { success: false, message: 'El boleto no existe' } };
      }

      return {
        status: 409,
        body: { success: false, message: 'El boleto ya pertenece a otro manifiesto' }
      };
    }

    return { status: 200, body: { success: true, data: pasajero } };
  } catch (error) {
    console.error('Error al agregar pasajero al manifiesto:', error);
    return { status: 500, body: { success: false, message: error.message || 'Error interno del servidor' } };
  }
};

const quitarPasajero = async ({ id_manifiesto, ...reqBody }) => {
  const clave = clavePasajero(reqBody);

  if (!id_manifiesto || faltanClavesPasajero(clave)) {
    return {
      status: 400,
      body: { success: false, message: 'Faltan datos requeridos para quitar el pasajero del manifiesto' }
    };
  }

  try {
    const manifiesto = await repository.obtenerManifiesto({ id_manifiesto: Number(id_manifiesto) });

    if (!manifiesto) {
      return { status: 404, body: { success: false, message: 'Manifiesto no encontrado' } };
    }

    if (manifiesto.estado !== 'ABIERTO') {
      return {
        status: 409,
        body: { success: false, message: `El manifiesto esta ${manifiesto.estado} y no admite cambios` }
      };
    }

    const pasajero = await repository.desvincularPasajero({
      ...clave,
      id_manifiesto: Number(id_manifiesto),
      ctrl_mod_us: reqBody.ctrl_mod_us || reqBody.id_invitado,
    });

    if (!pasajero) {
      const actual = await repository.obtenerManifiestoDeBoleto(clave);

      if (!actual) {
        return { status: 404, body: { success: false, message: 'El boleto no existe' } };
      }

      return {
        status: 409,
        body: { success: false, message: 'El boleto no pertenece a este manifiesto' }
      };
    }

    return { status: 200, body: { success: true, data: pasajero } };
  } catch (error) {
    console.error('Error al quitar pasajero del manifiesto:', error);
    return { status: 500, body: { success: false, message: error.message || 'Error interno del servidor' } };
  }
};

const cerrarManifiesto = async ({ id_manifiesto, placa, licencia, ctrl_mod_us, id_invitado }) => {
  if (!id_manifiesto) {
    return {
      status: 400,
      body: { success: false, message: 'Falta el manifiesto a cerrar' }
    };
  }

  try {
    const manifiesto = await repository.obtenerManifiesto({ id_manifiesto: Number(id_manifiesto) });

    if (!manifiesto) {
      return { status: 404, body: { success: false, message: 'Manifiesto no encontrado' } };
    }

    if (manifiesto.estado !== 'ABIERTO') {
      return {
        status: 409,
        body: { success: false, message: `El manifiesto esta ${manifiesto.estado} y ya no se puede cerrar` }
      };
    }

    const placaFinal = normalizarTexto(placa) || normalizarTexto(manifiesto.placa);
    const licenciaFinal = normalizarTexto(licencia) || normalizarTexto(manifiesto.licencia);

    if (!placaFinal || !licenciaFinal) {
      return {
        status: 409,
        body: { success: false, message: 'Indica placa y licencia antes de cerrar el manifiesto' }
      };
    }

    if (!Number(manifiesto.total_pasajeros || 0)) {
      return {
        status: 409,
        body: { success: false, message: 'No se puede cerrar un manifiesto sin pasajeros' }
      };
    }

    const cerrado = await repository.cerrarManifiesto({
      id_manifiesto: Number(id_manifiesto),
      placa: placaFinal,
      licencia: licenciaFinal,
      ctrl_mod_us: ctrl_mod_us || id_invitado,
    });

    return { status: 200, body: { success: true, data: cerrado } };
  } catch (error) {
    console.error('Error al cerrar manifiesto:', error);
    return { status: 500, body: { success: false, message: error.message || 'Error interno del servidor' } };
  }
};

module.exports = {
  listarBoletosDisponibles,
  obtenerManifiestos,
  obtenerManifiesto,
  crearManifiesto,
  agregarPasajero,
  quitarPasajero,
  cerrarManifiesto,
};
