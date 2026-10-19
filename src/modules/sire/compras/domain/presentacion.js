const AdmZip = require('adm-zip');
const {createHash} = require('node:crypto');
const {validarCompra, clave, fallo} = require('./personalizada');
const {resumen} = require('./registro');
const {decimal} = require('./decimal');

const hash = b => createHash('sha256').update(b).digest('hex');
const fecha = s => s ? s.split('-').reverse().join('/') : '';
const texto = v => {
  const s = String(v ?? '');
  if (/[|\r\n\x00-\x1f]/.test(s)) throw fallo('Un campo contiene separadores o caracteres de control no permitidos en el TXT RCE.');
  return s;
};
const adicional = (c, numero) => {
  const entrada = Object.entries(c.datos_adicionales || {}).find(([k]) => k.startsWith(numero + ':'));
  return entrada ? texto(entrada[1]) : '';
};
// Anexo 11: no usar la estructura de Ventas ni exportar la cabecera del TXT descargado.
function generarArchivo(p, registros, razonSocial, monedaContable = 'PEN') {
  if (!['PEN','USD'].includes(monedaContable)) throw fallo('Selecciona PEN o USD como moneda contable.');
  const nombre = texto(razonSocial).trim();
  if (registros.length && (!nombre || nombre.length > 1500)) throw fallo('Indica la razon social de la empresa para preparar el RCE.');
  const claves = new Set();
  const comprobantes = registros.map(r => validarCompra(r.comprobante, p.periodo));
  const lineas = comprobantes.map(c => {
    const k = clave(c);
    if (claves.has(k)) throw fallo('Hay comprobantes repetidos en las compras por declarar.');
    claves.add(k);
    if (['91','97','98'].includes(c.tipo_comprobante) || (c.tipo_comprobante==='00' && ['0','B','C','D'].includes(c.tipo_doc_proveedor))) {
      throw fallo('Las operaciones con no domiciliados requieren su registro separado; no se incluyen en este archivo RCE.');
    }
    if (['07','08','87','88'].includes(c.tipo_comprobante)
      && (!c.fecha_emision_ref || !c.tipo_comprobante_ref || !c.serie_ref || !c.numero_ref)) {
      throw fallo('La nota '+c.serie+'-'+c.numero+' requiere fecha, tipo, serie y numero del comprobante modificado.');
    }
    const montos = ['base001','igv001','base002','igv002','base003','igv003','base004','isc','icbp','otros','total'];
    for (const campo of montos) if (!/^-?\d{1,12}\.\d{2}$/.test(c[campo])) throw fallo('Importe fuera del formato RCE en '+campo+'.');
    // El contador registra importes con su signo; no invertir automaticamente las notas.
    const tc = c.moneda === monedaContable ? '' : decimal(c.tipo_cambio, 3);
    if (c.moneda !== monedaContable && Number(c.tipo_cambio) <= 0) throw fallo('El comprobante '+c.numero+' requiere tipo de cambio mayor que cero.');
    if (tc && Number(tc) !== Number(c.tipo_cambio)) throw fallo('El tipo de cambio RCE admite tres decimales. Revisa '+c.numero+'.');
    const columnas = [p.documentoId,nombre,p.periodo.replace('-',''),'', // CAR: SUNAT lo completa en reemplazo
      fecha(c.fecha_emision),fecha(c.fecha_vencimiento),c.tipo_comprobante,c.serie,c.ano_dam,c.numero,c.numero_final,
      c.tipo_doc_proveedor,c.documento_proveedor,c.proveedor,...montos.map(m=>c[m]),c.moneda,tc,
      fecha(c.fecha_emision_ref),c.tipo_comprobante_ref,c.serie_ref,c.codigo_dam_dsi_ref,c.numero_ref,c.clasificacion_bienes_servicios,
      adicional(c,34),adicional(c,35),adicional(c,36),'', // campo 37: solo ajustes posteriores
      adicional(c,38),adicional(c,39),adicional(c,40),adicional(c,41)];
    const libres = Array.from({length:39},(_,i)=>adicional(c,i+42));
    while (libres.length && !libres.at(-1)) libres.pop();
    return [...columnas,...libres].map(texto).join('|')+'|';
  });
  const txt = Buffer.from(lineas.length ? lineas.join('\r\n')+'\r\n' : '', 'utf8');
  if (txt.length > 20*1024*1024) throw fallo('El archivo RCE supera el limite local de 20 MiB.');
  const nombreTxt = 'LE'+p.documentoId+p.periodo.replace('-','')+'00080400021'+(lineas.length?'1':'0')+(monedaContable==='PEN'?'1':'2')+'2.txt';
  const zip = new AdmZip(); zip.addFile(nombreTxt, txt);
  return {archivo:zip.toBuffer(),nombre_archivo:nombreTxt.replace('.txt','.zip'),hash_archivo:hash(txt),
    cantidad_registros:lineas.length,totales:resumen(comprobantes),moneda_contable:monedaContable};
}
function sinCambios(originales, registros, periodo) {
  const incluidos = registros.filter(r=>r.estado==='DECLARAR' && r.periodo_destino===periodo);
  if (incluidos.length !== originales.length) return false;
  const ordenar = v => Array.isArray(v)?v.map(ordenar):v && typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordenar(v[k])])):v;
  const canon = c => JSON.stringify(ordenar(validarCompra(c,periodo)));
  const mapa = new Map(originales.map(c=>[clave(c),canon(c)]));
  return mapa.size===originales.length && incluidos.every(r=>mapa.get(clave(r.comprobante))===canon(r.comprobante));
}
module.exports = {generarArchivo,sinCambios,hash};
