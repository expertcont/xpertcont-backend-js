const pool = require('../../db');

const obtenerCredencialesSire = async ({ idAnfitrion, documentoId }) => {
  const result = await pool.query(
    `
      SELECT sire_id, sire_secret, sire_sol, sire_solpwd
        FROM mad_usuariocontabilidad
       WHERE id_usuario = $1
         AND documento_id = $2
    `,
    [idAnfitrion, documentoId]
  );

  return result.rows[0] || null;
};

const obtenerDatosTicketPropuestaSire = async ({ idAnfitrion, documentoId, periodo, idLibro }) => {
  const result = await pool.query(
    `
      SELECT sire_tpropuesta, sire_tpropuesta_fecha_generacion
        FROM mct_contabilidadticket
       WHERE id_usuario = $1
         AND documento_id = $2
         AND periodo = $3
         AND id_libro = $4
       LIMIT 1
    `,
    [idAnfitrion, documentoId, periodo, idLibro]
  );

  return result.rows[0] || null;
};

const obtenerTicketPropuestaSire = async (params) => {
  const datos = await obtenerDatosTicketPropuestaSire(params);
  return datos?.sire_tpropuesta || '';
};

const registrarTicketPropuestaSire = async ({ idAnfitrion, documentoId, periodo, idLibro, ticket, fechaGeneracion }) => {
  const actualizar = () => pool.query(
    `UPDATE mct_contabilidadticket SET sire_tpropuesta = $5, sire_tpropuesta_fecha_generacion = $6::timestamptz
      WHERE id_usuario = $1 AND documento_id = $2 AND periodo = $3 AND id_libro = $4
      RETURNING sire_tpropuesta`,
    [idAnfitrion, documentoId, periodo, idLibro, ticket, fechaGeneracion || new Date().toISOString()]
  );
  const actualizado = await actualizar();
  if (actualizado.rows.length) return actualizado.rows[0].sire_tpropuesta;

  try {
    const result = await pool.query(
      `
        INSERT INTO mct_contabilidadticket (id_usuario, documento_id, periodo, id_libro, sire_tpropuesta, sire_tpropuesta_fecha_generacion)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        RETURNING sire_tpropuesta
      `,
      [idAnfitrion, documentoId, periodo, idLibro, ticket, fechaGeneracion || new Date().toISOString()]
    );

    return result.rows[0]?.sire_tpropuesta || ticket;
  } catch (error) {
    if (error.code === '23505') {
      const result = await actualizar();
      if (result.rows.length) return result.rows[0].sire_tpropuesta;
    }

    throw error;
  }
};

module.exports = {
  obtenerDatosTicketPropuestaSire,
  obtenerCredencialesSire,
  obtenerTicketPropuestaSire,
  registrarTicketPropuestaSire,
};
