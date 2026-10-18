const {decimal,centimos,desdeCentimos}=require('./decimal');
const campos = [
 ['car_sunat','car_sunat'],['fecha_emision','fecha_emision'],['fecha_vencimiento','fecha_vencimiento'],['tipo_comprobante','tipo_comprobante'],['serie','serie'],['ano_dam','ano_dam'],['numero','numero'],['numero_final','numero_final'],['tipo_doc_proveedor','tipo_doc_proveedor'],['documento_proveedor','documento_proveedor'],['proveedor','proveedor'],
 ['base_gravada_dg','base001','monto'],['igv_dg','igv001','monto'],['base_gravada_dgng','base002','monto'],['igv_dgng','igv002','monto'],['base_gravada_dng','base003','monto'],['igv_dng','igv003','monto'],['valor_adquisicion_ng','base004','monto'],['isc','isc','monto'],['icbper','icbp','monto'],['otros','otros','monto'],['total','total','monto'],['moneda','moneda'],['tipo_cambio','tipo_cambio','cambio'],
 ['fecha_emision_ref','fecha_emision_ref'],['tipo_comprobante_ref','tipo_comprobante_ref'],['serie_ref','serie_ref'],['codigo_dam_dsi_ref','codigo_dam_dsi_ref'],['numero_ref','numero_ref'],['clasificacion_bienes_servicios','clasificacion_bienes_servicios']
];
const aColumnas = r => Object.fromEntries(campos.map(([c,a,t])=>[c,t?decimal(r[a],t==='cambio'?6:2):c.startsWith('fecha_')?(r[a] || null):String(r[a] ?? '')]));
const aComprobante = r => ({...Object.fromEntries(campos.map(([c,a,t])=>[a,t?String(r[c] ?? '0'):r[c] instanceof Date?r[c].toISOString().slice(0,10):r[c] || ''])),linea:r.linea,raw_linea:r.raw_linea,datos_adicionales:r.datos_adicionales || {}});
const resumen = rows => {
 const grupos={};
 for(const r of rows){const mon=r.moneda || 'PEN';const g=grupos[mon] || (grupos[mon]={cantidad:0});g.cantidad++;for(const [,a,t] of campos.filter(c=>c[2]==='monto'))g[a]=desdeCentimos(centimos(g[a] || 0)+centimos(r[a]));}
 return grupos;
};
module.exports={campos,aColumnas,aComprobante,resumen};
