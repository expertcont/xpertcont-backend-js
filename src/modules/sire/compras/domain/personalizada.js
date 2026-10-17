const fallo = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const montos = ['base001','igv001','base002','igv002','base003','igv003','base004','isc','icbp','otros','total','tipo_cambio'];
const textos = ['fecha_emision','tipo_comprobante','serie','ano_dam','numero','tipo_doc_proveedor','documento_proveedor','proveedor','moneda'];
const clave = r => JSON.stringify([r.tipo_doc_proveedor, r.documento_proveedor, r.tipo_comprobante, r.serie.toUpperCase(), r.numero.replace(/^0+(?=\d)/,''), r.ano_dam]);
const validarCompra = (entrada, periodo) => {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw fallo('Indica los datos del comprobante.');
  const r = {};
  for (const campo of textos) {
    r[campo] = String(entrada[campo] ?? '').trim();
    if (r[campo].length > (campo === 'proveedor' ? 300 : 60)) throw fallo('El campo ' + campo + ' es demasiado largo.');
  }
  r.serie = r.serie.toUpperCase();
  r.numero = r.numero.toUpperCase();
  r.moneda = (r.moneda || 'PEN').toUpperCase();
  const fecha = new Date(r.fecha_emision + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha_emision) || !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0,10)!==r.fecha_emision || r.fecha_emision.slice(0,7)>periodo) throw fallo('La fecha de emision debe ser valida y no posterior al periodo de trabajo.');
  if (!/^\d{2}$/.test(r.tipo_comprobante) || !r.numero || !r.tipo_doc_proveedor || !r.documento_proveedor || !r.proveedor || !/^[A-Z]{3}$/.test(r.moneda)) throw fallo('Completa tipo, numero, documento y nombre del proveedor, y moneda.');
  if (r.tipo_doc_proveedor === '6' && !/^\d{11}$/.test(r.documento_proveedor)) throw fallo('El RUC del proveedor debe tener 11 digitos.');
  for (const campo of montos) {
    const raw = String(entrada[campo] ?? '0').trim() || '0';
    if (!/^-?\d+(\.\d{1,6})?$/.test(raw) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw))>999999999999) throw fallo('Importe invalido: ' + campo);
    r[campo]=Number(raw);
  }
  return r;
};
const validarDecision = (entrada, periodo) => {
  const estado = entrada.estado || 'DECLARAR';
  const motivo = String(entrada.motivo || '').trim();
  const destino = estado === 'PENDIENTE' ? String(entrada.periodo_destino || '') : periodo;
  if (!['DECLARAR','EXCLUIDO','PENDIENTE'].includes(estado)) throw fallo('Estado de compra invalido.');
  if (motivo.length>1000 || (estado !== 'DECLARAR' && !motivo)) throw fallo('Indica un motivo de hasta 1000 caracteres para excluir o dejar pendiente.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(destino) || (estado==='PENDIENTE' && destino<=periodo)) throw fallo('Selecciona un periodo futuro para la compra pendiente.');
  return {estado,motivo,periodo_destino:destino};
};
module.exports = {fallo,clave,validarCompra,validarDecision};
