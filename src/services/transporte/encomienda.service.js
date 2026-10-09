// Reglas de la clonacion de encomiendas.
//
// Recupera encomiendas historicas de los ultimos periodos para reutilizar sus
// datos. Aqui viven el limite de la bandeja y la eleccion de periodos; el SQL
// esta en el repository y el HTTP en el controller.
const { obtenerUltimosPeriodos } = require('../../utils/periodos');
const repository = require('../../repositories/transporte/encomienda.repository');

// Limite de la bandeja: por defecto 80, entre 1 y 150. Si viene DNI/RUC, no limita.
const normalizarLimite = (limit, clienteDocumento) => (
  clienteDocumento ? null : Math.min(Math.max(Number(limit || 80), 1), 150)
);
const normalizarPeriodos = (periodos) => Math.min(Math.max(Number(periodos || 6), 1), 12);

const clonarEncomienda = async ({ periodo, idAnfitrion, documentoId, idPuntoVenta, limit, periodos, clienteDocumento }) => {
  try {
    const limite = normalizarLimite(limit, clienteDocumento);
    const cantidadPeriodos = normalizarPeriodos(periodos);
    const periodosBusqueda = obtenerUltimosPeriodos(periodo, cantidadPeriodos);

    const rows = await repository.buscarEncomiendasClonables({
      periodos: periodosBusqueda,
      idAnfitrion,
      documentoId,
      limite,
      idPuntoVenta,
      clienteDocumento,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: rows,
        meta: {
          periodos: periodosBusqueda,
          cantidad_periodos: cantidadPeriodos,
        },
      }
    };
  } catch (error) {
    console.error('Error al buscar encomiendas para clonar:', error);

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
  clonarEncomienda,
};
