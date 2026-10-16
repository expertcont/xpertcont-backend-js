const texto = (v) => String(v ?? '').trim();
const error = (message) => Object.assign(new Error(message), { statusCode: 422 });
const monto = (v) => {
  const raw = texto(v).replace(/,/g, '');
  if (!raw) return 0;
  if (!/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw error('La propuesta contiene un importe invalido.');
  return Number(raw);
};
const fecha = (v) => {
  const raw = texto(v);
  if (!raw) return '';
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw error('La propuesta contiene una fecha invalida.');
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw error('La propuesta contiene una fecha invalida.');
  return iso;
};
const camposMonto = ['base001', 'igv001', 'base002', 'igv002', 'base003', 'igv003', 'base004', 'isc', 'icbp', 'otros', 'total'];
// Formato RCE: dominio independiente de HTTP, ZIP, base de datos y otros modulos.
const parsearTextoCompras = ({ contenido, documentoId, periodo }) => {
  const lines = contenido.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length || lines[0].split('|').length < 33 || /^\d{11}$/.test(texto(lines[0].split('|')[0]))) throw error('No se reconoce la cabecera de la propuesta RCE.');
  return lines.slice(1).map((line, index) => {
    const row = line.split('|').map(texto);
    if (row.length < 33 || row[0] !== documentoId || row[2].replace(/-/g, '') !== periodo.replace(/-/g, '')) throw error(`La linea ${index + 2} no corresponde al RUC, periodo o formato RCE seleccionado.`);
    if (!/^\d{2}$/.test(row[6]) || !row[9] || !row[12]) throw error(`La linea ${index + 2} no identifica un comprobante de compra.`);
    const registro = { linea: index + 2, fecha_emision: fecha(row[4]), tipo_comprobante: row[6], serie: row[7], ano_dam: row[8], numero: row[9], tipo_doc_proveedor: row[11], documento_proveedor: row[12], proveedor: row[13], moneda: row[25] || 'PEN', tipo_cambio: monto(row[26]), raw_linea: line };
    camposMonto.forEach((campo, i) => { registro[campo] = monto(row[14 + i]); });
    return registro;
  });
};
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
      camposMonto.forEach(c => { if (Math.round(Number(sa[0][c] || 0) * 100) !== Math.round(Number(sb[0][c] || 0) * 100)) diferencias.push(c); });
      ['fecha_emision', 'moneda'].forEach(c => { if (texto(sa[0][c]) !== texto(sb[0][c])) diferencias.push(c); });
    }
    const resultado = sa.length > 1 || sb.length > 1 ? 'DUPLICADO' : !sa.length ? 'SOLO_SISTEMA' : !sb.length ? 'SOLO_SUNAT' : diferencias.length ? 'DIFERENCIA' : 'COINCIDE';
    return { ...r, clave_comparacion: k, resultado, total_sunat: sa.length ? sa.reduce((s, x) => s + Number(x.total || 0), 0) : null, total_sistema: sb.length ? sb.reduce((s, x) => s + Number(x.total || 0), 0) : null, diferencias, cantidad_sunat: sa.length, cantidad_sistema: sb.length };
  });
};
module.exports = { parsearTextoCompras, compararCompras };
