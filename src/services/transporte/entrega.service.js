// Reglas del flujo de encomiendas en agencia destino.
//
// Son dos eventos distintos y no se fusionan:
//   - la llegada real marca que el paquete llego fisicamente a la agencia;
//   - la entrega marca que el cliente lo recogio.
// Un paquete puede estar dias en la agencia con llegada_real y entrega_fecha NULL.
//
// Ac aqui viven los alias que acepta el frontend, los limites de la bandeja, la
// regla de la contrasena de entrega y la decision de permisos. El SQL esta en el
// repository y el HTTP en el controller.
const { obtenerUltimosPeriodos } = require('../../utils/periodos');
const { normalizarTexto } = require('../../utils/texto');
const repository = require('../../repositories/transporte/entrega.repository');

// Reconocimiento actual de los estados "ya entregadas". No se agregan ni se quitan.
const ESTADOS_ENTREGADAS = ['entregadas', 'entregado', 'cerradas'];

const esListadoEntregadas = (estado) => ESTADOS_ENTREGADAS.includes(
  normalizarTexto(estado).toLowerCase()
);

// Normaliza los alias del body. El frontend manda las dos formas y ambas siguen
// siendo validas.
const normalizarDestino = (body = {}) => {
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
    ctrl_mod_us,
  } = body;

  return {
    periodo,
    idUsuario: id_usuario || id_anfitrion,
    idInvitado: id_invitado,
    documentoId: documento_id,
    rCod: r_cod,
    rSerie: r_serie,
    rNumero: r_numero,
    elemento,
    ctrlModUs: ctrl_mod_us,
  };
};

const faltanClavesDeEncomienda = ({ periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento }) => (
  !periodo || !idUsuario || !documentoId ||
  !rCod || !rSerie || !rNumero ||
  elemento === undefined
);

// ---------------------------------------------------------------------------
// Bandeja operativa de la agencia destino.
// ---------------------------------------------------------------------------
const listarEncomiendasPorEntregar = async ({ params, query }) => {
  const limite = Math.min(Math.max(Number(query.limit || 150), 1), 300);
  const cantidadPeriodos = Math.min(Math.max(Number(query.periodos || 3), 1), 12);
  const entregadas = esListadoEntregadas(query.estado);

  try {
    const periodosBusqueda = obtenerUltimosPeriodos(params.periodo, cantidadPeriodos);

    const data = await repository.listarEncomiendasAgenciaQuery({
      periodos: periodosBusqueda,
      idAnfitrion: params.id_anfitrion,
      documentoId: params.documento_id,
      idPuntoVentaDest: params.id_punto_venta_dest,
      limite,
      entregadas,
    });

    return {
      status: 200,
      body: {
        success: true,
        data,
        meta: {
          periodos: periodosBusqueda,
          cantidad_periodos: cantidadPeriodos,
          estado: entregadas ? 'entregadas' : 'pendientes',
        },
      },
    };
  } catch (error) {
    console.error('Error al listar encomiendas por entregar:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor',
      },
    };
  }
};

// ---------------------------------------------------------------------------
// Entrega al cliente.
// ---------------------------------------------------------------------------
const registrarEntregaEncomienda = async (body = {}) => {
  const {
    periodo,
    idUsuario,
    idInvitado,
    documentoId,
    rCod,
    rSerie,
    rNumero,
    elemento,
  } = normalizarDestino(body);

  // Los datos de quien recibe se leen del body tal cual: solo se normalizan los
  // alias admitidos (entrega_documento_id / entrega_documento, entrega_ctrl_us /
  // id_invitado).
  const {
    entrega_documento_id,
    entrega_documento,
    entrega_nombres,
    entrega_ctrl_us,
    entrega_contra,
  } = body;

  if (faltanClavesDeEncomienda({ periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento })) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Faltan parametros requeridos para registrar entrega',
      },
    };
  }

  const entregaDocumentoIdFinal = entrega_documento_id || entrega_documento;
  const entregaCtrlUsFinal = entrega_ctrl_us || idInvitado || null;
  const entregaContraFinal = normalizarTexto(entrega_contra).toUpperCase();

  try {
    const rows = await repository.registrarEntregaQuery({
      periodo,
      idUsuario,
      documentoId,
      rCod,
      rSerie,
      rNumero,
      elemento,
      entregaDocumentoId: entregaDocumentoIdFinal,
      entregaNombres: entrega_nombres,
      entregaCtrlUs: entregaCtrlUsFinal,
      entregaContra: entregaContraFinal,
    });

    if (rows.length === 0) {
      // Se distingue contrasena incorrecta de encomienda no encontrada.
      const protegida = await repository.comprobarContraActivaQuery({
        periodo,
        idUsuario,
        documentoId,
        rCod,
        rSerie,
        rNumero,
        elemento,
      });

      if (protegida.length > 0) {
        return {
          status: 409,
          body: {
            success: false,
            message: 'Contraseña de entrega incorrecta',
          },
        };
      }

      return {
        status: 404,
        body: {
          success: false,
          message: 'Encomienda no encontrada',
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        data: rows[0],
      },
    };
  } catch (error) {
    console.error('Error al registrar entrega de encomienda:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor',
      },
    };
  }
};

