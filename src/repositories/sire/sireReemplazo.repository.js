const pool = require('../../db');
const { registrarDatosPropuesta } = require('./sirePropuestaDatos.repository');
const { adquirirCandado, liberarCandado, obtenerAceptacion } = require('./sireAceptacion.repository');
const clave = (p) => [p.idAnfitrion, p.documentoId, p.periodo, p.idLibro];
const obtenerUltimo = async (p, db = pool, incluirArchivo = false) => {
  const result = await db.query(`SELECT id_reemplazo, documento_id, periodo, id_libro,
      nombre_archivo, hash_archivo, cantidad_registros, estado, ticket_reemplazo,
      codigo_estado_sunat, descripcion, fecha_preparacion, fecha_solicitud, fecha_actualizacion, resumen, fuente, ticket_actualizacion, estado_actualizacion, error_actualizacion
      ${incluirArchivo ? ', archivo_zip' : ''}
    FROM public.mve_sire_reemplazo
    WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3 AND id_libro=$4 AND origen='TRANSPORTE'
    ORDER BY fecha_preparacion DESC, id_reemplazo DESC LIMIT 1`, clave(p));
  return result.rows[0] || null;
};
const preparar = async (p, archivo, id, db) => {
  const result = await db.query(`INSERT INTO public.mve_sire_reemplazo
    (id_reemplazo,id_usuario,documento_id,periodo,id_libro,nombre_archivo,hash_archivo,
     archivo_zip,cantidad_registros,estado,solicitado_por,fuente,resumen)
    VALUES ($5,$1,$2,$3,$4,$6,$7,$8,$9,'PREPARADO',$10,$11,$12::jsonb)
    RETURNING id_reemplazo,documento_id,periodo,id_libro,nombre_archivo,hash_archivo,
      cantidad_registros,estado,fecha_preparacion,resumen,fuente`,
  [...clave(p), id, archivo.nombreArchivo, archivo.hash, archivo.buffer, archivo.cantidad, p.solicitadoPor || null, p.fuente || 'ARCHIVO', JSON.stringify(archivo.resumen || {})]);
  return result.rows[0];
};
const actualizar = async (p, registro, datos, db) => {
  const result = await db.query(`UPDATE public.mve_sire_reemplazo SET
    estado=$6::text, ticket_reemplazo=COALESCE($7::text,ticket_reemplazo),
    codigo_estado_sunat=$8::text, descripcion=$9::text, respuesta_sunat=$10::jsonb,
    url_carga=COALESCE($11::text,url_carga), fecha_actualizacion=clock_timestamp(),
    fecha_solicitud=CASE WHEN $6::text='ENVIANDO' THEN clock_timestamp() ELSE fecha_solicitud END
    WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro=$4::text AND id_reemplazo=$5::uuid
    RETURNING id_reemplazo,documento_id,periodo,id_libro,nombre_archivo,hash_archivo,
      cantidad_registros,estado,ticket_reemplazo,codigo_estado_sunat,descripcion,
      fecha_preparacion,fecha_solicitud,fecha_actualizacion,resumen,fuente,ticket_actualizacion,estado_actualizacion,error_actualizacion`,
  [...clave(p), registro.id_reemplazo, datos.estado, datos.ticket || null, datos.codigo || null,
    datos.descripcion || null, JSON.stringify(datos.respuesta || null), datos.urlCarga || null]);
  if (!result.rows[0]) throw new Error('No se encontro el reemplazo preparado.');
  return result.rows[0];
};
const obtenerVentas = async (p, db) => {
  const emisor = await db.query(`SELECT razon_social FROM mad_usuariocontabilidad WHERE id_usuario=$1 AND documento_id=$2 LIMIT 1`, clave(p).slice(0, 2));
  const result = await db.query(`SELECT to_jsonb(tv) || jsonb_build_object(
      'r_gravado', tv.r_gravado::text, 'r_exonerado', tv.r_exonerado::text,
      'r_igv', tv.r_igv::text, 'r_monto_total', tv.r_monto_total::text, 'precio_neto', tv.precio_neto::text) AS venta
    FROM public.mve_transventa tv WHERE tv.id_usuario=$1 AND tv.documento_id=$2 AND tv.periodo=$3
      AND tv.tipo_operacion IN ('B','E') ORDER BY tv.r_fecemi,tv.r_cod,tv.r_serie,tv.r_numero,tv.elemento`, clave(p).slice(0, 3));
  return { razonSocial: emisor.rows[0]?.razon_social, ventas: result.rows.map((r) => r.venta) };
};
const guardarActualizacion = async (p, registro, datos, db) => {
  await db.query('BEGIN');
  try {
    if (datos.ticket && !datos.reiniciarTicket) await registrarDatosPropuesta({ ...p,ticket:datos.ticket },db);
    const result = await db.query(`UPDATE public.mve_sire_reemplazo SET
      ticket_actualizacion=CASE WHEN $9::boolean THEN NULL ELSE COALESCE($6::text,ticket_actualizacion) END,
      estado_actualizacion=$7::text,error_actualizacion=$8::text,fecha_actualizacion=clock_timestamp()
      WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro=$4::text AND id_reemplazo=$5::uuid
      RETURNING *`, [...clave(p),registro.id_reemplazo,datos.ticket || null,datos.estado,datos.error || null,datos.reiniciarTicket===true]);
    if (!result.rows[0]) throw new Error('No se encontro el reemplazo para actualizar su propuesta.');
    await db.query('COMMIT');return result.rows[0];
  } catch(error) { await db.query('ROLLBACK').catch(()=>{});throw error; }
};
const invalidarPropuestas = async (p, registro, db) => {
  await db.query('BEGIN');
  try {
    await db.query(`UPDATE public.mve_sire_propuesta_datos SET estado='REEMPLAZADO',
      observacion=$5, ctrl_mod=CURRENT_TIMESTAMP
      WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3 AND id_libro=$4
        AND rubro='TRANSPORTE' AND estado IN ('PARSEADO','COMPARADO','DESCARGADO')
        AND ($6::text IS NULL OR ticket<>$6::text)`,
    [...clave(p), `Reemplazada por envio ${registro.id_reemplazo}`, registro.ticket_actualizacion || null]);
    // Una descarga pendiente de la propuesta anterior no puede volver a activarla.
    if (!registro.ticket_actualizacion) await db.query(`UPDATE public.mct_contabilidadticket
      SET sire_tpropuesta='', sire_tpropuesta_fecha_generacion=NULL
      WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3 AND id_libro=$4`, clave(p));
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
};
const registrarConciliacion = async (p, registro, db) => {
  await db.query(`UPDATE public.mve_sire_reemplazo SET conciliado_por=$6,fecha_conciliacion=clock_timestamp()
    WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3 AND id_libro=$4 AND id_reemplazo=$5`,
  [...clave(p), registro.id_reemplazo, p.solicitadoPor || p.idAnfitrion]);
};
module.exports = { obtenerVentas, guardarActualizacion, invalidarPropuestas, registrarConciliacion, adquirirCandado, liberarCandado, obtenerAceptacion, obtenerUltimo, preparar, actualizar };
