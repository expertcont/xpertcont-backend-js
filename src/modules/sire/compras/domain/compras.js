const {parsearTextoCompras}=require('./parserRce');
const {centimos}=require('./decimal');
const texto=v=>String(v ?? '').trim();
const camposMonto=['base001','igv001','base002','igv002','base003','igv003','base004','isc','icbp','otros','total'];
const correlativo = (v) => /^\d+$/.test(texto(v)) ? texto(v).replace(/^0+(?=\d)/, '') : texto(v).toUpperCase();
const clave = (r) => JSON.stringify([texto(r.tipo_doc_proveedor), texto(r.documento_proveedor), texto(r.tipo_comprobante).padStart(2, '0'), texto(r.serie).toUpperCase(), correlativo(r.numero), texto(r.ano_dam)]);
const compararCompras = (sunat, sistema) => {
  const agrupar = (rows) => {
    const map = new Map();
    rows.forEach(r => { const k = clave(r); map.set(k, [...(map.get(k) || []), r]); });
    return map;
  };
  const a = agrupar(sunat), b = agrupar(sistema);
  return [...new Set([...a.keys(), ...b.keys()])].map(k => {
    const sa = a.get(k) || [], sb = b.get(k) || [];
    const r = sa[0] || sb[0];
    const diferencias = [];
    if (sa.length === 1 && sb.length === 1) {
      camposMonto.forEach(c => { if (centimos(sa[0][c] || 0) !== centimos(sb[0][c] || 0)) diferencias.push(c); });
      ['fecha_emision', 'moneda'].forEach(c => { if (texto(sa[0][c]) !== texto(sb[0][c])) diferencias.push(c); });
    }
    const resultado = sa.length > 1 || sb.length > 1 ? 'DUPLICADO' : !sa.length ? 'SOLO_SISTEMA' : !sb.length ? 'SOLO_SUNAT' : diferencias.length ? 'DIFERENCIA' : 'COINCIDE';
    return { ...r, clave_comparacion: k, resultado, total_sunat: sa.length ? sa.reduce((s, x) => s + Number(x.total || 0), 0) : null, total_sistema: sb.length ? sb.reduce((s, x) => s + Number(x.total || 0), 0) : null, diferencias, cantidad_sunat: sa.length, cantidad_sistema: sb.length };
  });
};
module.exports = { parsearTextoCompras, compararCompras };
