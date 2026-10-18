const {decimal}=require('./decimal');
const {campos}=require('./registro');
const fallo=(message,statusCode=422)=>Object.assign(new Error(message),{statusCode});
const clave=r=>JSON.stringify([String(r.tipo_doc_proveedor || '').trim(),String(r.documento_proveedor || '').trim().toUpperCase(),String(r.tipo_comprobante || '').padStart(2,'0'),String(r.serie || '').trim().toUpperCase(),String(r.numero || '').trim().toUpperCase().replace(/^0+(?=\d)/,''),String(r.ano_dam || '').trim()]);
function validarCompra(entrada,periodo){
 if(!entrada || typeof entrada!=='object' || Array.isArray(entrada))throw fallo('Indica los datos del comprobante.');
 const r={};
 for(const [col,a,t] of campos){
  if(t){r[a]=decimal(entrada[a],t==='cambio'?6:2);continue;}
  r[a]=String(entrada[a] ?? '').trim();
  const limites={car_sunat:100,fecha_emision:10,fecha_vencimiento:10,tipo_comprobante:2,serie:20,ano_dam:4,numero:30,numero_final:30,tipo_doc_proveedor:2,documento_proveedor:20,proveedor:300,moneda:3,fecha_emision_ref:10,tipo_comprobante_ref:2,serie_ref:20,codigo_dam_dsi_ref:30,numero_ref:30,clasificacion_bienes_servicios:10};
  const max=limites[col] || 60;
  if(r[a].length>max)throw fallo('El campo '+a+' es demasiado largo.');
 }
 r.serie=r.serie.toUpperCase();r.numero=r.numero.toUpperCase();r.moneda=(r.moneda || 'PEN').toUpperCase();
 for(const campo of ['fecha_emision','fecha_vencimiento','fecha_emision_ref']){
  const s=r[campo];if(!s && campo!=='fecha_emision')continue;
  const d=new Date(s+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==s)throw fallo('La fecha '+campo+' debe ser valida.');
 }
 if(r.fecha_emision.slice(0,7)>periodo)throw fallo('La fecha de emision no puede ser posterior al periodo de trabajo.');
 if(!/^\d{2}$/.test(r.tipo_comprobante) || !r.numero || !r.tipo_doc_proveedor || !r.documento_proveedor || !r.proveedor || !/^[A-Z]{3}$/.test(r.moneda))throw fallo('Completa tipo, numero, documento y nombre del proveedor, y moneda.');
 if(r.tipo_doc_proveedor==='6' && !/^\d{11}$/.test(r.documento_proveedor))throw fallo('El RUC del proveedor debe tener 11 digitos.');
 if(Number(r.tipo_cambio)<0)throw fallo('El tipo de cambio no puede ser negativo.');
 r.datos_adicionales=entrada.datos_adicionales && typeof entrada.datos_adicionales==='object' && !Array.isArray(entrada.datos_adicionales)?entrada.datos_adicionales:{};
 return r;
}
function validarDecision(entrada,periodo){
 const estado=entrada.estado || 'DECLARAR',motivo=String(entrada.motivo || '').trim();
 const destino=estado==='PENDIENTE'?String(entrada.periodo_destino || ''):periodo;
 if(!['DECLARAR','EXCLUIDO','OBSERVADO','PENDIENTE'].includes(estado))throw fallo('Estado de compra invalido.');
 if(motivo.length>1000 || (estado!=='DECLARAR' && !motivo))throw fallo('Indica un motivo de hasta 1000 caracteres para excluir, observar o dejar pendiente.');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(destino) || (estado==='PENDIENTE' && destino<=periodo))throw fallo('Selecciona un periodo futuro para la compra pendiente.');
 return {estado,motivo,periodo_destino:destino};
}
module.exports={fallo,clave,validarCompra,validarDecision};
