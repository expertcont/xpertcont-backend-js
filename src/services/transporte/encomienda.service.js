// Reglas de la clonacion de encomiendas.
//
// Recupera encomiendas historicas de los ultimos 3 periodos para reutilizar sus
// datos. Aqui viven el limite de la bandeja y la eleccion de periodos; el SQL
// esta en el repository y el HTTP en el controller.
const { obtenerUltimosPeriodos } = require('../../utils/periodos');
const repository = require('../../repositories/transporte/encomienda.repository');

// Periodos que se buscan hacia atras para poder clonar.
const PERIODOS_A_BUSCAR = 3;

// Limite de la bandeja: por defecto 80, entre 1 y 150.
const normalizarLimite = (limit) => Math.min(Math.max(Number(limit || 80), 1), 150);

const clonarEncomienda = async ({ periodo, idAnfitrion, documentoId, idPuntoVenta, limit }) => {
  try {
    const limite = normalizarLimite(limit);
    const periodos = obtenerUltimosPeriodos(periodo, PERIODOS_A_BUSCAR);

    const rows = await repository.buscarEncomiendasClonables({
      periodos,
      idAnfitrion,
      documentoId,
      limite,
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
