const crypto=require('node:crypto');
const {aColumnas,aComprobante,resumen}=require('../domain/registro');
const {clave,fallo}=require('../domain/personalizada');
const {valores,referencia,decodificar,condicion}=require('../domain/identidad');
const {parsearTextoCompras}=require('../domain/parserRce');
const {leerArchivoPropuesta}=require('./archivoPropuesta');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const scope=p=>[p.idAnfitrion,p.documentoId,p.periodo];
const visible="(d.periodo_origen=$3::text OR d.periodo_declaracion=$3::text OR (d.estado_contador='PENDIENTE' AND d.periodo_declaracion<=$3::text))";
const original=h=>parsearTextoCompras({contenido:leerArchivoPropuesta(h.archivo),documentoId:h.documento_id,periodo:h.periodo});
const publico=r=>r?{...r,...aComprobante(r),id_compra:referencia(r),ticket_origen:r.ticket,
  estado:r.estado_contador==='INCLUIDO'?'DECLARAR':r.estado_contador,motivo:r.motivo_ajuste || '',
  periodo_destino:r.periodo_declaracion || r.periodo_origen,comprobante:aComprobante(r),original:r.valores_originales}:null;
const identidad=(p,c)=>({id_usuario:p.idAnfitrion,documento_id:p.documentoId,periodo:p.periodo,
  r_documento_id:c.documento_proveedor,r_cod:c.tipo_comprobante,r_serie:c.serie,r_numero:c.numero});
