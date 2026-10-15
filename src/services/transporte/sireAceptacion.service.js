const repository = require('../../repositories/sire/sireAceptacion.repository');
const propuestas = require('../../repositories/transporte/sire.repository');
const sire = require('../sire/sireSunatClient.service');

const errorHttp = (message, statusCode, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });

const validarContexto = (entrada = {}) => {
  const idAnfitrion = String(entrada.idAnfitrion || '').trim();
  const documentoId = String(entrada.documentoId || '').trim();
  const periodoEntrada = String(entrada.periodo || '').trim();
  const match = periodoEntrada.match(/^(\d{4})-?(0[1-9]|1[0-2])$/);
  if (!idAnfitrion || idAnfitrion.length > 60 || !/^\d{11}$/.test(documentoId) || !match) {
    throw errorHttp('Indica id_anfitrion, un RUC de 11 digitos y periodo YYYY-MM o YYYYMM valido.', 400);
  }
  const idLibro = sire.normalizarIdLibroSire(String(entrada.idLibro || '014'));
  if (idLibro !== '140000') throw errorHttp('La aceptacion implementada corresponde al RVIE (014/140000).', 400);
  const periodo = `${match[1]}-${match[2]}`;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const actual = ['year', 'month'].map((tipo) => partes.find((p) => p.type === tipo).value).join('-');
  if (periodo > actual) throw errorHttp('No se puede aceptar una propuesta de un periodo futuro.', 400);
  return { ...entrada, idAnfitrion, documentoId, periodo, idLibro };
};

const resultado = (registro, reutilizado = false) => ({
  success: true,
  accion: 'ACEPTAR',
  origen: 'TRANSPORTE',
  id_aceptacion: registro.id_aceptacion,
  id_propuesta: registro.id_propuesta,
  documento_id: registro.documento_id,
  periodo: registro.periodo,
  id_libro: registro.id_libro,
  ticket_propuesta: registro.ticket_propuesta,
  ticket_aceptacion: registro.ticket_aceptacion,
  estado: registro.estado,
  codigo_estado_sunat: registro.codigo_estado_sunat,
  cantidad_registros: registro.cantidad_registros,
  fecha_solicitud: registro.fecha_solicitud,
  fecha_actualizacion: registro.fecha_actualizacion,
  reutilizado,
  completado: registro.estado === 'TERMINADO',
  requiere_revision: ['INCIERTO', 'ENVIANDO'].includes(registro.estado),
  mensaje: registro.descripcion || (registro.estado === 'TERMINADO'
    ? 'SUNAT termino el proceso de aceptacion de la propuesta RVIE.'
    : 'Aceptacion solicitada. Consulta el ticket para conocer el resultado de SUNAT.'),
});

