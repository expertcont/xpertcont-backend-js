const {campos,aComprobante}=require('../domain/registro');
const {decimal}=require('../domain/decimal');
const {clave,fallo,validarCompra}=require('../domain/personalizada');
const {referencia}=require('../domain/identidad');
const {hash,original}=require('../infrastructure/comprobantes.repository');
const igual=(a,b,t)=>t?decimal(a,t==='cambio'?6:2)===decimal(b,t==='cambio'?6:2):String(a || '')===String(b || '');
module.exports=({repo,validar})=>{
 const preparar=async(db,p,ticket)=>{
  const contexto=[p.idAnfitrion,p.documentoId,p.periodo];
  const vigente=(await db.query(`SELECT sire_tpropuesta FROM public.mct_contabilidadticket WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro='080000'`,contexto)).rows[0];
  if(vigente?.sire_tpropuesta!==ticket)throw fallo('Hay otro ticket vigente. Actualiza la propuesta antes de conciliar.',409);
  const h=(await db.query('SELECT * FROM public.mco_sire_propuesta_datos WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text',[...contexto,ticket])).rows[0];
  if(!h?.archivo || h.estado_normalizacion!=='PENDIENTE_CONCILIACION')throw fallo('Esta descarga no tiene una conciliacion pendiente.',409);
  const nuevos=original(h),actuales=await repo.filasEmpresa(db,p);
  const planes=nuevos.map(n=>{
   const k=clave(n),candidatos=actuales.filter(a=>clave(aComprobante(a))===k || (a.origen==='SUNAT' && a.valores_originales && clave(a.valores_originales)===k));
   if(candidatos.length>1)throw fallo('Hay identidades ambiguas. Revisa los comprobantes antes de conciliar.',409);
   const a=candidatos[0],accion=!a?'INCORPORAR':a.origen==='MANUAL'?'CONSERVAR_MANUAL':a.periodo!==p.periodo?'CONSERVAR_OTRO_PERIODO':'APLICAR_CON_AJUSTES';
   const resultado={...n},conflictos=[];
   if(a && accion==='APLICAR_CON_AJUSTES'){
    const actual=aComprobante(a),base=a.valores_originales;
    if(!base)throw fallo('Faltan los valores originales de un comprobante. No se sobrescribieron sus ajustes.',409);
    for(const [,campo,tipo] of campos)if(!igual(actual[campo],base[campo],tipo)){
     if(!igual(n[campo],base[campo],tipo) && !igual(n[campo],actual[campo],tipo))conflictos.push(campo);
     resultado[campo]=actual[campo];
    }
    if(JSON.stringify(a.datos_adicionales)!==JSON.stringify(base.datos_adicionales || {}))resultado.datos_adicionales=a.datos_adicionales;
   }
   validarCompra(resultado,p.periodo);
   return {nuevo:n,anterior:a,accion,resultado,conflictos};
  });
  const salidas=new Set();
  for(const plan of planes.filter(x=>!x.accion.startsWith('CONSERVAR'))){
   const k=clave(plan.resultado),id=plan.anterior && referencia(plan.anterior);
   if(salidas.has(k) || actuales.some(a=>clave(aComprobante(a))===k && referencia(a)!==id))throw fallo('La conciliacion produciria comprobantes repetidos. Revisa sus identidades.',409);
   salidas.add(k);
  }
  const usados=new Set(planes.filter(x=>x.anterior).map(x=>referencia(x.anterior)));
  const ausentes=actuales.filter(a=>a.periodo===p.periodo && a.origen==='SUNAT' && !usados.has(referencia(a)));
  const huella=hash(Buffer.from(JSON.stringify([h.ticket,h.huella_archivo,actuales.map(a=>[referencia(a),a.version])])));
  return {h,planes,ausentes,huella};
 };
 const vista=x=>({ticket:x.h.ticket,id_propuesta:x.h.ticket,huella_revision:x.huella,
  ausentes_conservados:x.ausentes.map(referencia),registros:x.planes.map(z=>({accion:z.accion,id_anterior:z.anterior?referencia(z.anterior):null,
   campos_con_conflicto:z.conflictos,antes:z.anterior?aComprobante(z.anterior):null,sunat:z.nuevo,resultado:z.resultado}))});
 const revisarConciliacion=entrada=>{const p=validar(entrada);return repo.transaccion(p,async db=>vista(await preparar(db,p,String(entrada.ticket || entrada.id_propuesta || ''))));};
 const confirmarConciliacion=entrada=>{
  const p=validar(entrada);
  if(entrada.confirmar!==true || !/^[a-f0-9]{64}$/.test(entrada.huella_revision || ''))throw fallo('Revisa y confirma la conciliacion de la nueva descarga.');
  return repo.transaccion(p,async db=>{
   await repo.comprobarEditable(db,p);
   const x=await preparar(db,p,String(entrada.ticket || entrada.id_propuesta || ''));
   if(x.huella!==entrada.huella_revision)throw fallo('Los comprobantes cambiaron despues de la revision. Revisa de nuevo antes de aplicar.',409);
   for(const plan of x.planes){
    if(plan.accion.startsWith('CONSERVAR'))continue;
    if(plan.anterior){
     const r=await repo.actualizarInterno(db,plan.anterior,plan.resultado,{ticket:x.h.ticket,valores_originales:plan.nuevo,
      raw_linea:plan.nuevo.raw_linea,linea:plan.nuevo.linea});
     if(!r)throw fallo('Un comprobante cambio durante la conciliacion. Vuelve a revisar.',409);
    }else await repo.insertar(db,p,plan.resultado,{origen:'SUNAT',ticket:x.h.ticket});
   }
   await db.query(`UPDATE public.mco_sire_propuesta_datos SET estado_normalizacion='NORMALIZADO',ctrl_mod=clock_timestamp(),ctrl_mod_us=$5::text
    WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text`,[p.idAnfitrion,p.documentoId,p.periodo,x.h.ticket,entrada.usuario_ajuste || null]);
   return {message:'Nueva descarga conciliada. Se conservaron los ajustes, manuales, pendientes y comprobantes ausentes.',...vista(x)};
  });
 };
 return {revisarConciliacion,confirmarConciliacion};
};