module.exports=pool=>{
 const comprobarEditable=async(db,p,periodos=[p.periodo])=>{
  const tablas=(await db.query("SELECT to_regclass('public.mco_sire_aceptacion') AS a,to_regclass('public.mco_sire_reemplazo') AS r")).rows[0];
  if(!tablas.a && !tablas.r)return; // instalaciones anteriores al SQL de presentacion
  if(!tablas.a || !tablas.r)throw fallo('Completa el SQL mco_sire_presentacion.sql antes de operar.',503);
  const activos=await db.query(`SELECT 1 FROM public.mco_sire_aceptacion WHERE id_usuario=$1::text AND documento_id=$2::text
    AND periodo=ANY($3::text[]) AND estado IN ('ENVIANDO','ENVIADO','INCIERTO','TERMINADO')
    UNION ALL SELECT 1 FROM public.mco_sire_reemplazo WHERE id_usuario=$1::text AND documento_id=$2::text
    AND periodo=ANY($3::text[]) AND estado IN ('ENVIANDO','ENVIADO','INCIERTO','TERMINADO') LIMIT 1`,[p.idAnfitrion,p.documentoId,[...new Set(periodos.filter(Boolean))]]);
  if(activos.rows.length)throw fallo('Hay una presentacion enviada o pendiente de verificar en este periodo. No se pueden modificar las compras ya presentadas.',409);
 };
 const controlar=async fn=>{try{return await fn();}catch(e){
  if(['42P01','42703'].includes(e.code))throw fallo('La estructura de SIRE Compras no corresponde a mco_sire_propuesta y mco_sire_propuesta_datos.',503);
  if(e.code==='23505')throw fallo('El comprobante ya existe. Actualiza la lista antes de guardar.',409);throw e;
 }};
 const transaccion=(p,fn)=>controlar(async()=>{
  const db=await pool.connect();try{await db.query('BEGIN');
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[JSON.stringify(['sire-compras',p.idAnfitrion,p.documentoId])]);
   const r=await fn(db);await db.query('COMMIT');return r;
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 });
 const filasEmpresa=async(db,p)=>(await db.query('SELECT * FROM public.mco_sire_propuesta WHERE id_usuario=$1::text AND documento_id=$2::text ORDER BY periodo,r_documento_id,r_cod,r_serie,r_numero',scope(p).slice(0,2))).rows;
 const comprobarDuplicado=async(db,p,c,anterior=null)=>{
  const k=clave(c),id=anterior && referencia(anterior);
  if((await filasEmpresa(db,p)).some(r=>clave(aComprobante(r))===k && referencia(r)!==id))throw fallo('El comprobante ya existe en la empresa, incluso si esta excluido o pendiente en otro periodo.',409);
 };
 const insertar=async(db,p,c,meta={})=>{
  const datos={...identidad(p,c),...aColumnas(c),periodo_origen:p.periodo,periodo_declaracion:p.periodo,
   datos_adicionales:c.datos_adicionales || {},valores_originales:c,raw_linea:c.raw_linea || null,linea:c.linea || null,
   origen:'MANUAL',estado_contador:'INCLUIDO',...meta};
  const nombres=Object.keys(datos),json=new Set(['datos_adicionales','valores_originales','historial']);
  const params=nombres.map(n=>json.has(n)?JSON.stringify(datos[n]):datos[n]);
  return (await db.query('INSERT INTO public.mco_sire_propuesta ('+nombres.join(',')+') VALUES ('+
   nombres.map((n,i)=>'$'+(i+1)+(json.has(n)?'::jsonb':'')).join(',')+') RETURNING *',params)).rows[0];
 };
 const actualizarInterno=async(db,anterior,c,meta={})=>{
  const datos={...aColumnas(c),r_documento_id:c.documento_proveedor,r_cod:c.tipo_comprobante,r_serie:c.serie,r_numero:c.numero,
   datos_adicionales:c.datos_adicionales || {},...meta};
  const nombres=Object.keys(datos),json=new Set(['datos_adicionales','valores_originales','historial']);
  const params=[...valores(anterior),anterior.version,...nombres.map(n=>json.has(n)?JSON.stringify(datos[n]):datos[n])];
  return (await db.query('UPDATE public.mco_sire_propuesta d SET '+nombres.map((n,i)=>n+'=$'+(i+9)+(json.has(n)?'::jsonb':'')).join(',')+
   ",historial=d.historial || jsonb_build_array(to_jsonb(d)-'historial'),fecha_modificacion=clock_timestamp(),version=d.version+1 WHERE "+
   condicion('d')+' AND d.version=$8::integer RETURNING *',params)).rows[0];
 };
 const listar=p=>controlar(async()=>(await pool.query('SELECT d.* FROM public.mco_sire_propuesta d WHERE d.id_usuario=$1::text AND d.documento_id=$2::text AND '+visible+
  ' ORDER BY d.fecha_emision,d.r_documento_id,d.r_cod,d.r_serie,d.r_numero',scope(p))).rows.map(publico));
 const obtener=(p,id)=>controlar(async()=>{
  const key=decodificar(id,p);
  const r=(await pool.query('SELECT d.* FROM public.mco_sire_propuesta d WHERE '+condicion('d'),key)).rows[0];
  if(!r || !(r.periodo_origen===p.periodo || r.periodo_declaracion===p.periodo || (r.estado_contador==='PENDIENTE' && r.periodo_declaracion<=p.periodo)))return null;
  return publico(r);
 });
 const crear=(p,r)=>transaccion(p,async db=>{
  await comprobarEditable(db,p,[p.periodo,r.periodo_destino]);
  await comprobarDuplicado(db,p,r.comprobante);
  return publico(await insertar(db,p,r.comprobante,{estado_contador:r.estado==='DECLARAR'?'INCLUIDO':r.estado,motivo_ajuste:r.motivo,
   periodo_declaracion:r.periodo_destino,fecha_ajuste:new Date().toISOString(),usuario_ajuste:p.usuarioAjuste || null}));
 });
 const actualizar=(p,id,version,r)=>transaccion(p,async db=>{
  const previo=(await db.query('SELECT * FROM public.mco_sire_propuesta WHERE '+condicion()+' FOR UPDATE',decodificar(id,p))).rows[0];
  if(!previo || previo.version!==version)return null;
  await comprobarEditable(db,p,[p.periodo,previo.periodo,previo.periodo_declaracion,r.periodo_destino]);
  if(!(previo.periodo_origen===p.periodo || previo.periodo_declaracion===p.periodo || (previo.estado_contador==='PENDIENTE' && previo.periodo_declaracion<=p.periodo)))return null;
  await comprobarDuplicado(db,p,r.comprobante,previo);
  return publico(await actualizarInterno(db,previo,r.comprobante,{estado_contador:r.estado==='DECLARAR'?'INCLUIDO':r.estado,
   motivo_ajuste:r.motivo,periodo_declaracion:r.periodo_destino,fecha_ajuste:new Date().toISOString(),usuario_ajuste:p.usuarioAjuste || null}));
 });
 const registrarDatos=async(p,ticket,fechaGeneracion=null,db=pool)=>{
  return (await db.query(`INSERT INTO public.mco_sire_propuesta_datos(id_usuario,documento_id,periodo,ticket,fecha_generacion)
    VALUES($1::text,$2::text,$3::text,$4::text,COALESCE($5::timestamptz,clock_timestamp()))
    ON CONFLICT(id_usuario,documento_id,periodo,ticket) DO UPDATE SET ticket=EXCLUDED.ticket RETURNING *`,[...scope(p),ticket,fechaGeneracion])).rows[0];
 };
 const guardarPropuesta=(p,ticket,nombre,archivo,detalle)=>transaccion(p,async db=>{
  const t=(await db.query(`SELECT sire_tpropuesta FROM public.mct_contabilidadticket WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro='080000' FOR UPDATE`,scope(p))).rows[0];
  if(t?.sire_tpropuesta!==ticket)throw fallo('El ticket cambio durante la descarga. Recupera el estado del periodo.',409);
  const keys=detalle.map(clave);if(new Set(keys).size!==keys.length)throw fallo('SUNAT devolvio comprobantes repetidos. No se importo una carga parcial.',409);
  const h=await registrarDatos(p,ticket,null,db),huella=hash(archivo);
  if(h.huella_archivo){
   if(h.huella_archivo!==huella)throw fallo('El mismo ticket devolvio otro archivo. Se conservo el original para revision.',409);
   return {ticket,id_propuesta:ticket,conciliacion_pendiente:h.estado_normalizacion==='PENDIENTE_CONCILIACION'};
  }
  const actuales=await filasEmpresa(db,p);
  const anterior=(await db.query('SELECT 1 FROM public.mco_sire_propuesta_datos WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND archivo IS NOT NULL AND ticket<>$4::text LIMIT 1',[...scope(p),ticket])).rows.length>0;
  const pendiente=anterior || actuales.some(r=>(r.periodo===p.periodo && r.origen==='SUNAT') || keys.includes(clave(aComprobante(r))) || (r.valores_originales && keys.includes(clave(r.valores_originales))));
  await db.query(`UPDATE public.mco_sire_propuesta_datos SET nombre_archivo=$5::text,archivo=$6::bytea,huella_archivo=$7::text,
   cantidad_registros=$8::integer,totales_originales=$9::jsonb,estado='PARSEADO',normalizacion_version=1,estado_normalizacion=$10::text,
   fecha_descarga=clock_timestamp(),ctrl_mod=clock_timestamp() WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text`,
   [...scope(p),ticket,nombre,archivo,huella,detalle.length,JSON.stringify(resumen(detalle)),pendiente?'PENDIENTE_CONCILIACION':'NORMALIZADO']);
  if(!pendiente){await comprobarEditable(db,p);for(const c of detalle)await insertar(db,p,c,{origen:'SUNAT',ticket});}
  return {ticket,id_propuesta:ticket,conciliacion_pendiente:pendiente};
 });
 const obtenerPropuesta=(p,ticket='')=>controlar(async()=>{
  const h=(await pool.query(`SELECT * FROM public.mco_sire_propuesta_datos WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text
    AND ($4::text='' OR ticket=$4::text) AND archivo IS NOT NULL ORDER BY fecha_generacion DESC,ticket DESC LIMIT 1`,[...scope(p),ticket])).rows[0];
  if(!h)return null;
  const {archivo,...datos}=h;
  return {...datos,id_propuesta:h.ticket,conciliacion_pendiente:h.estado_normalizacion==='PENDIENTE_CONCILIACION',detalle:original(h)};
 });
 const obtenerArchivo=(p,ticket)=>controlar(async()=>(await pool.query('SELECT nombre_archivo,archivo FROM public.mco_sire_propuesta_datos WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text AND archivo IS NOT NULL',[...scope(p),ticket])).rows[0] || null);
 return {listar,obtener,crear,actualizar,registrarDatos,guardarPropuesta,obtenerPropuesta,obtenerArchivo,transaccion,filasEmpresa,comprobarDuplicado,comprobarEditable,insertar,actualizarInterno,publico};
};
module.exports.hash=hash;
module.exports.original=original;
