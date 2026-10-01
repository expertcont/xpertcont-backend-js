// Capa de acceso a datos de los tickets PDF de encomienda.
//
// Solo SQL y pool. Armar el payload del ticket es responsabilidad del service.
const pool = require('../../db');

// Contabilidad ADMIN: es la que manda razon social, direccion y ubigeo al PDF.
const obtenerContabilidadAdminQuery = async (idUsuario, documentoId) => {
  const datosQuery = await pool.query(
    `
    SELECT *
      FROM mad_usuariocontabilidad
     WHERE id_usuario = $1
       AND documento_id = $2
       AND tipo = 'ADMIN'
    `,
    [idUsuario, documentoId]
  );

  return datosQuery.rows[0];
};

// Encomienda del ticket, con ruta y puntos de venta ya resueltos por nombre.
const obtenerEncomiendaTicketQuery = async ({
  periodo,
  idUsuario,
  documentoId,
  rCod,
  rSerie,
  rNumero,
  elemento,
}) => {
  const ventaQuery = await pool.query(
    `
    SELECT tv.*,
           ruta.nombre AS nombre_ruta,
           punto_origen.nombre AS punto_venta_nombre,
           punto_destino.nombre AS punto_venta_dest_nombre
      FROM mve_transventa tv
      LEFT JOIN mve_transruta ruta
        ON ruta.id_usuario = tv.id_usuario
       AND ruta.documento_id = tv.documento_id
       AND ruta.id_ruta = tv.id_ruta
      LEFT JOIN mad_punto_venta punto_origen
        ON punto_origen.id_usuario = tv.id_usuario
       AND punto_origen.documento_id = tv.documento_id
       AND punto_origen.id_punto_venta = tv.id_punto_venta
      LEFT JOIN mad_punto_venta punto_destino
        ON punto_destino.id_usuario = tv.id_usuario
       AND punto_destino.documento_id = tv.documento_id
       AND punto_destino.id_punto_venta = tv.id_punto_venta_dest
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.r_cod = $4
       AND tv.r_serie = $5
       AND tv.r_numero = $6
       AND tv.elemento = $7
    `,
    [periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento]
  );

  return ventaQuery.rows[0];
};

module.exports = {
  obtenerContabilidadAdminQuery,
  obtenerEncomiendaTicketQuery,
};