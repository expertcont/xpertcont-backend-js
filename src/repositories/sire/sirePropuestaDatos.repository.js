const pool = require('../../db');
const clave = p => [p.idAnfitrion, p.documentoId, p.periodo, p.ticket];

// La identidad de la descarga es su ticket dentro de la empresa y el periodo.
const registrarDatosPropuesta = async (p, db = pool) => {
  const r = await db.query(`INSERT INTO public.mve_sire_propuesta_datos
    (id_usuario,documento_id,periodo,ticket,id_libro,rubro,fecha_generacion)
    VALUES ($1::text,$2::text,$3::text,$4::text,'140000','TRANSPORTE',COALESCE($5::timestamptz,clock_timestamp()))
    ON CONFLICT (id_usuario,documento_id,periodo,ticket)
    DO UPDATE SET ticket=EXCLUDED.ticket RETURNING *`, [...clave(p), p.fechaGeneracion || null]);
  return r.rows[0];
};
const obtenerArchivoPropuesta = async (p,db=pool) => {
  const r=await db.query(`SELECT nombre_archivo,archivo FROM public.mve_sire_propuesta_datos
    WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text AND archivo IS NOT NULL`,clave(p));
  return r.rows[0] || null;
};
module.exports = { registrarDatosPropuesta,obtenerArchivoPropuesta };