// ---------------------------------------------------------------------------
// Liberación de la contrasena de entrega.
// ---------------------------------------------------------------------------
const liberarContraEncomienda = async (body = {}) => {
  const {
    periodo,
    idUsuario,
    idInvitado,
    documentoId,
    rCod,
    rSerie,
    rNumero,
    elemento,
    ctrlModUs,
  } = normalizarDestino(body);

  const idInvitadoFinal = normalizarTexto(idInvitado || ctrlModUs);
  const ctrlModUsFinal = normalizarTexto(ctrlModUs || idInvitado) || null;

  if (
    !periodo || !idUsuario || !idInvitadoFinal || !documentoId ||
    !rCod || !rSerie || !rNumero ||
    elemento === undefined
  ) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Faltan parametros requeridos para liberar la contraseña',
      },
    };
  }

  try {
    const permiso = await repository.consultarPermisoLiberacionQuery({
      idUsuario,
      idInvitado: idInvitadoFinal,
    });

    if (!permiso.es_anfitrion && !permiso.es_super && !permiso.es_supervisor) {
      return {
        status: 403,
        body: {
          success: false,
          message: 'Solo un supervisor puede liberar la contraseña de entrega',
        },
      };
    }

    const rows = await repository.liberarContraQuery({
      periodo,
      idUsuario,
      documentoId,
      rCod,
      rSerie,
      rNumero,
      elemento,
      ctrlModUs: ctrlModUsFinal,
    });

    if (rows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Encomienda no encontrada, ya entregada o sin contraseña activa',
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Contraseña liberada',
        data: rows[0],
      },
    };
  } catch (error) {
    console.error('Error al liberar contraseña de encomienda:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor',
      },
    };
  }
};

// ---------------------------------------------------------------------------
// Llegada fisica a la agencia destino. No registra entrega ni la modifica.
// ---------------------------------------------------------------------------
const registrarLlegadaRealEncomienda = async (body = {}) => {
  const {
    periodo,
    idUsuario,
    idInvitado,
    documentoId,
    rCod,
    rSerie,
    rNumero,
    elemento,
    ctrlModUs,
  } = normalizarDestino(body);

  const ctrlModUsFinal = ctrlModUs || idInvitado || null;

  if (faltanClavesDeEncomienda({ periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento })) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Faltan parametros requeridos para registrar llegada real',
      },
    };
  }

  try {
    const rows = await repository.registrarLlegadaRealQuery({
      periodo,
      idUsuario,
      documentoId,
      rCod,
      rSerie,
      rNumero,
      elemento,
      ctrlModUs: ctrlModUsFinal,
    });

    if (rows.length === 0) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Encomienda no encontrada o ya tiene llegada real registrada',
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        data: rows[0],
      },
    };
  } catch (error) {
    console.error('Error al registrar llegada real de encomienda:', error);

    return {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error interno del servidor',
      },
    };
  }
};

module.exports = {
  listarEncomiendasPorEntregar,
  registrarEntregaEncomienda,
  liberarContraEncomienda,
  registrarLlegadaRealEncomienda,
};
