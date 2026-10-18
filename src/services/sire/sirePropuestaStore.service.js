const AdmZip = require('adm-zip');
const { createHash } = require('node:crypto');
const { registrarDatosPropuesta } = require('../../repositories/sire/sirePropuestaDatos.repository');
const pool = require('../../db');
const { convertirFechaStringComplete, corregirTCPEN } = require('../../utils/libreria.utils');

const toText = (value = '') => String(value ?? '').trim();

const limitText = (value, maxLength) => toText(value).slice(0, maxLength);

const toNumber = (value = 0) => {
  const normalized = toText(value).replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value) => {
  const formatted = convertirFechaStringComplete(toText(value));
  return formatted || null;
};

const extractSireTextBuffer = (buffer, nombreArchivo = '') => {
  const fileName = toText(nombreArchivo).toLowerCase();
  const looksZip = fileName.endsWith('.zip') || buffer.slice(0, 2).toString('utf8') === 'PK';

  if (!looksZip) return buffer;

  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((item) => !item.isDirectory);

  if (!entry) {
    throw new Error('El ZIP SIRe no contiene archivo de propuesta.');
  }

  return zip.readFile(entry);
};

const parsearPropuestaVentasSire = ({ buffer, nombreArchivo = '' }) => {
  const textBuffer = extractSireTextBuffer(buffer, nombreArchivo);
  const fileData = textBuffer.toString('utf8');
  const lines = fileData.split(/\r?\n/).filter((line) => line.trim() !== '');

  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => index > 0)
    .map(({ line, index }) => {
      const row = line.replace(/\r$/, '').split('|');

      return {
        linea: index,
        fecha_emision: toDate(row[4]),
        fecha_vencimiento: toDate(row[5]),
        tipo_comprobante: limitText(row[6], 2).replace(/,/g, ''),
        serie: limitText(row[7], 20).replace(/,/g, ''),
        numero: limitText(row[8], 30).replace(/,/g, ''),
        numero_final: limitText(row[9], 30).replace(/,/g, ''),
        tipo_doc_cliente: limitText(row[10], 2).replace(/,/g, ''),
        nro_doc_cliente: limitText(row[11], 20).replace(/,/g, ''),
        cliente: limitText(row[12], 250).replace(/,/g, ''),
        base_exportacion: toNumber(row[13]),
        base_gravada: toNumber(row[14]),
        descuento_base_gravada: toNumber(row[15]),
        igv: toNumber(row[16]),
        descuento_igv: toNumber(row[17]),
        exonerado: toNumber(row[18]),
        inafecto: toNumber(row[19]),
        isc: toNumber(row[20]),
        ivap: toNumber(row[22]),
        icbp: toNumber(row[23]),
        otros: toNumber(row[24]),
        total: toNumber(row[25]),
        moneda: limitText(row[26], 5) || 'PEN',
        tipo_cambio: toNumber(corregirTCPEN(row[27], row[26])) || null,
        fecha_emision_ref: toDate(row[28]),
        tipo_comprobante_ref: limitText(row[29], 2),
        serie_ref: limitText(row[30], 20),
        numero_ref: limitText(row[31], 30),
        car_sunat: limitText(row[3], 50),
        raw_linea: line,
      };
    })
    .filter((row) => row.tipo_comprobante || row.serie || row.numero);
};

const montos = ['base_exportacion','base_gravada','descuento_base_gravada','igv','descuento_igv',
  'exonerado','inafecto','isc','ivap','icbp','otros','total'];
const resumenMonedas = rows => {
  const resultado = {};
  for (const r of rows) {
    const grupo = resultado[r.moneda] ||= { cantidad: 0, ...Object.fromEntries(montos.map(c => [c, 0n])) };
    grupo.cantidad++;
    for (const c of montos) grupo[c] += BigInt(Number(r[c] || 0).toFixed(2).replace('.', ''));
  }
  const importe = n => (n < 0n ? '-' : '') + String((n < 0n ? -n : n) / 100n) + '.' + String((n < 0n ? -n : n) % 100n).padStart(2, '0');
  return Object.fromEntries(Object.entries(resultado).map(([moneda,g]) => [moneda,
    { cantidad:g.cantidad, ...Object.fromEntries(montos.map(c => [c, importe(g[c])])) }]));
};
const respuesta = (ticket, rows) => ({
  ticket, id_propuesta: ticket, // Alias HTTP para el frontend existente; no es un ID en PostgreSQL.
  cantidad_registros: rows.length,
  ...Object.fromEntries([['total_base_gravada','base_gravada'],['total_exonerado','exonerado'],
    ['total_inafecto','inafecto'],['total_igv','igv'],['total_importe','total']]
    .map(([salida,campo]) => [salida, rows.reduce((n,r) => n + Number(r[campo] || 0), 0)])),
});

