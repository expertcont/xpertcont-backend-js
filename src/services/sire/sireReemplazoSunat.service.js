const fetch = require('node-fetch');
const { obtenerTokenSire } = require('./sireSunatClient.service');
const BASE = 'https://api-sire.sunat.gob.pe';
const PATH = '/v1/contribuyente/migeigv/libros/rvierce/receptorpropuesta/web/propuesta/upload';
const CHUNK_BYTES = 5 * 1024 * 1024;

const enviarArchivo = async ({ idAnfitrion, documentoId, periodo, buffer, nombreArchivo, db, guardarCarga }) => {
  const token = await obtenerTokenSire({ idAnfitrion, documentoId, db });
  const headers = { Authorization: `Bearer ${token}`, 'Tus-Resumable': '1.0.0' };
  const metadata = { filename: nombreArchivo, filetype: 'application/zip', numRuc: documentoId,
    perTributario: periodo.replace('-', ''), codOrigenEnvio: '2', codProceso: '3',
    codTipoCorrelativo: '01', nomArchivoImportacion: nombreArchivo, codLibro: '140000' };
  const encoded = Object.entries(metadata).map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`).join(',');
  let creada = false, ticket = null, urlCarga = null;
  const request = async (url, options) => {
    const response = await fetch(url, { ...options, timeout: 90000, redirect: 'error' });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
    if (!response.ok) {
      throw Object.assign(new Error(data?.msg || data?.message || 'SUNAT rechazo la carga RVIE.'), {
        statusCode: response.status >= 400 && response.status < 500 ? response.status : 502,
        resultadoIncierto: response.status >= 500 || [408, 409].includes(response.status) || (creada && response.status !== 422),
        respuestaSunat: data,
      });
    }
    return { response, data };
  };
  try {
    const inicio = await request(BASE + PATH, { method: 'POST', headers: {
      ...headers, 'Content-Type': 'application/x-www-form-urlencoded',
      'Upload-Length': String(buffer.length), 'Upload-Metadata': encoded,
    } });
    creada = true;
    const location = inicio.response.headers.get('location');
    if (!location) throw new Error('SUNAT no devolvio Location de carga TUS.');
    const destino = new URL(location, BASE + PATH);
    if (destino.origin !== BASE || !destino.pathname.startsWith(PATH + '/') || destino.username || destino.password || destino.hash) {
      throw new Error('SUNAT devolvio una URL de carga no permitida.');
    }
    urlCarga = destino.href;
    // Persistir Location antes del primer PATCH permite investigar un resultado incierto.
    await guardarCarga(urlCarga);
    let final;
    for (let offset = 0; offset < buffer.length;) {
      const fin = Math.min(offset + CHUNK_BYTES, buffer.length);
      const parte = await request(urlCarga, { method: 'PATCH', headers: {
        ...headers, 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset),
      }, body: buffer.subarray(offset, fin) });
      if (parte.data?.numTicket) ticket = String(parte.data.numTicket).trim();
      if (parte.response.headers.get('upload-offset') !== String(fin)) throw new Error('Offset TUS no confirmado por SUNAT.');
      offset = fin;
      final = parte.data;
    }
    if (!/^[A-Za-z0-9]{1,50}$/.test(ticket || '')) {
      ticket = null;
      throw new Error('SUNAT no devolvio ticket de reemplazo valido.');
    }
    return { ticket, respuesta_sunat: final, urlCarga };
  } catch (error) {
    // Un fallo de transporte o protocolo despues del POST puede haber causado efectos remotos.
    if (error.resultadoIncierto === undefined) error.resultadoIncierto = true;
    error.statusCode = error.statusCode || 503;
    error.ticketReemplazo = ticket;
    error.urlCarga = urlCarga;
    throw error;
  }
};
module.exports = { enviarArchivo };