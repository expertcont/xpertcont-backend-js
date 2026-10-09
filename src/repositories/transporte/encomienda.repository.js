// SQL de la busqueda de encomiendas clonables.
// La proyeccion `columnasVentaTrans` NO se duplica aqui: se importa del modulo
// compartido `repositories/transventaColumnas.js`, que tambien usa el nucleo
// TransVenta y el listado de entregas.
const pool = require('../../db');
const { columnasVentaTrans } = require('../transventaColumnas');

// Busca encomiendas de los ultimos periodos que se pueden clonar.
// Arma internamente el arreglo de parametros para que el orden $1..$N quede
// explicito junto al SQL que lo consume.
const buscarEncomiendasClonables = async ({
  periodos,
  idAnfitrion,
  documentoId,
  limite,
  idPuntoVenta,
  clienteDocumento,
}) => {
  const params = [
    ...periodos,
    idAnfitrion,
    documentoId,
  ];
  const idUsuarioParam = periodos.length + 1;
  const documentoParam = periodos.length + 2;
  let puntoVentaParam = null;

  if (idPuntoVenta) {
    params.push(idPuntoVenta);
    puntoVentaParam = params.length;
  }

  let clienteDocumentoParam = null;
  if (clienteDocumento) {
    params.push(String(clienteDocumento).replace(/\D/g, ''));
    clienteDocumentoParam = params.length;
  }

  let limiteParam = null;
  if (limite) {
    params.push(limite);
    limiteParam = params.length;
  }

    const joinRutaClonar = `
      LEFT JOIN (
        SELECT id_usuario AS ruta_id_usuario,
               documento_id AS ruta_documento_id,
               id_ruta AS ruta_id_ruta,
               nombre AS nombre_ruta
          FROM mve_transruta
      ) ruta
        ON ruta.ruta_id_usuario = venta.id_usuario
       AND ruta.ruta_documento_id = venta.documento_id
       AND ruta.ruta_id_ruta = venta.id_ruta
    `;

    const selectsPorPeriodo = periodos.map((_, index) => `
      SELECT ${columnasVentaTrans},
             ruta.nombre_ruta,
             venta.periodo AS periodo_origen
        FROM mve_transventa venta
        ${joinRutaClonar}
       WHERE venta.periodo = $${index + 1}
         AND venta.id_usuario = $${idUsuarioParam}
         AND venta.documento_id = $${documentoParam}
         AND venta.tipo_operacion = 'E'
         ${puntoVentaParam ? `AND venta.id_punto_venta = $${puntoVentaParam}` : ''}
         ${clienteDocumentoParam ? `AND regexp_replace(COALESCE(venta.cliente_documento::text, venta.cliente_documento_id::text, ''), '\\D', '', 'g') = $${clienteDocumentoParam}` : ''}
    `).join(' UNION ALL ');

    const query = `
      SELECT *
        FROM (
          ${selectsPorPeriodo}
        ) encomiendas
       ORDER BY r_fecemi DESC, r_serie, r_numero DESC, elemento
       ${limiteParam ? `LIMIT $${limiteParam}` : ''}
    `;

  const result = await pool.query(query, params);

  return result.rows;
};

module.exports = {
  buscarEncomiendasClonables,
};