const guardarPropuestaVentasSire = async ({ idAnfitrion, documentoId, periodo, idLibro='140000', ticket, nombreArchivo, buffer, db }) => {
  const conflicto = message => Object.assign(new Error(message), { statusCode:409 });
  if (idLibro !== '140000' || !idAnfitrion || idAnfitrion.length > 50 || !/^\d{11}$/.test(documentoId)
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) || !ticket || String(ticket).length > 50 || !nombreArchivo || !Buffer.isBuffer(buffer)) {
    throw Object.assign(new Error('Indica usuario, RUC, periodo, ticket y archivo RVIE validos.'), { statusCode:400 });
  }
  const rows = parsearPropuestaVentasSire({ buffer, nombreArchivo });
  const identidades = new Set();
  for (const r of rows) {
    const campos = r.raw_linea.split('|');
    if (campos[0].trim() !== documentoId || campos[2].trim() !== periodo.replace('-', '')) throw conflicto('La propuesta descargada no corresponde al RUC y periodo solicitados.');
    if (!/^\d{2}$/.test(r.tipo_comprobante) || !r.serie || r.serie.length > 5 || !r.numero || r.numero.length > 22) {
      throw Object.assign(new Error('Comprobante RVIE con tipo, serie o numero incompatible con la clave de la tabla. Linea '+r.linea+'.'), { statusCode:422 });
    }
    const key = JSON.stringify([r.tipo_comprobante, r.serie, r.numero.replace(/^0+(?=\d)/,'')]);
    if (identidades.has(key)) throw conflicto('La propuesta contiene un comprobante repetido. No se guardo una carga parcial.');
    identidades.add(key);
  }
  const client = db || await pool.connect();
  const contexto = [idAnfitrion, documentoId, periodo];
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sire-presentacion:${idAnfitrion}:${documentoId}:${periodo}:${idLibro}`]);
    const actual = await client.query(`SELECT sire_tpropuesta FROM public.mct_contabilidadticket
      WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro=$4::text FOR UPDATE`, [...contexto,idLibro]);
    if (actual.rows[0]?.sire_tpropuesta && actual.rows[0].sire_tpropuesta !== ticket) throw conflicto('El ticket cambio durante la descarga. Recupera la ultima propuesta antes de importar.');
    const reemplazo = await client.query(`SELECT ticket_actualizacion FROM public.mve_sire_reemplazo
      WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND id_libro=$4::text AND estado='TERMINADO'
      ORDER BY fecha_preparacion DESC LIMIT 1`, [...contexto,idLibro]);
    if (reemplazo.rows[0] && reemplazo.rows[0].ticket_actualizacion !== ticket) throw conflicto('La propuesta anterior fue reemplazada. Actualiza la descarga desde el resultado de reemplazo.');
    const h = await registrarDatosPropuesta({ idAnfitrion,documentoId,periodo,ticket },client);
    const huella = createHash('sha256').update(buffer).digest('hex');
    if (h.estado === 'REEMPLAZADO') throw conflicto('Esta descarga fue reemplazada y no puede volver a activarse.');
    if (h.huella_archivo && h.huella_archivo !== huella) throw conflicto('SUNAT devolvio otro archivo para el mismo ticket. Se conservo el original.');
    // Una sola tabla operativa por comprobante. Las descargas anteriores conservan su BYTEA en *_datos.
    await client.query('DELETE FROM public.mve_sire_propuesta WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text',contexto);
    const tipos = { linea:'integer',fecha_emision:'date',fecha_vencimiento:'date',tipo_comprobante:'varchar',serie:'varchar',numero:'varchar',numero_final:'varchar',
      tipo_doc_cliente:'varchar',nro_doc_cliente:'varchar',cliente:'varchar',...Object.fromEntries(montos.map(c=>[c,'numeric'])),
      moneda:'varchar',tipo_cambio:'numeric',fecha_emision_ref:'date',tipo_comprobante_ref:'varchar',serie_ref:'varchar',numero_ref:'varchar',car_sunat:'varchar',raw_linea:'text' };
    const nombres = Object.keys(tipos);
    if(rows.length) await client.query('INSERT INTO public.mve_sire_propuesta (id_usuario,documento_id,periodo,r_cod,r_serie,r_numero,ticket,'+nombres.join(',')+') '+
      'SELECT $1::text,$2::text,$3::text,r.tipo_comprobante,r.serie,r.numero,$4::text,'+nombres.map(c=>'r.'+c).join(',')+
      ' FROM jsonb_to_recordset($5::jsonb) AS r('+nombres.map(c=>c+' '+tipos[c]).join(',')+')',[...contexto,ticket,JSON.stringify(rows)]);
    await client.query(`UPDATE public.mve_sire_propuesta_datos SET nombre_archivo=$5::text,archivo=$6::bytea,huella_archivo=$7::text,
      cantidad_registros=$8::integer,totales_originales=$9::jsonb,estado='PARSEADO',estado_normalizacion='NORMALIZADO',normalizacion_version=1,
      fecha_descarga=COALESCE(fecha_descarga,clock_timestamp()),ctrl_mod=clock_timestamp(),ctrl_mod_us=$1::text
      WHERE id_usuario=$1::text AND documento_id=$2::text AND periodo=$3::text AND ticket=$4::text`,
      [...contexto,ticket,nombreArchivo,buffer,huella,rows.length,JSON.stringify(resumenMonedas(rows))]);
    await client.query('COMMIT');
    return respuesta(ticket,rows);
  } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { if(!db)client.release(); }
};
module.exports = { guardarPropuestaVentasSire, parsearPropuestaVentasSire };
