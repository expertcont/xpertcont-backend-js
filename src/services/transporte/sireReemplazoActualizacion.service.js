const repository = require('../../repositories/sire/sireReemplazo.repository');
const sire = require('../sire/sireSunatClient.service');
const { guardarPropuestaVentasSire } = require('../sire/sirePropuestaStore.service');

// Se reanuda con el ticket persistido; nunca vuelve a enviar el reemplazo.
const sincronizarReemplazo = async (p, registro, db) => {
  if (registro.estado !== 'TERMINADO' || registro.estado_actualizacion === 'ACTUALIZADO') return registro;
  let actual = registro;
  try {
    await repository.invalidarPropuestas(p, actual, db);
    if (!actual.ticket_actualizacion) {
      const descarga = await sire.generarTicketPropuestaSire({ ...p, db, reutilizarExistente: false });
      actual = await repository.guardarActualizacion(p, actual, { estado: 'PENDIENTE', ticket: descarga.ticket }, db);
    }
    const consulta = await sire.consultarEstadoTicketSire({ ...p, db, ticket: actual.ticket_actualizacion });
    const ticket = (consulta.registros || []).find((r) => String(r.numTicket) === actual.ticket_actualizacion
      && String(r.perTributario) === p.periodo.replace('-', '') && Number(r.codProceso) === 10);
    if (!ticket) return actual;
    if ([ticket.codEstadoProceso, ticket.detalleTicket?.codEstadoEnvio].includes('03')) {
      throw Object.assign(new Error('SUNAT rechazo la descarga de la propuesta actualizada. Vuelve a actualizar para solicitar otra descarga.'), { reiniciarTicket: true });
    }
    const reporte = ticket.archivoReporte?.find((r) => r.nomArchivoReporte);
    if (!['04', '06'].includes(String(ticket.codEstadoProceso)) || !reporte) return actual;
    const archivo = await sire.descargarPropuestaSire({ ...p, db, ticket: actual.ticket_actualizacion, nombreArchivo: reporte.nomArchivoReporte });
    const importacion = await guardarPropuestaVentasSire({ ...p, db, ticket: actual.ticket_actualizacion,
      nombreArchivo: reporte.nomArchivoReporte, buffer: archivo.buffer });
    return await repository.guardarActualizacion(p, actual, {
      estado: 'ACTUALIZADO', ticket: importacion.ticket,
    }, db);
  } catch (error) {
    // El reemplazo sigue TERMINADO aunque falle la descarga o la base local.
    try { return await repository.guardarActualizacion(p, actual, { estado: 'ERROR', error: error.message, reiniciarTicket: error.reiniciarTicket === true }, db); }
    catch (_) { return { ...actual, estado_actualizacion: 'ERROR', error_actualizacion: error.message }; }
  }
};
module.exports = { sincronizarReemplazo };