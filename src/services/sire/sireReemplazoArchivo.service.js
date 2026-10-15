const AdmZip = require('adm-zip');
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');
const MAX_BYTES = 20 * 1024 * 1024;
const error = (message) => Object.assign(new Error(message), { statusCode: 400 });

// Validacion estructural local. Las reglas tributarias y los catalogos los valida SUNAT.
const prepararArchivo = ({ buffer, nombreArchivo, documentoId, periodo }) => {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES) {
    throw error('Adjunta un TXT o ZIP RVIE de hasta 20 MiB.');
  }
  let txt = buffer;
  let nombreTxt = String(nombreArchivo || '');
  if (/\.zip$/i.test(nombreTxt)) {
    let zip, entries;
    try { zip = new AdmZip(buffer); entries = zip.getEntries(); }
    catch (_) { throw error('ZIP RVIE invalido.'); }
    if (entries.length !== 1 || entries[0].isDirectory || entries[0].header.size > MAX_BYTES) {
      throw error('El ZIP debe contener exactamente un TXT RVIE de hasta 20 MiB.');
    }
    nombreTxt = entries[0].entryName;
    try { txt = zip.readFile(entries[0]); } catch (_) { throw error('No se pudo leer el TXT del ZIP RVIE.'); }
  }
  nombreTxt = nombreTxt.replace(/\.txt$/i, '.txt');
  const per = periodo.replace('-', '');
  // Tabla 6, anexo 1: LE + RUC + AAAAMM00 + 140400 + 02 + O/I/M + 2.
  const patron = new RegExp(`^LE${documentoId}${per}0014040002[012][01][12]2\\.txt$`);
  if (!patron.test(nombreTxt) || /[\\/]/.test(nombreTxt)) {
    throw error('El nombre TXT no corresponde al RUC, periodo y estructura de reemplazo RVIE (140400/02).');
  }
  if (!txt || txt.length > MAX_BYTES) throw error('El TXT excede el limite de 20 MiB.');
  let contenido;
  try { contenido = new TextDecoder('utf-8', { fatal: true }).decode(txt); }
  catch (_) { throw error('El TXT debe estar codificado en UTF-8.'); }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(contenido)) throw error('El TXT contiene caracteres de control.');
  const lineas = contenido.split(/\r?\n/);
  while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
  const indicador = nombreTxt.slice(-7, -6);
  if ((lineas.length === 0 && indicador !== '0') || (lineas.length > 0 && indicador !== '1')) {
    throw error('El indicador de contenido del nombre no coincide con los registros del TXT.');
  }
  const claves = new Set();
  for (let i = 0; i < lineas.length; i++) {
    const columnas = lineas[i].split('|');
    if (columnas[columnas.length - 1] === '') columnas.pop();
    const fallo = (detalle) => { throw error(`Linea ${i + 1}: ${detalle}`); };
    if (columnas.length < 33 || columnas.length > 40) fallo('se requieren entre 33 y 40 campos RVIE, sin cabecera.');
    if (columnas[0] !== documentoId || columnas[2] !== per) fallo('RUC o periodo distinto del contexto.');
    if (!columnas[1].trim() || !/^\d{2}$/.test(columnas[6]) || !columnas[8].trim()) fallo('emisor, tipo o numero de comprobante incompleto.');
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(columnas[4])) fallo('fecha de emision debe tener formato DD/MM/AAAA.');
    const [dia, mes, ano] = columnas[4].split('/').map(Number);
    const fecha = new Date(Date.UTC(ano, mes - 1, dia));
    if (fecha.getUTCFullYear() !== ano || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia
      || `${ano}${String(mes).padStart(2, '0')}` > per) fallo('fecha de emision invalida o posterior al periodo.');
    for (let j = 13; j <= 25; j++) {
      if (columnas[j] !== '' && !/^-?\d{1,12}(\.\d{1,2})?$/.test(columnas[j])) fallo(`importe invalido en campo ${j + 1}.`);
    }
    if (!/^[A-Z]{3}$/.test(columnas[26])) fallo('moneda invalida.');
    if (['07', '08', '87', '88'].includes(columnas[6]) && columnas.slice(28, 32).some((v) => !v.trim())) {
      fallo('la nota requiere fecha, tipo, serie y numero del comprobante modificado.');
    }
    const numero = (value) => /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, '') : value;
    const clave = [columnas[6], columnas[7], numero(columnas[8])].join(':');
    if (claves.has(clave)) fallo('comprobante duplicado.');
    claves.add(clave);
  }
  // Se comprime el contenido exacto revisado, sin reinterpretar importes ni moneda.
  const zip = new AdmZip();
  zip.addFile(nombreTxt, txt);
  const archivo = zip.toBuffer();
  return { buffer: archivo, nombreArchivo: nombreTxt.replace(/\.txt$/, '.zip'),
    hash: createHash('sha256').update(txt).digest('hex'), cantidad: lineas.length };
};
module.exports = { prepararArchivo, MAX_BYTES };