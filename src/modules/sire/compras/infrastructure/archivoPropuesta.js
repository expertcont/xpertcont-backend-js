const AdmZip = require('adm-zip');
const error = message => Object.assign(new Error(message), { statusCode: 422 });
const leerArchivoPropuesta = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length > 20 * 1024 * 1024) throw error('El archivo de compras supera el limite de 20 MB.');
  let contenido = buffer;
  if (buffer.subarray(0, 2).toString() === 'PK') {
    const zip = new AdmZip(buffer);
    const files = zip.getEntries().filter(e => !e.isDirectory);
    if (files.length !== 1 || !/\.(txt|csv)$/i.test(files[0].entryName)) throw error('El ZIP debe contener un unico TXT o CSV de propuesta RCE.');
    if (files[0].header.size > 30 * 1024 * 1024) throw error('La propuesta descomprimida supera el limite de 30 MB.');
    contenido = zip.readFile(files[0]);
  }
  try { return new TextDecoder('utf-8', {fatal:true}).decode(contenido); }
  catch (_) { return new TextDecoder('windows-1252').decode(contenido); }
};
module.exports = { leerArchivoPropuesta };
