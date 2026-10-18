const repository = require('../../repositories/transporte/sire.repository');
const sireRepository = require('../../repositories/sire/sire.repository');
const sireSunatClient = require('../sire/sireSunatClient.service');
const { guardarPropuestaVentasSire } = require('../sire/sirePropuestaStore.service');
const { registrarDatosPropuesta,obtenerArchivoPropuesta } = require('../../repositories/sire/sirePropuestaDatos.repository');

const normalizarContexto = p => {
  const idAnfitrion=String(p.idAnfitrion || '').trim(),documentoId=String(p.documentoId || '').trim();
  const mes=String(p.periodo || '').match(/^(\d{4})-?(0[1-9]|1[0-2])$/);
  const idLibro=sireSunatClient.normalizarIdLibroSire(p.idLibro || '014');
  if (!idAnfitrion || idAnfitrion.length>50 || !/^\d{11}$/.test(documentoId) || !mes || idLibro!=='140000') {
    throw Object.assign(new Error('Indica usuario, RUC de 11 digitos, periodo valido y libro RVIE.'),{statusCode:400});
  }
  return { ...p,idAnfitrion,documentoId,periodo:mes[1]+'-'+mes[2],idLibro };
};

const obtenerRegistroSireTransporte = async ({ idAnfitrion, documentoId, periodo }) => {
  const data = await repository.obtenerRegistroSireTransporteQuery([periodo, idAnfitrion, documentoId]);
  const observaciones = data.filter((item) => Array.isArray(item.observaciones) && item.observaciones.length > 0);
  const resumen = data.reduce((acc, item) => {
    acc.total_comprobantes += 1;
    acc.total_base_gravada += Number(item.base_gravada || 0);
    acc.total_exonerado += Number(item.exonerado || 0);
    acc.total_inafecto += Number(item.inafecto || 0);
    acc.total_igv += Number(item.igv || 0);
    acc.total += Number(item.total || 0);
    if (Array.isArray(item.observaciones) && item.observaciones.length > 0) {
      acc.total_observaciones += 1;
    }
    return acc;
  }, {
    total_comprobantes: 0,
    total_observaciones: 0,
    total_base_gravada: 0,
    total_exonerado: 0,
    total_inafecto: 0,
    total_igv: 0,
    total: 0,
  });

  return { data, observaciones, resumen };
};

const obtenerComparacionSireTransporte = async ({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro = '014',
}) => {
  const idLibroSire = sireSunatClient.normalizarIdLibroSire(idLibro);
  const data = await repository.obtenerComparacionSireTransporteQuery({
    idAnfitrion,
    documentoId,
    periodo,
    idLibro: idLibroSire,
  });

  const resumen = data.reduce((acc, row) => {
    acc.total += 1;
    const severidad = String(row.severidad || '').toLowerCase();
    const categoria = String(row.categoria || '').toLowerCase();
    if (severidad === 'critico') acc.criticos += 1;
    if (severidad === 'medio') acc.medios += 1;
    if (categoria.includes('faltante')) acc.faltantes += 1;
    if (categoria.includes('duplicado')) acc.duplicados += 1;
    if (String(row.resultado || '').toUpperCase() === 'DIFERENCIA') acc.diferencias += 1;
    return acc;
  }, {
    total: 0,
    criticos: 0,
    medios: 0,
    faltantes: 0,
    diferencias: 0,
    duplicados: 0,
  });

  return { data, resumen };
};

