const fs=require('node:fs');
const path=require('node:path');
const {parsearTextoCompras}=require('../domain/parserRce');
const {leerArchivoPropuesta}=require('../infrastructure/archivoPropuesta');
const {resumen,aComprobante}=require('../domain/registro');
const {clave,validarCompra,fallo}=require('../domain/personalizada');
const crearRepo=require('../infrastructure/detalle.repository');
const {hash}=crearRepo;
const ordenar=x=>Array.isArray(x)?x.map(ordenar):x && typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordenar(x[k])])):x;
const iguales=(a,b)=>JSON.stringify(ordenar(a))===JSON.stringify(ordenar(b));
const grupo=h=>JSON.stringify([h.id_usuario,h.documento_id,h.periodo]);
module.exports=async(pool,{aplicar=false}={})=>{
 const db=await pool.connect(),repo=crearRepo(pool);
 try{
  await db.query(aplicar?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(aplicar){
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['migracion-sire-compras-detalle']);
   const sql=fs.readFileSync(path.join(__dirname,'../../../../../docs/sql/mco_sire_propuesta_det.sql'),'utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'');
   await db.query(sql);
   await db.query('LOCK TABLE public.mco_sire_propuesta IN SHARE ROW EXCLUSIVE MODE');
  }
  const tieneLegacy=Boolean((await db.query("SELECT to_regclass('public.mco_sire_personalizada') AS t")).rows[0].t);
  if(aplicar && tieneLegacy)await db.query('LOCK TABLE public.mco_sire_personalizada IN SHARE ROW EXCLUSIVE MODE');
  const tieneDet=Boolean((await db.query("SELECT to_regclass('public.mco_sire_propuesta_det') AS t")).rows[0].t);
  const anteriores=tieneDet?(await db.query('SELECT * FROM public.mco_sire_propuesta_det')).rows:[];
  const mapeados=new Set(anteriores.filter(r=>r.id_personalizada_legacy!==null && r.id_personalizada_legacy!==undefined).map(r=>String(r.id_personalizada_legacy)));
  const legacy=tieneLegacy?(await db.query('SELECT * FROM public.mco_sire_personalizada ORDER BY id_compra')).rows.filter(r=>!mapeados.has(String(r.id_compra))):[];
  const cabeceras=(await db.query('SELECT * FROM public.mco_sire_propuesta ORDER BY fecha_descarga,id_propuesta')).rows;
  const pendientes=cabeceras.filter(h=>(h.tipo_cabecera || 'SUNAT')==='SUNAT' && Number(h.normalizacion_version || 0)===0);
  const controles=[],fuentes=[],ultimo=new Map();
  for(const h of pendientes){
   if(anteriores.some(d=>String(d.id_propuesta)===String(h.id_propuesta)))throw fallo('La cabecera '+h.id_propuesta+' ya tiene detalles sin una migracion registrada. Revisa el caso antes de continuar.',409);
   if(!h.archivo)throw fallo('La cabecera '+h.id_propuesta+' no tiene archivo original para reconstruir el RCE.',409);
   const rows=parsearTextoCompras({contenido:leerArchivoPropuesta(h.archivo),documentoId:h.documento_id,periodo:h.periodo});
   rows.forEach(r=>validarCompra(r,h.periodo));
   const previo=h.detalle;
   if(!Array.isArray(previo) || previo.length!==rows.length || !iguales(resumen(previo),resumen(rows)))throw fallo('No coinciden cantidades o totales JSONB/archivo en la cabecera '+h.id_propuesta+'. No se aplico la migracion.',409);
   if(previo.some((r,i)=>clave(r)!==clave(rows[i])))throw fallo('La identidad de comprobantes JSONB/archivo difiere en la cabecera '+h.id_propuesta+'.',409);
   const keys=rows.map(clave);if(new Set(keys).size!==keys.length)throw fallo('Comprobantes duplicados en la cabecera '+h.id_propuesta+'. Requiere revision.',409);
   const f={h,rows};fuentes.push(f);ultimo.set(grupo(h),f);
   controles.push({id_propuesta:h.id_propuesta,cantidad:rows.length,totales:resumen(rows)});
  }
  // Los registros legacy son la autoridad sobre ajustes y altas ya realizadas.
  const gruposLegacy=new Set(legacy.map(l=>JSON.stringify([l.id_usuario,l.documento_id,l.periodo_origen])));
  const plan=[];
  for(const l of legacy){
   const p={idAnfitrion:l.id_usuario,documentoId:l.documento_id,periodo:l.periodo_origen};
   let fuente=null,original=null;
   if(l.origen==='SUNAT'){
    const k=clave(l.original || l.comprobante);
    const opciones=fuentes.filter(f=>f.h.id_usuario===l.id_usuario && f.h.documento_id===l.documento_id && f.h.periodo===l.periodo_origen && (!l.ticket_origen || f.h.ticket===l.ticket_origen)).flatMap(f=>f.rows.filter(r=>clave(r)===k).map(r=>({f,r})));
    if(opciones.length!==1)throw fallo('No se pudo asociar de forma unica la compra legacy '+l.id_compra+' con su cabecera y archivo original.',409);
    fuente=opciones[0].f;original=opciones[0].r;
   }
   const comprobante=validarCompra({...original,...l.comprobante},l.periodo_destino>l.periodo_origen?l.periodo_destino:l.periodo_origen);
   plan.push({p,l,fuente,original,comprobante});
  }
  const automaticos=[];
  for(const [g,f] of ultimo)if(!gruposLegacy.has(g))for(const r of f.rows)automaticos.push({f,r});
  const identidades=new Set(anteriores.filter(d=>d.operativo).map(d=>JSON.stringify([d.id_usuario,d.documento_id,d.clave_documental])));
  for(const x of [...plan.map(p=>({usuario:p.p.idAnfitrion,ruc:p.p.documentoId,r:p.comprobante})),...automaticos.map(x=>({usuario:x.f.h.id_usuario,ruc:x.f.h.documento_id,r:x.r}))]){
   const k=JSON.stringify([x.usuario,x.ruc,clave(x.r)]);if(identidades.has(k))throw fallo('Hay comprobantes operativos repetidos entre periodos o ajustes existentes. La migracion requiere conciliacion previa.',409);identidades.add(k);
  }
  const esperados=[...plan.map(p=>p.comprobante),...automaticos.map(x=>x.r)];
  const reporte={modo:aplicar?'APLICADO':'SIMULACION',cabeceras:fuentes.length,comprobantes_originales:fuentes.reduce((n,f)=>n+f.rows.length,0),ajustes_legacy:plan.length,operativos:esperados.length,controles,totales_operativos:resumen(esperados)};
  if(aplicar){
   // Nuevos IDs por encima de todos los IDs antiguos: formularios abiertos no pueden editar otra compra por coincidencia de IDs.
   const maxLegacy=tieneLegacy?(await db.query('SELECT COALESCE(MAX(id_compra),0)::text AS max FROM public.mco_sire_personalizada')).rows[0].max:'0';
   await db.query(`SELECT setval(pg_get_serial_sequence('public.mco_sire_propuesta_det','id_detalle'), GREATEST(COALESCE((SELECT MAX(id_detalle) FROM public.mco_sire_propuesta_det),0),$1::bigint)+1,false)`,[maxLegacy]);
   const porFuente=new Map();
   for(const f of fuentes){
    const map=new Map();for(const r of f.rows)map.set(clave(r),await repo.insertarDetalle(db,f.h,r));porFuente.set(String(f.h.id_propuesta),map);
    await db.query(`UPDATE public.mco_sire_propuesta SET huella_archivo=$2::text,cantidad_registros=$3::integer,totales_originales=$4::jsonb,normalizacion_version=1,estado_normalizacion='NORMALIZADO' WHERE id_propuesta=$1::bigint`,[f.h.id_propuesta,hash(f.h.archivo),f.rows.length,JSON.stringify(resumen(f.rows))]);
   }
   const ids=[];
   for(const x of plan){
    let row;
    const meta={operativo:true,id_personalizada_legacy:x.l.id_compra,estado_contador:x.l.estado==='DECLARAR'?'INCLUIDO':x.l.estado,motivo_ajuste:x.l.motivo || null,periodo_declaracion:x.l.periodo_destino || x.p.periodo,periodo_origen:x.p.periodo,usuario_ajuste:x.l.usuario_ajuste || null,fecha_ajuste:x.l.fecha_ajuste || (x.l.estado!=='DECLARAR' || x.l.version>1 ? x.l.fecha_modificacion:null),historial:x.l.historial || [],version:x.l.version || 1};
    if(x.fuente){row=porFuente.get(String(x.fuente.h.id_propuesta)).get(clave(x.original));row=await repo.actualizarInterno(db,row.id_detalle,x.comprobante,meta);}
    else{const h=await repo.cabeceraTrabajo(db,x.p);row=await repo.insertarDetalle(db,h,x.comprobante,{origen:'MANUAL',...meta,valores_originales:x.l.original || x.comprobante});}
    ids.push(row.id_detalle);
   }
   for(const x of automaticos){const row=porFuente.get(String(x.f.h.id_propuesta)).get(clave(x.r));await db.query('UPDATE public.mco_sire_propuesta_det SET operativo=true WHERE id_detalle=$1::bigint',[row.id_detalle]);ids.push(row.id_detalle);}
   for(const f of fuentes){
    const dbOriginal=(await db.query("SELECT valores_originales FROM public.mco_sire_propuesta_det WHERE id_propuesta=$1::bigint AND origen='SUNAT' ORDER BY linea",[f.h.id_propuesta])).rows.map(r=>r.valores_originales);
    if(dbOriginal.length!==f.rows.length || !iguales(resumen(dbOriginal),resumen(f.rows)))throw fallo('Fallo la verificacion de detalle original en cabecera '+f.h.id_propuesta+'.',409);
   }
   const reales=(await db.query('SELECT * FROM public.mco_sire_propuesta_det WHERE id_detalle=ANY($1::bigint[]) AND operativo',[ids])).rows.map(aComprobante);
   if(reales.length!==esperados.length || !iguales(resumen(reales),resumen(esperados)))throw fallo('No coinciden cantidades o totales operativos despues de migrar.',409);
   for(const [g,f] of ultimo)if(gruposLegacy.has(g)){
    const incompletos=(await db.query("SELECT 1 FROM public.mco_sire_propuesta_det WHERE id_propuesta=$1::bigint AND origen='SUNAT' AND NOT operativo LIMIT 1",[f.h.id_propuesta])).rows;
    if(incompletos.length)await db.query("UPDATE public.mco_sire_propuesta SET estado_normalizacion='PENDIENTE_CONCILIACION' WHERE id_propuesta=$1::bigint",[f.h.id_propuesta]);
   }
   await db.query('ALTER TABLE public.mco_sire_propuesta_det ALTER COLUMN id_usuario SET NOT NULL,ALTER COLUMN documento_id SET NOT NULL,ALTER COLUMN periodo_origen SET NOT NULL,ALTER COLUMN clave_documental SET NOT NULL');
   await db.query('COMMIT');
  }else await db.query('ROLLBACK');
  return reporte;
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
};
