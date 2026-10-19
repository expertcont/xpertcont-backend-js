const {randomUUID} = require('node:crypto');
const {fallo} = require('../domain/personalizada');
const scope = p => [p.idAnfitrion,p.documentoId,p.periodo];
const tablas = {aceptacion:'mco_sire_aceptacion',reemplazo:'mco_sire_reemplazo'};
module.exports = pool => {
  const tabla = tipo => {if (!tablas[tipo]) throw new Error('Operacion RCE invalida.'); return tablas[tipo];};
  const bloquear = async (p, fn) => {
    const db = await pool.connect();
    const key = JSON.stringify(['sire-compras',p.idAnfitrion,p.documentoId]);
    let adquirido=false;
    try {
      adquirido=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[key])).rows[0]?.locked===true;
      if(!adquirido) throw fallo('Hay otro proceso de Compras en curso para esta empresa. Actualiza antes de continuar.',409);
      return await fn(db);
    } finally {
      if(adquirido) {
        try {await db.query('SELECT pg_advisory_unlock(hashtext($1))',[key]);}
        catch(e){db.release(true); throw e;}
      }
      db.release();
    }
  };
  const obtener = async (db,p,tipo,id=null) => {
    const r=await db.query('SELECT * FROM public.'+tabla(tipo)+' WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text'+
      (id?' AND id_'+tipo+'=$4::uuid':'')+" ORDER BY CASE WHEN estado IN ('ENVIANDO','ENVIADO','INCIERTO','TERMINADO') THEN 0 ELSE 1 END,fecha_"+(tipo==='aceptacion'?'solicitud':'preparacion')+' DESC LIMIT 1',id?[...scope(p),id]:scope(p));
    return r.rows[0] || null;
  };
  const activos = async (db,p) => (await db.query(`
    SELECT 'aceptacion' AS tipo,estado FROM public.mco_sire_aceptacion
      WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND estado IN ('ENVIANDO','ENVIADO','INCIERTO','TERMINADO')
    UNION ALL SELECT 'reemplazo' AS tipo,estado FROM public.mco_sire_reemplazo
      WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND estado IN ('ENVIANDO','ENVIADO','INCIERTO','TERMINADO')`,scope(p))).rows;
  const propuesta = async (db,p) => {
    const t=(await db.query("SELECT sire_tpropuesta FROM public.mct_contabilidadticket WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro='080000'",scope(p))).rows[0];
    if(!t?.sire_tpropuesta)return null;
    const h=(await db.query('SELECT * FROM public.mco_sire_propuesta_datos WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text',[...scope(p),t.sire_tpropuesta])).rows[0];
    if(!h?.archivo)throw fallo('Consulta el ultimo ticket y descarga su propuesta antes de presentar.',409);
    if(h.estado_normalizacion!=='NORMALIZADO')throw fallo('Primero revisa y confirma la conciliacion de la nueva descarga.',409);
    return h;
  };
  const preparar = async(db,p,a,resumen,ticket) => (await db.query(`INSERT INTO public.mco_sire_reemplazo
    (id_reemplazo,id_usuario,documento_id,periodo,ticket_propuesta,nombre_archivo,hash_archivo,archivo_zip,cantidad_registros,estado,resumen,solicitado_por)
    VALUES($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::bytea,$9::integer,'PREPARADO',$10::jsonb,$11::text) RETURNING *`,
    [randomUUID(),...scope(p),ticket,a.nombre_archivo,a.hash_archivo,a.archivo,a.cantidad_registros,JSON.stringify(resumen),p.usuarioAjuste])).rows[0];
  const intentarAceptacion = async(db,p,h) => (await db.query(`INSERT INTO public.mco_sire_aceptacion
    (id_aceptacion,id_usuario,documento_id,periodo,ticket_propuesta,estado,cantidad_registros,solicitado_por)
    VALUES($1::uuid,$2::text,$3::text,$4::text,$5::text,'ENVIANDO',$6::integer,$7::text)
    ON CONFLICT(id_usuario,documento_id,periodo,id_libro) DO UPDATE SET estado='ENVIANDO',ticket_propuesta=EXCLUDED.ticket_propuesta,
      cantidad_registros=EXCLUDED.cantidad_registros,solicitado_por=EXCLUDED.solicitado_por,ticket_aceptacion=NULL,
      codigo_estado_sunat=NULL,descripcion=NULL,respuesta_sunat=NULL,intentos=mco_sire_aceptacion.intentos+1,
      fecha_solicitud=clock_timestamp(),fecha_actualizacion=clock_timestamp() RETURNING *`,
    [randomUUID(),...scope(p),h.ticket,h.cantidad_registros,p.usuarioAjuste])).rows[0];
  const actualizar = async(db,p,tipo,id,datos) => {
    // Lista cerrada de campos. Nunca se interpolan nombres provenientes del HTTP.
    const permitidos=['estado','descripcion','codigo_estado_sunat','respuesta_sunat',
      ...(tipo==='aceptacion'?['ticket_aceptacion']:['ticket_reemplazo','url_carga','fecha_solicitud'])];
    const campos=permitidos.filter(k=>Object.hasOwn(datos,k));
    if(!campos.length)throw new Error('Actualizacion de control vacia.');
    const valores=campos.map(k=>k==='respuesta_sunat'?JSON.stringify(datos[k]):datos[k]);
    const r=await db.query('UPDATE public.'+tabla(tipo)+' SET '+campos.map((k,i)=>k+'=$'+(i+5)+(k==='respuesta_sunat'?'::jsonb':'' )).join(',')+
      ',fecha_actualizacion=clock_timestamp() WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_'+tipo+'=$4::uuid RETURNING *',
      [...scope(p),id,...valores]);
    if(!r.rows[0])throw fallo('No se encontro el control de presentacion en esta empresa y periodo.',404);
    return r.rows[0];
  };
  return {bloquear,obtener,activos,propuesta,preparar,intentarAceptacion,actualizar};
};
