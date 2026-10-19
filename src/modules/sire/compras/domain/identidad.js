const { fallo } = require('./personalizada');
const columnas = ['id_usuario','documento_id','periodo','r_documento_id','r_cod','r_serie','r_numero'];
const valores = r => columnas.map(c => String(r[c]));
const referencia = r => 'c_' + Buffer.from(JSON.stringify(valores(r))).toString('base64url');
const decodificar = (id,p) => {
  let v;
  try { v=JSON.parse(Buffer.from(String(id).slice(2),'base64url').toString()); } catch (_) {}
  if (!String(id).startsWith('c_') || !Array.isArray(v) || v.length!==7 || v.some((x,i)=>typeof x!=='string' || (!x && i!==5) || x.length>60)
      || v[0]!==p.idAnfitrion || v[1]!==p.documentoId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v[2])) {
    throw fallo('Actualiza la lista y selecciona un comprobante de esta empresa.',409);
  }
  return v;
};
const condicion = (alias='',desde=1) => columnas.map((c,i)=>(alias?alias+'.':'')+c+'=$'+(desde+i)+'::text').join(' AND ');
module.exports={columnas,valores,referencia,decodificar,condicion};
