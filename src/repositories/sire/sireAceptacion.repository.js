const pool = require('../../db');

const clave = (p) => [p.idAnfitrion, p.documentoId, p.periodo, p.idLibro];

const adquirirCandado = async (p) => {
  const client = await pool.connect();
  const lockKey = `sire-presentacion:${p.idAnfitrion}:${p.documentoId}:${p.periodo}:${p.idLibro}`;
  try {
    const result = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [lockKey]);
    if (result.rows[0]?.locked !== true) {
      client.release();
      return null;
    }
    return { client, lockKey };
  } catch (error) {
    client.release(true);
    throw error;
  }
};

const liberarCandado = async ({ client, lockKey }) => {
  try {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
    client.release();
  } catch (error) {
    // Una conexion con un candado que no pudo liberarse no vuelve al pool.
    client.release(true);
  }
};

const obtenerAceptacion = async (p, db = pool) => {
  const result = await db.query(
    `SELECT * FROM public.mve_sire_aceptacion
      WHERE id_usuario = $1 AND documento_id = $2 AND periodo = $3 AND id_libro = $4
        AND origen = 'TRANSPORTE'`,
    clave(p)
  );
  return result.rows[0] || null;
};

const registrarIntento = async (p, propuesta, db) => {
  const result = await db.query(
    `INSERT INTO public.mve_sire_aceptacion
       (id_usuario, documento_id, periodo, id_libro, origen, id_propuesta,
        ticket_propuesta, estado, cantidad_registros, solicitado_por)
     VALUES ($1, $2, $3, $4, 'TRANSPORTE', $5, $6, 'ENVIANDO', $7, $8)
     ON CONFLICT (id_usuario, documento_id, periodo, id_libro, origen)
     DO UPDATE SET id_propuesta = EXCLUDED.id_propuesta,
       ticket_propuesta = EXCLUDED.ticket_propuesta,
       cantidad_registros = EXCLUDED.cantidad_registros,
       solicitado_por = EXCLUDED.solicitado_por, estado = 'ENVIANDO',
       ticket_aceptacion = NULL, codigo_estado_sunat = NULL,
       descripcion = NULL, respuesta_sunat = NULL, intentos = mve_sire_aceptacion.intentos + 1,
       fecha_solicitud = CURRENT_TIMESTAMP, fecha_actualizacion = CURRENT_TIMESTAMP
     RETURNING *`,
    [...clave(p), propuesta.id_propuesta, propuesta.ticket, propuesta.cantidad_registros, p.solicitadoPor || null]
  );
  return result.rows[0];
};

const actualizarAceptacion = async (p, datos, db) => {
  const result = await db.query(
    `UPDATE public.mve_sire_aceptacion
        SET estado = $5, ticket_aceptacion = COALESCE($6, ticket_aceptacion),
            codigo_estado_sunat = $7, descripcion = $8, respuesta_sunat = $9::jsonb,
            fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id_usuario = $1 AND documento_id = $2 AND periodo = $3 AND id_libro = $4
        AND origen = 'TRANSPORTE'
      RETURNING *`,
    [...clave(p), datos.estado, datos.ticket || null, datos.codigo || null,
      datos.descripcion || null, JSON.stringify(datos.respuesta || null)]
  );
  if (!result.rows[0]) throw new Error('No se encontro el intento de aceptacion SIRe.');
  return result.rows[0];
};

// Compatible con instalaciones que aun no han desplegado reemplazo.
const obtenerReemplazoActivo = async (p, db) => {
  const existe = await db.query("SELECT to_regclass('public.mve_sire_reemplazo') AS tabla");
  if (!existe.rows[0]?.tabla) return null;
  const result = await db.query(`SELECT estado, ticket_reemplazo FROM public.mve_sire_reemplazo
    WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3 AND id_libro=$4
      AND origen='TRANSPORTE' AND estado IN ('ENVIANDO','ENVIADO','INCIERTO','TERMINADO')
    ORDER BY fecha_preparacion DESC LIMIT 1`, clave(p));
  return result.rows[0] || null;
};
module.exports = { obtenerReemplazoActivo, adquirirCandado, liberarCandado, obtenerAceptacion, registrarIntento, actualizarAceptacion };
