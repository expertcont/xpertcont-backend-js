const { prepararArchivo } = require('../sire/sireReemplazoArchivo.service');
const { identidadVenta } = require('../../utils/sireVentaDocumento.utils');
const fallo = (message) => { throw Object.assign(new Error(message), { statusCode: 409 }); };
const texto = (value) => String(value ?? '').trim();
const campo = (value) => {
  const v = texto(value);
  if (/[|\r\n\x00-\x1F]/.test(v)) fallo('Un campo del comprobante contiene separadores o saltos de linea. Corrigelo antes de generar.');
  return v;
};
const centimos = (value) => {
  const s = texto(value ?? '0');
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(s)) fallo('Importe de transporte invalido o con mas de dos decimales.');
  const [entero, dec = ''] = s.replace('-', '').split('.');
  const valor = BigInt(entero) * 100n + BigInt(dec.padEnd(2, '0'));
  return s.startsWith('-') ? -valor : valor;
};
const importe = (value) => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;
const fecha = (value) => {
  const iso = texto(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) fallo('Fecha del comprobante incompleta.');
  return iso.split('-').reverse().join('/');
};
const generarArchivo = ({ documentoId, periodo, razonSocial, ventas }) => {
  if (!campo(razonSocial)) fallo('No se encontro la razon social del emisor.');
  const grupos = new Map();
  for (const v of ventas) {
    const identidad = identidadVenta(v, { fechaMovimiento: v.sire_rubro === 'COMERCIAL' });
    const { principalNota, tipo } = identidad;
    if (!['01', '03', '07', '08'].includes(tipo)) continue;
    const serie = campo(identidad.serie);
    const numero = campo(identidad.numero);
    if (!serie || !/^\d{1,8}$/.test(numero)) fallo(`Comprobante ${tipo}-${serie}-${numero}: serie o numero invalido.`);
    const moneda = campo(v.r_moneda || 'PEN');
    if (moneda !== 'PEN') fallo('La generacion automatica corresponde a comprobantes de transporte en PEN. Para otra moneda utiliza un archivo RVIE revisado.');
    const nota = ['07', '08'].includes(tipo);
    const anulado = Number(v.registrado ?? 1) === 0;
    const c = Array(33).fill('');
    Object.assign(c, { 0: documentoId, 1: campo(razonSocial), 2: periodo.replace('-', ''),
      4: fecha(identidad.fecha), 6: tipo, 7: serie, 8: numero,
      10: campo(v.cliente_id_doc), 11: campo(v.cliente_documento_id), 12: campo(v.cliente),
      26: moneda, 27: '1.000' });
    if (nota) {
      const tipoOriginal = principalNota ? texto(v.r_cod_ref) : texto(v.r_cod);
      const serieOriginal = principalNota ? v.r_serie_ref : v.r_serie;
      const numeroOriginal = principalNota ? v.r_numero_ref : v.r_numero;
      if (!['01', '03'].includes(tipoOriginal) || !serieOriginal || !numeroOriginal || !identidad.fechaOriginal) {
        fallo(`Nota ${tipo}-${serie}-${numero}: falta identificar fecha y comprobante original.`);
      }
      Object.assign(c, { 28: fecha(identidad.fechaOriginal), 29: tipoOriginal, 30: campo(serieOriginal), 31: campo(numeroOriginal) });
    }
    const valores = { 14: centimos(v.r_gravado), 16: centimos(v.r_igv), 18: centimos(v.r_exonerado),
      25: centimos(v.r_monto_total ?? v.precio_neto) };
    if (valores[14] + valores[16] + valores[18] !== valores[25] && !anulado) {
      fallo(`Comprobante ${tipo}-${serie}-${numero}: base, IGV y exonerado no coinciden con el total.`);
    }
    for (let j = 13; j <= 25; j++) {
      let monto = valores[j] || 0n;
      if (anulado) monto = 0n;
      else if (tipo === '07') monto = monto > 0n ? -monto : monto;
      else if (tipo === '08') monto = monto < 0n ? -monto : monto;
      c[j] = importe(monto);
    }
    const clave = [tipo, serie, numero.replace(/^0+(?=\d)/, '')].join('-');
    const anterior = grupos.get(clave);
    if (anterior) {
      const iguales = [4, 10, 11, 12, 26, 27, 28, 29, 30, 31];
      if (anterior.anulado !== anulado || iguales.some((j) => anterior.c[j] !== c[j])) fallo(`Comprobante ${clave}: lineas con datos incompatibles.`);
      for (let j = 13; j <= 25; j++) anterior.c[j] = importe(centimos(anterior.c[j]) + centimos(c[j]));
    } else grupos.set(clave, { c, anulado });
  }
  const filas = [...grupos.values()].map((g) => g.c).sort((a, b) => [a[4].split('/').reverse().join(''), a[6], a[7], a[8].padStart(8, '0')].join(':')
    .localeCompare([b[4].split('/').reverse().join(''), b[6], b[7], b[8].padStart(8, '0')].join(':')));
  const nombreArchivo = `LE${documentoId}${periodo.replace('-', '')}00140400020${filas.length ? '1' : '0'}12.txt`;
  const buffer = Buffer.from(filas.map((c) => c.join('|') + '|').join('\r\n') + (filas.length ? '\r\n' : ''), 'utf8');
  const resumen = Object.fromEntries([['total', 25], ['base_gravada', 14], ['igv', 16], ['exonerado', 18]]
    .map(([nombre, columna]) => [nombre, importe(filas.reduce((suma, c) => suma + centimos(c[columna]), 0n))]));
  return { ...prepararArchivo({ buffer, nombreArchivo, documentoId, periodo }), resumen };
};
module.exports = { generarArchivo };
