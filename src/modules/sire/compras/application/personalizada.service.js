const {fallo,clave,validarCompra,validarDecision}=require('../domain/personalizada');
module.exports = ({repo,propuestas,tickets,validar}) => {
 const traducir = async trabajo => {try{return await trabajo();}catch(e){if(e.code==='23505')throw fallo('Este comprobante ya existe en la propuesta personalizada de la empresa.',409);if(e.code==='42P01')throw Object.assign(fallo('Falta instalar el SQL mco_sire_personalizada.sql en la base de datos.',503),{codigo:'SIRE_PERSONALIZADA_MIGRACION',mensajePublico:'La propuesta personalizada necesita actualizar su configuracion en la base de datos.'});throw e;}};
 const listarPersonalizada = entrada => traducir(async()=>({registros:await repo.listar(validar(entrada))}));
 const importarPersonalizada = entrada => traducir(async()=>{
   const p=validar(entrada);
   const datos=await tickets.obtenerDatosTicketPropuestaSire(p);
   if(!datos?.sire_tpropuesta)throw fallo('Primero recupera el ticket e importa la propuesta SUNAT.');
   const propuesta=await propuestas.obtenerPropuesta(p,datos.sire_tpropuesta);
   if(!propuesta)throw fallo('Consulta el estado del ticket para importar la propuesta SUNAT antes de personalizarla.');
   const rows=propuesta.detalle.map(r=>{const comprobante=validarCompra(r,p.periodo);return {clave:clave(comprobante),comprobante};});
   if(new Set(rows.map(r=>r.clave)).size!==rows.length)throw fallo('La propuesta contiene comprobantes duplicados. Revisa el archivo antes de cargarlo.');
   const cantidad=await repo.importar(p,datos.sire_tpropuesta,rows);
   return {cantidad,message:cantidad+' comprobantes agregados. Se conservaron las decisiones existentes.'};
 });
 const crearPersonalizada = entrada => traducir(async()=>{
   const p=validar(entrada), comprobante=validarCompra(entrada.comprobante,p.periodo);
   const registro=await repo.crear(p,{comprobante,clave:clave(comprobante),...validarDecision(entrada,p.periodo)});
   return {registro,message:'Comprobante agregado a la propuesta personalizada.'};
 });
 const modificar = (entrada,eliminar=false) => traducir(async()=>{
   const p=validar(entrada);
   if(!/^[1-9]\d*$/.test(String(entrada.id_compra)) || !Number.isSafeInteger(entrada.version) || entrada.version<1)throw fallo('Indica el comprobante y su version.');
   const anterior=await repo.obtener(p,entrada.id_compra);
   if(!anterior)throw fallo('No se encontro el comprobante en esta empresa y periodo.',404);
   if(anterior.estado==='DECLARAR' && anterior.periodo_destino!==p.periodo)throw fallo('Este comprobante se asigno a otro periodo. Abre ese periodo para editarlo.',409);
   const comprobante=eliminar ? anterior.comprobante : validarCompra(entrada.comprobante,p.periodo);
   const decision=validarDecision(eliminar ? {...entrada,estado:'EXCLUIDO'} : entrada,p.periodo);
   const registro=await repo.actualizar(p,entrada.id_compra,entrada.version,{comprobante,clave:clave(comprobante),...decision});
   if(!registro)throw fallo('El comprobante fue modificado por otra sesion. Actualiza la lista antes de guardar.',409);
   return {registro,message:eliminar?'Comprobante excluido. Puedes recuperarlo desde Excluidos.':'Comprobante actualizado.'};
 });
 return {listarPersonalizada,importarPersonalizada,crearPersonalizada,editarPersonalizada:entrada=>modificar(entrada),eliminarPersonalizada:entrada=>modificar(entrada,true)};
};
