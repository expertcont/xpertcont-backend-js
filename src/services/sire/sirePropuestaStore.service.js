const AdmZip = require('adm-zip');
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
        raw_linea: line,
      };
    })
    .filter((row) => row.tipo_comprobante || row.serie || row.numero);
};

const sumar = (rows, key) => rows.reduce((acc, row) => acc + toNumber(row[key]), 0);

const guardarPropuestaVentasSire = async ({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro,
  ticket,
  nombreArchivo,
  buffer,
}) => {
  const rows = parsearPropuestaVentasSire({ buffer, nombreArchivo });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `
        SELECT id_propuesta
          FROM public.mve_sire_propuesta
         WHERE id_usuario = $1
           AND documento_id = $2
           AND periodo = $3
           AND id_libro = $4
           AND origen = 'TRANSPORTE'
           AND ticket = $5
         LIMIT 1
      `,
      [idAnfitrion, documentoId, periodo, idLibro, ticket]
    );

    let idPropuesta = existing.rows[0]?.id_propuesta;

    if (idPropuesta) {
      await client.query(
        `
          UPDATE public.mve_sire_propuesta
             SET nombre_archivo = $2,
                 estado = 'PARSEADO',
                 cantidad_registros = $3,
                 total_base_gravada = $4,
                 total_exonerado = $5,
                 total_inafecto = $6,
                 total_igv = $7,
                 total_importe = $8,
                 fecha_descarga = CURRENT_TIMESTAMP,
                 observacion = NULL,
                 ctrl_mod = CURRENT_TIMESTAMP,
                 ctrl_mod_us = $9
           WHERE id_propuesta = $1
        `,
        [
          idPropuesta,
          nombreArchivo,
          rows.length,
          sumar(rows, 'base_gravada'),
          sumar(rows, 'exonerado'),
          sumar(rows, 'inafecto'),
          sumar(rows, 'igv'),
          sumar(rows, 'total'),
          idAnfitrion,
        ]
      );

      await client.query('DELETE FROM public.mve_sire_propuesta_det WHERE id_propuesta = $1', [idPropuesta]);
    } else {
      const inserted = await client.query(
        `
          INSERT INTO public.mve_sire_propuesta (
            id_usuario, documento_id, periodo, id_libro, origen, ticket,
            nombre_archivo, estado, cantidad_registros, total_base_gravada,
            total_exonerado, total_inafecto, total_igv, total_importe, ctrl_crea_us
          )
          VALUES ($1, $2, $3, $4, 'TRANSPORTE', $5, $6, 'PARSEADO', $7, $8, $9, $10, $11, $12, $13)
          RETURNING id_propuesta
        `,
        [
          idAnfitrion,
          documentoId,
          periodo,
          idLibro,
          ticket,
          nombreArchivo,
          rows.length,
          sumar(rows, 'base_gravada'),
          sumar(rows, 'exonerado'),
          sumar(rows, 'inafecto'),
          sumar(rows, 'igv'),
          sumar(rows, 'total'),
          idAnfitrion,
        ]
      );

      idPropuesta = inserted.rows[0].id_propuesta;
    }

    for (const row of rows) {
      await client.query(
        `
          INSERT INTO public.mve_sire_propuesta_det (
            id_propuesta, linea, fecha_emision, fecha_vencimiento,
            tipo_comprobante, serie, numero, numero_final,
            tipo_doc_cliente, nro_doc_cliente, cliente,
            base_exportacion, base_gravada, descuento_base_gravada,
            igv, descuento_igv, exonerado, inafecto, isc, ivap, icbp,
            otros, total, moneda, tipo_cambio, fecha_emision_ref,
            tipo_comprobante_ref, serie_ref, numero_ref, raw_linea
          )
          VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26,
            $27, $28, $29, $30
          )
        `,
        [
          idPropuesta,
          row.linea,
          row.fecha_emision,
          row.fecha_vencimiento,
          row.tipo_comprobante,
          row.serie,
          row.numero,
          row.numero_final,
          row.tipo_doc_cliente,
          row.nro_doc_cliente,
          row.cliente,
          row.base_exportacion,
          row.base_gravada,
          row.descuento_base_gravada,
          row.igv,
          row.descuento_igv,
          row.exonerado,
          row.inafecto,
          row.isc,
          row.ivap,
          row.icbp,
          row.otros,
          row.total,
          row.moneda,
          row.tipo_cambio,
          row.fecha_emision_ref,
          row.tipo_comprobante_ref,
          row.serie_ref,
          row.numero_ref,
          row.raw_linea,
        ]
      );
    }

    await client.query('COMMIT');

    return {
      id_propuesta: idPropuesta,
      cantidad_registros: rows.length,
      total_base_gravada: sumar(rows, 'base_gravada'),
      total_exonerado: sumar(rows, 'exonerado'),
      total_inafecto: sumar(rows, 'inafecto'),
      total_igv: sumar(rows, 'igv'),
      total_importe: sumar(rows, 'total'),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  guardarPropuestaVentasSire,
  parsearPropuestaVentasSire,
};
