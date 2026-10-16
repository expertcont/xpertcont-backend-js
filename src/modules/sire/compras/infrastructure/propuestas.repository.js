module.exports = (pool) => {
const clave = p => [p.idAnfitrion, p.documentoId, p.periodo];
const obtenerPropuesta = async (p, ticket = '') => {
  const r = await pool.query(`SELECT id_propuesta, ticket, nombre_archivo, fecha_descarga, detalle
    FROM public.mco_sire_propuesta WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3
      AND ($4::varchar='' OR ticket=$4) ORDER BY fecha_descarga DESC, id_propuesta DESC LIMIT 1`, [...clave(p), ticket]);
  return r.rows[0] || null;
};
const guardarPropuesta = async (p, ticket, nombreArchivo, buffer, detalle) => {
  const result = await pool.query(`INSERT INTO public.mco_sire_propuesta
    (id_usuario,documento_id,periodo,ticket,nombre_archivo,archivo,detalle)
    SELECT $1,$2,$3,$4,$5,$6,$7::jsonb
    WHERE EXISTS (SELECT 1 FROM public.mct_contabilidadticket
      WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3 AND id_libro='080000' AND sire_tpropuesta=$4)
    ON CONFLICT (id_usuario,documento_id,periodo,ticket) DO UPDATE
    SET nombre_archivo=EXCLUDED.nombre_archivo,archivo=EXCLUDED.archivo,detalle=EXCLUDED.detalle,fecha_descarga=clock_timestamp() RETURNING id_propuesta`,
  [...clave(p), ticket, nombreArchivo, buffer, JSON.stringify(detalle)]);
  if (!result.rows.length) throw Object.assign(new Error('El ticket cambio durante la descarga. Recupera el estado del periodo.'), { statusCode: 409 });
};
const obtenerArchivo = async (p, ticket) => {
  const r = await pool.query(`SELECT archivo,nombre_archivo FROM public.mco_sire_propuesta
    WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3 AND ticket=$4`, [...clave(p), ticket]);
  return r.rows[0] || null;
};

return { obtenerPropuesta, guardarPropuesta, obtenerArchivo };
};
