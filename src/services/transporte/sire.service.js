const repository = require('../../repositories/transporte/sire.repository');
const sireSunatClient = require('../sire/sireSunatClient.service');

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
  ticket,
}) => sireSunatClient.consultarEstadoTicketSire({
  idAnfitrion,
  documentoId,
  periodo,
  ticket,
});

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
