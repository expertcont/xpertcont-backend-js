const {decimal}=require('./decimal');
const fallo = message => Object.assign(new Error(message),{statusCode:422});
const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function fecha(s){
 if(!s)return '';
 const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)throw fallo('La propuesta contiene una fecha invalida.');
 const iso=m[3]+'-'+m[2]+'-'+m[1],d=new Date(iso+'T00:00:00Z');
 if(!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==iso)throw fallo('La propuesta contiene una fecha invalida.');return iso;
}
function parsearTextoCompras({contenido,documentoId,periodo}){
 const lines=contenido.replace(/^\uFEFF/,'').split(/\r?\n/).map((s,i)=>({s,i})).filter(x=>x.s.trim());
 const cab=lines[0]?.s.split('|').map(s=>s.trim()) || [];
 const requeridas={0:'ruc',2:'periodo',3:'carsunat',4:'fechadeemision',14:'bigravadodg',15:'igvipmdg',16:'bigravadodgng',17:'igvipmdgng',18:'bigravadodng',19:'igvipmdng',20:'valoradqng',24:'totalcp',25:'moneda'};
 if(cab.length<33 || Object.entries(requeridas).some(([i,n])=>normalizar(cab[i])!==n))throw fallo('No se reconoce la cabecera de la propuesta RCE. Verifica su version y columnas tributarias.');
 const montos=['base001','igv001','base002','igv002','base003','igv003','base004','isc','icbp','otros','total'];
 return lines.slice(1).map(({s,i})=>{
  const r=s.split('|').map(x=>x.trim());
  if(r.length!==cab.length || r[0]!==documentoId || r[2].replace(/-/g,'')!==periodo.replace(/-/g,''))throw fallo('La linea '+(i+1)+' no corresponde al RUC, periodo o formato RCE seleccionado.');
  if(!/^\d{2}$/.test(r[6]) || !r[9] || !r[12])throw fallo('La linea '+(i+1)+' no identifica un comprobante de compra.');
  const o={linea:i+1,car_sunat:r[3],fecha_emision:fecha(r[4]),fecha_vencimiento:fecha(r[5]),tipo_comprobante:r[6],serie:r[7],ano_dam:r[8],numero:r[9],numero_final:r[10],tipo_doc_proveedor:r[11],documento_proveedor:r[12],proveedor:r[13],moneda:r[25] || 'PEN',tipo_cambio:decimal(r[26],6),fecha_emision_ref:fecha(r[27]),tipo_comprobante_ref:r[28],serie_ref:r[29],codigo_dam_dsi_ref:r[30],numero_ref:r[31],clasificacion_bienes_servicios:r[32],raw_linea:s,datos_adicionales:Object.fromEntries(cab.slice(33).map((nombre,j)=>[String(j+34)+':'+nombre,r[j+33]]))};
  montos.forEach((campo,j)=>{o[campo]=decimal(r[j+14]);});return o;
 });
}
module.exports={parsearTextoCompras};