const aceptarPropuesta = async (entrada) => {
  const p = validarContexto(entrada);
  if (p.confirmar !== true) throw errorHttp('Confirma explicitamente la aceptacion con confirmar: true.', 400);
  if (!/^\d+$/.test(String(p.idPropuesta || '')) || !String(p.ticketPropuesta || '').trim()) {
    throw errorHttp('Indica id_propuesta y ticket_propuesta de la propuesta revisada.', 400);
  }
  const candado = await repository.adquirirCandado(p);
  if (!candado) throw errorHttp('La presentacion de este periodo ya se esta procesando.', 409);
  try {
    const reemplazo = await repository.obtenerReemplazoActivo(p, candado.client);
    if (reemplazo) throw errorHttp('Existe un reemplazo enviado o pendiente de verificar para este periodo. No se puede aceptar.', 409);
    const anterior = await repository.obtenerAceptacion(p, candado.client);
    if (anterior && ['ENVIADO', 'TERMINADO'].includes(anterior.estado)) return resultado(anterior, true);
    if (anterior && ['ENVIANDO', 'INCIERTO'].includes(anterior.estado)) {
      throw errorHttp('Existe un intento cuyo resultado debe verificarse antes de volver a enviar.', 409,
        { ticketAceptacion: anterior.ticket_aceptacion, estado: anterior.estado });
    }
    const propuesta = await propuestas.obtenerPropuestaGuardadaSireTransporteQuery({
      ...p, ticket: '',
    }, candado.client);
    if (!propuesta || !['PARSEADO', 'COMPARADO'].includes(propuesta.estado)) {
      throw errorHttp('Primero importa y revisa la propuesta SUNAT del periodo.', 409);
    }
    if (String(propuesta.id_propuesta) !== String(p.idPropuesta)
      || propuesta.ticket !== String(p.ticketPropuesta).trim()) {
      throw errorHttp('La propuesta revisada no coincide con la ultima propuesta guardada. Recarga antes de aceptar.', 409);
    }
    await repository.registrarIntento(p, propuesta, candado.client);
    let envio;
    try {
      envio = await sire.aceptarPropuestaRvieSire({ ...p, db: candado.client });
      const guardado = await repository.actualizarAceptacion(p, {
        estado: 'ENVIADO', ticket: envio.ticket,
        descripcion: 'Aceptacion solicitada a SUNAT. Pendiente de consultar resultado.',
        respuesta: envio.respuesta_sunat,
      }, candado.client);
      return resultado(guardado);
    } catch (error) {
      const incierto = Boolean(envio || error.resultadoIncierto);
      try {
        await repository.actualizarAceptacion(p, {
          estado: incierto ? 'INCIERTO' : 'RECHAZADO',
          ticket: envio?.ticket || null,
          descripcion: incierto
            ? 'No se pudo confirmar el resultado del envio. Verifica el ticket o revisa SUNAT antes de repetir.'
            : error.message,
          respuesta: envio?.respuesta_sunat || error.respuestaSunat || null,
        }, candado.client);
      } catch (errorGuardado) {
        // El intento ENVIANDO ya quedo persistido antes de invocar SUNAT.
        console.error('No se pudo guardar el resultado de aceptacion SIRe:', errorGuardado.message);
      }
      if (incierto) throw errorHttp(
        'Resultado de aceptacion incierto. No vuelvas a enviar hasta verificarlo.',
        503, { estado: 'INCIERTO', ticketAceptacion: envio?.ticket || null }
      );
      throw error;
    }
  } finally {
    await repository.liberarCandado(candado);
  }
};

const obtenerAceptacion = async (entrada) => {
  const p = validarContexto(entrada);
  const registro = await repository.obtenerAceptacion(p);
  return registro ? resultado(registro, true) : { success: true, estado: 'SIN_ENVIO', ticket_aceptacion: null };
};

const consultarEstado = async (entrada) => {
  const p = validarContexto(entrada);
  const candado = await repository.adquirirCandado(p);
  if (!candado) throw errorHttp('La presentacion de este periodo ya se esta procesando.', 409);
  try {
    const registro = await repository.obtenerAceptacion(p, candado.client);
    if (!registro) throw errorHttp('No hay una aceptacion enviada para este periodo.', 404);
    if (!registro.ticket_aceptacion) {
      throw errorHttp('El intento no tiene un ticket de aceptacion confirmado. Revisa SUNAT antes de volver a enviar.', 409,
        { estado: registro.estado });
    }
    if (['TERMINADO', 'RECHAZADO'].includes(registro.estado)) return resultado(registro, true);
    const consulta = await sire.consultarEstadoTicketSire({
      ...p, ticket: registro.ticket_aceptacion, db: candado.client,
    });
    const registroSunat = (Array.isArray(consulta.registros) ? consulta.registros : []).find((r) =>
      String(r.numTicket) === String(registro.ticket_aceptacion)
      && String(r.perTributario) === p.periodo.replace('-', '')
      && [2, 39].includes(Number(r.codProceso))
    );
    if (!registroSunat) return { ...resultado(registro, true), encontrado: false,
      mensaje: 'SUNAT aun no devuelve el ticket de aceptacion solicitado para este periodo.' };
    const principal = String(registroSunat.codEstadoProceso || '');
    const detalle = String(registroSunat.detalleTicket?.codEstadoEnvio || '');
    const codigo = [principal, detalle].includes('03') ? '03' : principal || detalle;
    const estado = codigo === '06' ? 'TERMINADO' : codigo === '03' ? 'RECHAZADO' : 'ENVIADO';
    const guardado = await repository.actualizarAceptacion(p, {
      estado, ticket: registro.ticket_aceptacion, codigo,
      descripcion: registroSunat.desEstadoProceso || registroSunat.detalleTicket?.desEstadoEnvio || 'En proceso SUNAT.',
      respuesta: consulta.respuesta_sunat,
    }, candado.client);
    return { ...resultado(guardado, true), encontrado: true };
  } finally {
    await repository.liberarCandado(candado);
  }
};

module.exports = { aceptarPropuesta, obtenerAceptacion, consultarEstado };
