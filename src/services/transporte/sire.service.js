const repository = require('../../repositories/transporte/sire.repository');
const sireRepository = require('../../repositories/sire/sire.repository');
const sireSunatClient = require('../sire/sireSunatClient.service');
const { guardarPropuestaVentasSire } = require('../sire/sirePropuestaStore.service');

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

const obtenerUltimaPropuestaSireTransporte = async (params) => {
  const idLibro = sireSunatClient.normalizarIdLibroSire(params.idLibro || '014');
  const reemplazo = await repository.obtenerReemplazoTerminadoQuery({ ...params, idLibro });
  if (reemplazo && reemplazo.estado_actualizacion !== 'ACTUALIZADO') return {
    ticket: reemplazo.ticket_actualizacion || '', reutilizado: Boolean(reemplazo.ticket_actualizacion),
    nombre_archivo_rep: '', importacion: null, actualizacion_pendiente: true,
  };
  const datosTicket = await sireRepository.obtenerDatosTicketPropuestaSire({ ...params, idLibro });
  const ticketGuardado = datosTicket?.sire_tpropuesta || '';
  const propuesta = await repository.obtenerPropuestaGuardadaSireTransporteQuery({
    ...params, idLibro, ticket: ticketGuardado,
  });
  const ticket = ticketGuardado || propuesta?.ticket || '';
  return {
    ticket,
    reutilizado: Boolean(ticket),
    fecha_generacion: ticketGuardado ? datosTicket?.sire_tpropuesta_fecha_generacion || null : null,
    nombre_archivo_rep: propuesta?.nombre_archivo || '',
    importacion: propuesta && ['PARSEADO', 'COMPARADO'].includes(propuesta.estado)
      ? { id_propuesta: propuesta.id_propuesta, cantidad_registros: propuesta.cantidad_registros }
      : null,
  };
};

const generarTicketPropuestaSireTransporte = async ({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro = '014',
  reutilizarExistente = true,
}) => sireSunatClient.generarTicketPropuestaSire({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro,
  reutilizarExistente,
});

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

const descargarPropuestaSireTransporte = async ({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro = '014',
  ticket,
  nombreArchivo,
}) => sireSunatClient.descargarPropuestaSire({
  idAnfitrion,
  documentoId,
  periodo,
  idLibro,
  ticket,
  nombreArchivo,
});

module.exports = {
  obtenerUltimaPropuestaSireTransporte,
  obtenerRegistroSireTransporte,
  obtenerComparacionSireTransporte,
  generarTicketPropuestaSireTransporte,
  consultarEstadoPropuestaSireTransporte,
  descargarPropuestaSireTransporte,
};
