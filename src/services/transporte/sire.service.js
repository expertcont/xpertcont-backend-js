const repository = require('../../repositories/transporte/sire.repository');
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
  obtenerRegistroSireTransporte,
  generarTicketPropuestaSireTransporte,
  consultarEstadoPropuestaSireTransporte,
  descargarPropuestaSireTransporte,
};
