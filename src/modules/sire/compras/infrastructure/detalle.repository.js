const crypto=require('node:crypto');
const {campos,aColumnas,aComprobante,resumen}=require('../domain/registro');
const {clave,fallo}=require('../domain/personalizada');
const {decimal}=require('../domain/decimal');
const errorMigracion=()=>Object.assign(fallo('Ejecuta la migracion de detalle SIRE Compras antes de operar.',503),{codigo:'SIRE_PERSONALIZADA_MIGRACION',mensajePublico:'Falta completar la migracion de SIRE Compras a cabecera y detalle.'});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const scope=p=>[p.idAnfitrion,p.documentoId,p.periodo];
const visible="(d.periodo_origen=$3::text OR d.periodo_declaracion=$3::text OR (d.estado_contador='PENDIENTE' AND d.periodo_declaracion<=$3::text))";
const select="SELECT d.*,h.ticket AS ticket_origen FROM public.mco_sire_propuesta_det d JOIN public.mco_sire_propuesta h ON h.id_propuesta=d.id_propuesta ";
const publico=r=>r?{...r,id_compra:r.id_detalle,estado:r.estado_contador==='INCLUIDO'?'DECLARAR':r.estado_contador,motivo:r.motivo_ajuste || '',periodo_destino:r.periodo_declaracion || r.periodo_origen,comprobante:aComprobante(r),original:r.valores_originales}:null;
module.exports=pool=>{
 const controlar=async fn=>{try{return await fn();}catch(e){if(['42P01','42703'].includes(e.code))throw errorMigracion();if(e.code==='23505')throw fallo('El comprobante ya existe o fue actualizado en otra sesion.',409);throw e;}};
 const asegurarMigrado=async(db,p)=>{
  const legacy=await db.query(`SELECT 1 FROM public.mco_sire_propuesta WHERE id_usuario=$1::text AND documento_id=$2::text AND normalizacion_version=0 AND tipo_cabecera='SUNAT' LIMIT 1`,scope(p).slice(0,2));
  if(legacy.rows.length)throw errorMigracion();
  const existe=await db.query("SELECT to_regclass('public.mco_sire_personalizada') AS tabla");
  if(existe.rows[0]?.tabla){
   const pendiente=await db.query(`SELECT 1 FROM public.mco_sire_personalizada l WHERE l.id_usuario=$1::text AND l.documento_id=$2::text AND NOT EXISTS(SELECT 1 FROM public.mco_sire_propuesta_det d WHERE d.id_personalizada_legacy=l.id_compra) LIMIT 1`,scope(p).slice(0,2));
   if(pendiente.rows.length)throw errorMigracion();
  }
 };
 const transaccion=(p,fn,verificar=true)=>controlar(async()=>{
  const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[JSON.stringify([p.idAnfitrion,p.documentoId])]);if(verificar)await asegurarMigrado(db,p);const r=await fn(db);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 });
 const insertarDetalle=async(db,h,r,meta={})=>{
  const columnas=aColumnas(r),k=clave(r);
  const datos={id_propuesta:h.id_propuesta,id_usuario:h.id_usuario,documento_id:h.documento_id,periodo_origen:h.periodo,linea:r.linea || null,...columnas,datos_adicionales:r.datos_adicionales || {},raw_linea:r.raw_linea || null,valores_originales:r,clave_documental:k,clave_origen:meta.origen==='MANUAL'?null:k,origen:'SUNAT',estado_contador:'INCLUIDO',periodo_declaracion:h.periodo,operativo:false,...meta};
  const nombres=Object.keys(datos),valores=nombres.map(c=>['datos_adicionales','valores_originales','historial'].includes(c)?JSON.stringify(datos[c]):datos[c]);
  const rpta=await db.query('INSERT INTO public.mco_sire_propuesta_det ('+nombres.join(',')+') VALUES ('+nombres.map((c,i)=>'$'+(i+1)+(['datos_adicionales','valores_originales','historial'].includes(c)?'::jsonb':'')).join(',')+') RETURNING *',valores);
  return rpta.rows[0];
 };
 const cabeceraTrabajo=async(db,p)=>{
  const r=await db.query(`INSERT INTO public.mco_sire_propuesta(id_usuario,documento_id,periodo,tipo_cabecera,ticket,nombre_archivo,archivo,detalle,estado_normalizacion,normalizacion_version)
   VALUES($1::text,$2::text,$3::text,'TRABAJO',NULL,NULL,NULL,'[]'::jsonb,'NORMALIZADO',1)
   ON CONFLICT(id_usuario,documento_id,periodo) WHERE tipo_cabecera='TRABAJO' DO UPDATE SET tipo_cabecera='TRABAJO' RETURNING *`,scope(p));return r.rows[0];
 };
 const comprobarDuplicado=async(db,p,k,id=null)=>{
  const r=await db.query(`SELECT id_detalle FROM public.mco_sire_propuesta_det WHERE id_usuario=$1::text AND documento_id=$2::text AND operativo AND clave_documental=$3::text AND ($4::bigint IS NULL OR id_detalle<>$4::bigint)`,[p.idAnfitrion,p.documentoId,k,id]);if(r.rows.length)throw fallo('Este comprobante ya existe en la empresa, incluso si esta excluido o asignado a otro periodo.',409);
 };
 const listar=p=>controlar(async()=>{await asegurarMigrado(pool,p);return (await pool.query(select+'WHERE d.id_usuario=$1::text AND d.documento_id=$2::text AND d.operativo AND '+visible+' ORDER BY d.fecha_emision,d.id_detalle',scope(p))).rows.map(publico);});
 const obtener=(p,id)=>controlar(async()=>{await asegurarMigrado(pool,p);return publico((await pool.query(select+'WHERE d.id_usuario=$1::text AND d.documento_id=$2::text AND d.operativo AND '+visible+' AND d.id_detalle=$4::bigint',[...scope(p),id])).rows[0]);});
 const crear=(p,r)=>transaccion(p,async db=>{await comprobarDuplicado(db,p,r.clave);const h=await cabeceraTrabajo(db,p);return publico(await insertarDetalle(db,h,r.comprobante,{origen:'MANUAL',operativo:true,estado_contador:r.estado==='DECLARAR'?'INCLUIDO':r.estado,motivo_ajuste:r.motivo,periodo_declaracion:r.periodo_destino,fecha_ajuste:new Date().toISOString(),usuario_ajuste:p.usuarioAjuste || null}));});
 const actualizar=(p,id,version,r)=>transaccion(p,async db=>{
  await comprobarDuplicado(db,p,r.clave,id);
  const datos={...aColumnas(r.comprobante),clave_documental:r.clave,estado_contador:r.estado==='DECLARAR'?'INCLUIDO':r.estado,motivo_ajuste:r.motivo,periodo_declaracion:r.periodo_destino,usuario_ajuste:p.usuarioAjuste || null};
  const nombres=Object.keys(datos),params=[...scope(p),id,version,...Object.values(datos)];
  const q=await db.query('UPDATE public.mco_sire_propuesta_det d SET '+nombres.map((c,i)=>c+'=$'+(i+6)).join(',')+",historial=historial || jsonb_build_array(to_jsonb(d)-'historial'),fecha_ajuste=clock_timestamp(),fecha_modificacion=clock_timestamp(),version=version+1 WHERE d.id_usuario=$1::text AND d.documento_id=$2::text AND d.operativo AND "+visible+' AND d.id_detalle=$4::bigint AND d.version=$5::integer RETURNING *',params);return publico(q.rows[0]);
 });
 const guardarPropuesta=(p,ticket,nombre,archivo,detalle)=>transaccion(p,async db=>{
  const t=await db.query(`SELECT sire_tpropuesta FROM public.mct_contabilidadticket WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro='080000' FOR UPDATE`,scope(p));
  if(t.rows[0]?.sire_tpropuesta!==ticket)throw fallo('El ticket cambio durante la descarga. Recupera el estado del periodo.',409);
  const huella=hash(archivo);
  const existente=(await db.query('SELECT * FROM public.mco_sire_propuesta WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text',[...scope(p),ticket])).rows[0];
  if(existente){if(existente.huella_archivo!==huella)throw fallo('SUNAT devolvio otro archivo para el mismo ticket. Se preservo el original; requiere revision antes de reemplazarlo.',409);return {id_propuesta:existente.id_propuesta,conciliacion_pendiente:existente.estado_normalizacion==='PENDIENTE_CONCILIACION'};}
  const previos=await db.query(`SELECT 1 FROM public.mco_sire_propuesta WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND tipo_cabecera='SUNAT' AND estado_normalizacion='NORMALIZADO' LIMIT 1`,scope(p));
  const keys=detalle.map(clave);
  const duplicados=await db.query(`SELECT 1 FROM public.mco_sire_propuesta_det WHERE id_usuario=$1::text AND documento_id=$2::text AND operativo AND (clave_documental=ANY($3::text[]) OR clave_origen=ANY($3::text[])) LIMIT 1`,[p.idAnfitrion,p.documentoId,keys]);
  const pendiente=previos.rows.length>0 || duplicados.rows.length>0;
  const h=(await db.query(`INSERT INTO public.mco_sire_propuesta(id_usuario,documento_id,periodo,ticket,nombre_archivo,archivo,detalle,huella_archivo,cantidad_registros,totales_originales,normalizacion_version,estado_normalizacion)
   VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::bytea,$11::jsonb,$7::text,$8::integer,$9::jsonb,1,$10::text) RETURNING *`,[...scope(p),ticket,nombre,archivo,huella,detalle.length,JSON.stringify(resumen(detalle)),pendiente?'PENDIENTE_CONCILIACION':'NORMALIZADO',JSON.stringify(detalle)])).rows[0];
  if(new Set(keys).size!==keys.length)throw fallo('La propuesta contiene comprobantes duplicados. No se guardo una carga parcial.',422);
  for(const r of detalle)await insertarDetalle(db,h,r,{operativo:!pendiente});
  return {id_propuesta:h.id_propuesta,conciliacion_pendiente:pendiente};
 });
 const obtenerPropuesta=(p,ticket='')=>controlar(async()=>{
  const h=(await pool.query(`SELECT id_propuesta,ticket,nombre_archivo,fecha_descarga,normalizacion_version,estado_normalizacion FROM public.mco_sire_propuesta WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND tipo_cabecera='SUNAT' AND ($4::text='' OR ticket=$4::text) ORDER BY fecha_descarga DESC,id_propuesta DESC LIMIT 1`,[...scope(p),ticket])).rows[0];
  if(!h)return null;if(h.normalizacion_version!==1)throw errorMigracion();
  const d=(await pool.query(`SELECT valores_originales FROM public.mco_sire_propuesta_det WHERE id_propuesta=$1::bigint AND origen='SUNAT' ORDER BY linea,id_detalle`,[h.id_propuesta])).rows;
  return {...h,conciliacion_pendiente:h.estado_normalizacion==='PENDIENTE_CONCILIACION',detalle:d.map(r=>r.valores_originales)};
 });
 const obtenerArchivo=(p,ticket)=>controlar(async()=>(await pool.query('SELECT archivo,nombre_archivo FROM public.mco_sire_propuesta WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text',[...scope(p),ticket])).rows[0] || null);
 const importar=async(p,ticket)=>{const h=await obtenerPropuesta(p,ticket);if(!h)throw fallo('No existe una propuesta importada para este ticket.',404);return 0;};
 const actualizarInterno=async(db,id,comprobante,meta={})=>{
  const datos={...aColumnas(comprobante),datos_adicionales:comprobante.datos_adicionales || {},clave_documental:clave(comprobante),...meta};
  const columnas=Object.keys(datos),valores=columnas.map(c=>['datos_adicionales','historial'].includes(c)?JSON.stringify(datos[c]):datos[c]);
  return (await db.query('UPDATE public.mco_sire_propuesta_det SET '+columnas.map((c,i)=>c+'=$'+(i+2)+(['datos_adicionales','historial'].includes(c)?'::jsonb':'')).join(',')+' WHERE id_detalle=$1::bigint RETURNING *',[id,...valores])).rows[0];
 };
 return {listar,obtener,crear,actualizar,guardarPropuesta,obtenerPropuesta,obtenerArchivo,importar,transaccion,insertarDetalle,cabeceraTrabajo,asegurarMigrado,actualizarInterno,publico};
};
module.exports.hash=hash;
