const {campos,aComprobante}=require('../domain/registro');
const {decimal}=require('../domain/decimal');
const {fallo,clave,validarCompra}=require('../domain/personalizada');
const {hash}=require('../infrastructure/detalle.repository');
const igual=(a,b,t)=>t?decimal(a,t==='cambio'?6:2)===decimal(b,t==='cambio'?6:2):String(a || '')===String(b || '');
module.exports=({repo,validar})=>{
 async function preparar(db,p,id){
  const h=(await db.query(`SELECT * FROM public.mco_sire_propuesta WHERE id_propuesta=$4::bigint AND id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND tipo_cabecera='SUNAT'`,[p.idAnfitrion,p.documentoId,p.periodo,id])).rows[0];
  if(!h)throw fallo('No se encontro la propuesta en esta empresa y periodo.',404);
  if(h.estado_normalizacion!=='PENDIENTE_CONCILIACION')throw fallo('Esta propuesta no tiene una conciliacion pendiente.',409);
  const nuevos=(await db.query("SELECT * FROM public.mco_sire_propuesta_det WHERE id_propuesta=$1::bigint AND origen='SUNAT' ORDER BY id_detalle",[id])).rows;
  const actuales=(await db.query('SELECT * FROM public.mco_sire_propuesta_det WHERE id_usuario=$1::text AND documento_id=$2::text AND operativo ORDER BY id_detalle',[p.idAnfitrion,p.documentoId])).rows;
  const planes=nuevos.map(n=>{
   const candidatos=actuales.filter(a=>a.clave_documental===n.clave_origen || a.clave_origen===n.clave_origen);
   if(candidatos.length>1)throw fallo('Hay identidades de comprobante ambiguas. Revisa los ajustes antes de conciliar.',409);
   const anterior=candidatos[0];
   const accion=!anterior?'INCORPORAR':anterior.origen==='MANUAL'?'CONSERVAR_MANUAL':anterior.estado_contador==='INCLUIDO' && anterior.periodo_declaracion<p.periodo?'CONSERVAR_OTRO_PERIODO':'APLICAR_CON_AJUSTES';
   const resultado={...n.valores_originales};const conflictos=[];
   if(anterior && accion==='APLICAR_CON_AJUSTES'){
    const a=aComprobante(anterior),base=anterior.valores_originales;
    for(const [,campo,tipo] of campos){
     if(!igual(a[campo],base[campo],tipo)){
      if(!igual(resultado[campo],base[campo],tipo) && !igual(resultado[campo],a[campo],tipo))conflictos.push(campo);
      resultado[campo]=a[campo];
     }
    }
    resultado.datos_adicionales=anterior.datos_adicionales;
   }
   validarCompra(resultado,p.periodo);
   return {nuevo:n,anterior,accion,resultado,conflictos};
  });
  const keys=new Set();
  for(const plan of planes.filter(x=>!x.accion.startsWith('CONSERVAR'))){const k=clave(plan.resultado);if(keys.has(k))throw fallo('La conciliacion produciria comprobantes duplicados.',409);keys.add(k);const otro=actuales.find(a=>a.clave_documental===k && a.id_detalle!==plan.anterior?.id_detalle);if(otro)throw fallo('La identidad ajustada coincide con otro comprobante operativo.',409);}
  const huella=hash(Buffer.from(JSON.stringify([h.id_propuesta,h.huella_archivo,actuales.map(a=>[a.id_detalle,a.version])])));
  const usados=new Set(planes.map(x=>x.anterior?.id_detalle));
  const ausentes=actuales.filter(a=>a.periodo_origen===p.periodo && a.origen==='SUNAT' && !usados.has(a.id_detalle));
  return {h,planes,huella,ausentes};
 }
 const vista=x=>({id_propuesta:x.h.id_propuesta,huella_revision:x.huella,ausentes_conservados:x.ausentes.map(a=>a.id_detalle),registros:x.planes.map(p=>({id_detalle:p.nuevo.id_detalle,id_anterior:p.anterior?.id_detalle || null,accion:p.accion,campos_con_conflicto:p.conflictos,antes:p.anterior?aComprobante(p.anterior):null,sunat:p.nuevo.valores_originales,resultado:p.resultado}))});
 const revisarConciliacion=entrada=>{const p=validar(entrada);return repo.transaccion(p,async db=>vista(await preparar(db,p,entrada.id_propuesta)));};
 const confirmarConciliacion=entrada=>{
  if(entrada.confirmar!==true || !/^[a-f0-9]{64}$/.test(String(entrada.huella_revision || '')))throw fallo('Revisa la conciliacion y confirma con su huella de revision.');
  const p=validar(entrada);
  return repo.transaccion(p,async db=>{
   const x=await preparar(db,p,entrada.id_propuesta);
   if(x.huella!==entrada.huella_revision)throw fallo('Los comprobantes cambiaron despues de la revision. Vuelve a revisar la conciliacion.',409);
   for(const plan of x.planes){
    if(plan.accion.startsWith('CONSERVAR'))continue;
    const a=plan.anterior;
    if(a)await db.query('UPDATE public.mco_sire_propuesta_det SET operativo=false,version=version+1 WHERE id_detalle=$1::bigint',[a.id_detalle]);
    await repo.actualizarInterno(db,plan.nuevo.id_detalle,plan.resultado,{operativo:true,estado_contador:a?.estado_contador || 'INCLUIDO',periodo_origen:a?.periodo_origen || p.periodo,periodo_declaracion:a?.periodo_declaracion || p.periodo,motivo_ajuste:a?.motivo_ajuste || null,fecha_ajuste:a?.fecha_ajuste || null,usuario_ajuste:a?.usuario_ajuste || null,version:plan.nuevo.version+1,historial:[...(plan.nuevo.historial || []),{tipo:'CONCILIACION',id_anterior:a?.id_detalle || null,fecha:new Date().toISOString(),usuario:entrada.usuario_ajuste || null,huella_revision:x.huella}]});
   }
   await db.query("UPDATE public.mco_sire_propuesta SET estado_normalizacion='NORMALIZADO' WHERE id_propuesta=$1::bigint",[x.h.id_propuesta]);
   return {message:'Conciliacion aplicada. Se conservaron los ajustes del contador y los comprobantes ausentes.',...vista(x)};
  });
 };
 return {revisarConciliacion,confirmarConciliacion};
};
