const { parsearTextoCompras, compararCompras } = require('../domain/compras');
// Puertos inyectados: la aplicacion no conoce Express, PostgreSQL ni Comercial.
module.exports = ({ propuestas: repo, comprasSistema, tickets, sunat, leerArchivo }) => {
const fallo = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validar = (entrada = {}) => {
  const idAnfitrion = String(entrada.id_anfitrion || '').trim();
  const documentoId = String(entrada.documento_id || '').trim();
  const m = String(entrada.periodo || '').trim().match(/^(\d{4})-?(0[1-9]|1[0-2])$/);
  if (!idAnfitrion || idAnfitrion.length > 60 || !/^\d{11}$/.test(documentoId) || !m) throw fallo('Selecciona una empresa con RUC de 11 digitos y un periodo valido.');
  return { idAnfitrion, documentoId, periodo: `${m[1]}-${m[2]}`, idLibro: '080000' };
};
const recuperar = async (entrada) => {
  const p = validar(entrada);
  const ticketGuardado = await tickets.obtenerDatosTicketPropuestaSire(p);
  const resultados = await Promise.allSettled([
    repo.obtenerPropuesta(p, ticketGuardado?.sire_tpropuesta || ''), comprasSistema.obtenerComprasSistema(p),
  ]);
  const ticket = ticketGuardado?.sire_tpropuesta || '';
  const advertencias = [];
  for (const [i, resultado] of resultados.entries()) {
    if (resultado.status !== 'rejected') continue;
    if (!ticket) throw resultado.reason;
    console.error('Error recuperando SIRE Compras (' + (i === 0 ? 'propuesta' : 'registro') + '):', resultado.reason.message);
    advertencias.push(i === 0
      ? 'El ticket se recupero, pero no se pudo cargar la propuesta guardada. Vuelve a consultar su estado.'
      : 'El ticket se recupero, pero no se pudieron cargar las compras del sistema. La comparacion no esta disponible.');
  }
  const propuesta = resultados[0].status === 'fulfilled' ? resultados[0].value : null;
  const sistemaDisponible = resultados[1].status === 'fulfilled';
  const sistema = sistemaDisponible ? resultados[1].value : [];
  return { ticket: ticket || propuesta?.ticket || '', fecha_generacion: ticketGuardado?.sire_tpropuesta_fecha_generacion || null,
    propuesta, sistema, sistema_disponible: sistemaDisponible, advertencia: advertencias.join(' '),
    comparacion: propuesta && sistemaDisponible ? compararCompras(propuesta.detalle, sistema) : [] };
};
const generarTicket = async (entrada) => sunat.generarTicketPropuestaSire({
  ...validar(entrada), reutilizarExistente: entrada.reutilizar_existente !== false,
});
const consultar = async (entrada) => {
  const p = validar(entrada);
  const datos = await tickets.obtenerDatosTicketPropuestaSire(p);
  const ticket = datos?.sire_tpropuesta;
  if (!ticket) throw fallo('Primero genera el ticket de la propuesta de compras.');
  if (entrada.ticket !== ticket) throw fallo('El ticket cambio. Recupera el estado del periodo antes de consultar.', 409);
  const respuesta = await sunat.consultarEstadoTicketSire({ ...p, ticket });
  const registro = (respuesta.registros || []).find(r => String(r.numTicket) === String(ticket)
    && String(r.perTributario) === p.periodo.replace('-', '') && Number(r.codProceso) === 10
    && (!r.codLibro || String(r.codLibro) === p.idLibro));
  if (!registro) return { listo: false, message: 'SUNAT aun no devuelve el ticket de compras solicitado.' };
  const lista = valor => Array.isArray(valor) ? valor : valor ? [valor] : [];
  const detalles = lista(registro.detalleTicket).filter(r => !r.numTicket || String(r.numTicket) === String(ticket));
  const codigo = valor => String(valor ?? '').padStart(2, '0');
  if ([registro.codEstadoProceso, ...detalles.map(r => r.codEstadoEnvio)].map(codigo).includes('03')) throw fallo('SUNAT rechazo la descarga de la propuesta de compras.', 422);
  const reportes = lista(registro.archivoReporte);
  const reporte = reportes.find(r => r.nomArchivoReporte) || detalles.find(r => r.nomArchivoReporte);
  const nombreArchivo = reporte?.nomArchivoReporte;
  const estado = codigo(registro.codEstadoProceso ?? detalles[0]?.codEstadoEnvio);
  if (!['04', '06'].includes(estado) || !nombreArchivo) return { listo: false, message: registro.desEstadoProceso || 'La propuesta de compras sigue en proceso.' };
  const tipoArchivo = reporte.codTipoArchivoReporte !== undefined
    ? reporte.codTipoArchivoReporte : reporte.codTipoAchivoReporte;
  const archivo = await sunat.descargarPropuestaSire({ ...p, ticket, nombreArchivo, codTipoArchivoReporte: tipoArchivo });
  const detalle = parsearTextoCompras({ contenido: leerArchivo(archivo.buffer), documentoId: p.documentoId, periodo: p.periodo });
  // No sobrescribir una propuesta si otro usuario genero un ticket nuevo durante la descarga.
  const actual = await tickets.obtenerDatosTicketPropuestaSire(p);
  if (actual?.sire_tpropuesta !== ticket) throw fallo('Se genero otro ticket durante la descarga. Recupera el estado del periodo.', 409);
  await repo.guardarPropuesta(p, ticket, nombreArchivo, archivo.buffer, detalle);
  return { listo: true, cantidad_registros: detalle.length, message: 'Propuesta de compras recuperada y lista para comparar.' };
};
const descargar = async (entrada) => {
  const p = validar(entrada);
  const datos = await tickets.obtenerDatosTicketPropuestaSire(p);
  const propuesta = datos?.sire_tpropuesta ? await repo.obtenerArchivo(p, datos.sire_tpropuesta) : null;
  if (!propuesta) throw fallo('Consulta e importa la propuesta antes de descargar su archivo.', 404);
  return propuesta;
};
return { recuperar, generarTicket, consultar, descargar, validar };
};