const obtenerUltimaPropuestaSireTransporte = async (entrada) => {
  const params=normalizarContexto(entrada);
  const idLibro = sireSunatClient.normalizarIdLibroSire(params.idLibro || '014');
  const datosTicket = await sireRepository.obtenerDatosTicketPropuestaSire({ ...params, idLibro });
  const ticketGuardado = datosTicket?.sire_tpropuesta || '';
  let propuesta;
  try {
    const reemplazo = await repository.obtenerReemplazoTerminadoQuery({ ...params, idLibro });
    if (reemplazo && reemplazo.estado_actualizacion !== 'ACTUALIZADO') return {
      ticket: reemplazo.ticket_actualizacion || '', reutilizado: Boolean(reemplazo.ticket_actualizacion),
      nombre_archivo_rep: '', importacion: null, actualizacion_pendiente: true,
    };
    propuesta = await repository.obtenerPropuestaGuardadaSireTransporteQuery({
      ...params, idLibro, ticket: ticketGuardado,
    });
  } catch (error) {
    if (!ticketGuardado) throw error;
    console.error('Ticket SIRE recuperado sin verificar propuesta o reemplazo:', error.message);
    return {
      ticket: ticketGuardado, reutilizado: true,
      fecha_generacion: datosTicket?.sire_tpropuesta_fecha_generacion || null,
      nombre_archivo_rep: '', importacion: null,
      advertencia: 'Ticket guardado recuperado. No se pudo verificar la propuesta importada o su reemplazo. La presentacion permanecera bloqueada hasta recuperar ese estado.',
    };
  }
  const ticket = ticketGuardado || propuesta?.ticket || '';
  return {
    ticket,
    reutilizado: Boolean(ticket),
    fecha_generacion: datosTicket?.sire_tpropuesta_fecha_generacion || propuesta?.fecha_generacion || null,
    nombre_archivo_rep: propuesta?.nombre_archivo || '',
    importacion: propuesta && ['PARSEADO', 'COMPARADO'].includes(propuesta.estado)
      ? { id_propuesta: propuesta.ticket, ticket: propuesta.ticket, cantidad_registros: propuesta.cantidad_registros }
      : null,
  };
};

const generarTicketPropuestaSireTransporte = async (p) => {
  const contexto=normalizarContexto(p);
  const resultado=await sireSunatClient.generarTicketPropuestaSire(contexto);
  await registrarDatosPropuesta({ ...contexto,ticket:resultado.ticket,fechaGeneracion:resultado.fecha_generacion });
  return resultado;
};

const consultarEstadoPropuestaSireTransporte = async ({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro = '014',
  ticket,
}) => {
  const estado = await sireSunatClient.consultarEstadoTicketSire({
    idAnfitrion,
    documentoId,
    periodo,
    ticket,
  });

  if (!estado.nombre_archivo_rep) {
    return estado;
  }

  const idLibroSire = sireSunatClient.normalizarIdLibroSire(idLibro);
  const descarga = await sireSunatClient.descargarPropuestaSire({
    idAnfitrion,
    documentoId,
    periodo,
    idLibro,
    ticket,
    nombreArchivo: estado.nombre_archivo_rep,
  });

  const importacion = await guardarPropuestaVentasSire({
    idAnfitrion,
    documentoId,
    periodo,
    idLibro: idLibroSire,
    ticket,
    nombreArchivo: estado.nombre_archivo_rep,
    buffer: descarga.buffer,
  });

  return {
    ...estado,
    propuesta_importada: true,
    importacion,
  };
};

const descargarPropuestaSireTransporte = async (entrada) => {
  const p=normalizarContexto(entrada);
  const guardado=await obtenerArchivoPropuesta(p);
  if (guardado) return { buffer:guardado.archivo,nombre_archivo_rep:guardado.nombre_archivo,
    content_type:guardado.archivo.subarray(0,2).toString()==='PK'?'application/zip':'text/plain; charset=utf-8' };
  return sireSunatClient.descargarPropuestaSire(p);
};

module.exports = {
  obtenerUltimaPropuestaSireTransporte,
  obtenerRegistroSireTransporte: p=>obtenerRegistroSireTransporte(normalizarContexto(p)),
  obtenerComparacionSireTransporte: p=>obtenerComparacionSireTransporte(normalizarContexto(p)),
  generarTicketPropuestaSireTransporte,
  consultarEstadoPropuestaSireTransporte: p=>consultarEstadoPropuestaSireTransporte(normalizarContexto(p)),
  descargarPropuestaSireTransporte,
};
