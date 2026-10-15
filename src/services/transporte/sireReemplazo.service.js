const { randomUUID } = require('node:crypto');
const repository = require('../../repositories/sire/sireReemplazo.repository');
const { prepararArchivo } = require('../sire/sireReemplazoArchivo.service');
const { enviarArchivo } = require('../sire/sireReemplazoSunat.service');
const { generarArchivo } = require('./sireReemplazoGenerador.service');
const { sincronizarReemplazo } = require('./sireReemplazoActualizacion.service');
const sire = require('../sire/sireSunatClient.service');
const errorHttp = (message, statusCode, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });
const activos = ['ENVIANDO', 'ENVIADO', 'INCIERTO', 'TERMINADO'];
const validar = (entrada = {}) => {
  const idAnfitrion = String(entrada.idAnfitrion || '').trim();
  const documentoId = String(entrada.documentoId || '').trim();
  const match = String(entrada.periodo || '').match(/^(\d{4})-?(0[1-9]|1[0-2])$/);
  const idLibro = sire.normalizarIdLibroSire(String(entrada.idLibro || '014'));
  if (!idAnfitrion || idAnfitrion.length > 60 || !/^\d{11}$/.test(documentoId) || !match || idLibro !== '140000') {
    throw errorHttp('Indica usuario, RUC de 11 digitos, periodo YYYY-MM o YYYYMM y libro RVIE (014).', 400);
  }
  const periodo = `${match[1]}-${match[2]}`;
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const actual = ['year', 'month'].map((tipo) => partes.find((p) => p.type === tipo).value).join('-');
  if (periodo > actual) throw errorHttp('No se puede reemplazar un periodo futuro.', 400);
  return { ...entrada, idAnfitrion, documentoId, periodo, idLibro };
};
const resultado = (registro, reutilizado = false) => ({
  success: true, accion: 'REEMPLAZAR', origen: 'TRANSPORTE',
  id_reemplazo: registro.id_reemplazo, documento_id: registro.documento_id,
  periodo: registro.periodo, id_libro: registro.id_libro, nombre_archivo: registro.nombre_archivo,
  hash_archivo: registro.hash_archivo, cantidad_registros: registro.cantidad_registros,
  resumen: registro.resumen, fuente: registro.fuente, ticket_actualizacion: registro.ticket_actualizacion,
  estado_actualizacion: registro.estado_actualizacion, id_propuesta_actualizada: registro.id_propuesta_actualizada,
  error_actualizacion: registro.error_actualizacion,
  estado: registro.estado, ticket_reemplazo: registro.ticket_reemplazo || null,
  codigo_estado_sunat: registro.codigo_estado_sunat || null,
  fecha_preparacion: registro.fecha_preparacion, fecha_solicitud: registro.fecha_solicitud,
  fecha_actualizacion: registro.fecha_actualizacion,
  completado: registro.estado === 'TERMINADO', reutilizado,
  requiere_revision: ['ENVIANDO', 'INCIERTO'].includes(registro.estado),
  mensaje: registro.descripcion || (registro.estado === 'PREPARADO'
    ? 'Archivo preparado. Revisa su contenido antes de confirmar el reemplazo completo del RUC y periodo.'
    : 'Consulta el ticket de reemplazo para conocer el resultado de SUNAT.'),
});
const verificarAceptacion = async (p, db) => {
  const aceptacion = await repository.obtenerAceptacion(p, db);
  if (aceptacion && activos.includes(aceptacion.estado)) {
    throw errorHttp('Existe una aceptacion enviada o pendiente de verificar para este periodo. No se puede reemplazar.', 409);
  }
};
const conCandado = async (p, accion) => {
  const candado = await repository.adquirirCandado(p);
  if (!candado) throw errorHttp('La presentacion de este periodo ya se esta procesando.', 409);
  try { return await accion(candado.client); }
  finally { await repository.liberarCandado(candado); }
};
const prepararReemplazo = async (entrada) => {
  const p = validar(entrada);

  return conCandado(p, async (db) => {
    await verificarAceptacion(p, db);
    const anterior = await repository.obtenerUltimo(p, db);
    if (anterior && activos.includes(anterior.estado)) {
      throw errorHttp('Existe un reemplazo enviado o pendiente de verificar. Consulta su resultado antes de preparar otro.', 409,
        { estado: anterior.estado, ticketReemplazo: anterior.ticket_reemplazo });
    }
    const archivo = p.buffer !== undefined ? prepararArchivo(p)
      : generarArchivo({ ...p, ...await repository.obtenerVentas(p, db) });
    p.fuente = p.buffer !== undefined ? 'ARCHIVO' : 'TRANSPORTE';
    return resultado(await repository.preparar(p, archivo, randomUUID(), db));
  });
};
const comprobarArchivo = (p, registro) => {
  if (!registro || registro.id_reemplazo !== p.idReemplazo || registro.hash_archivo !== p.hashArchivo) {
    throw errorHttp('El archivo revisado no coincide con el ultimo reemplazo preparado. Recupera y revisa la preparacion actual.', 409);
  }
};
const enviarReemplazo = async (entrada) => {
  const p = validar(entrada);
  if (p.confirmar !== true || !/^[0-9a-f-]{36}$/i.test(p.idReemplazo || '') || !/^[0-9a-f]{64}$/.test(p.hashArchivo || '')) {
    throw errorHttp('Indica id_reemplazo, hash_archivo y confirmar: true para enviar el archivo revisado.', 400);
  }
  return conCandado(p, async (db) => {
    await verificarAceptacion(p, db);
    const registro = await repository.obtenerUltimo(p, db, true);
    comprobarArchivo(p, registro);
    if (['ENVIADO', 'TERMINADO'].includes(registro.estado)) return resultado(registro, true);
    if (registro.estado !== 'PREPARADO') {
      throw errorHttp('Este intento no puede reenviarse. Verifica SUNAT si el resultado es incierto; tras un rechazo prepara otro archivo.', 409,
        { estado: registro.estado, ticketReemplazo: registro.ticket_reemplazo });
    }
    if (registro.fuente === 'TRANSPORTE') {
      if (p.confirmarAlcance !== true) throw errorHttp('Confirma que el archivo contiene todas las ventas del RUC y periodo.', 400);
      const vigente = generarArchivo({ ...p, ...await repository.obtenerVentas(p, db) });
      if (vigente.hash !== registro.hash_archivo) throw errorHttp('Los comprobantes cambiaron despues de preparar el archivo. Genera y revisa uno nuevo.', 409);
    }
    await repository.actualizar(p, registro, { estado: 'ENVIANDO' }, db);
    let envio;
    try {
      envio = await enviarArchivo({ ...p, db, buffer: registro.archivo_zip, nombreArchivo: registro.nombre_archivo,
        guardarCarga: (urlCarga) => repository.actualizar(p, registro, { estado: 'ENVIANDO', urlCarga }, db),
      });
      return resultado(await repository.actualizar(p, registro, {
        estado: 'ENVIADO', ticket: envio.ticket, respuesta: envio.respuesta_sunat,
        descripcion: 'Reemplazo recibido por SUNAT. Pendiente de consultar el resultado.',
      }, db));
    } catch (error) {
      const incierto = Boolean(envio || error.resultadoIncierto);
      const ticket = envio?.ticket || error.ticketReemplazo || null;
      try {
        await repository.actualizar(p, registro, {
          estado: incierto ? 'INCIERTO' : 'RECHAZADO', ticket,
          descripcion: incierto ? 'Resultado incierto. Verifica la carga en SUNAT antes de repetir.' : error.message,
          respuesta: envio?.respuesta_sunat || error.respuestaSunat || null,
          urlCarga: error.urlCarga,
        }, db);
      } catch (falloGuardado) {
        console.error('No se pudo guardar resultado del reemplazo SIRe:', falloGuardado.message);
      }
      if (incierto) throw errorHttp('Resultado de reemplazo incierto. No vuelvas a enviar hasta verificarlo.', 503,
        { estado: 'INCIERTO', ticketReemplazo: ticket });
      throw error;
    }
  });
};
const obtenerReemplazo = async (entrada) => {
  const p = validar(entrada);
  const registro = await repository.obtenerUltimo(p);
  return registro ? resultado(registro, true) : { success: true, estado: 'SIN_ENVIO', ticket_reemplazo: null };
};
const descargarArchivo = async (entrada) => {
  const p = validar(entrada);
  const registro = await repository.obtenerUltimo(p, undefined, true);
  comprobarArchivo(p, registro);
  return { buffer: registro.archivo_zip, nombreArchivo: registro.nombre_archivo };
};
const consultarEstado = async (entrada) => {
  const p = validar(entrada);
  return conCandado(p, async (db) => {
    const registro = await repository.obtenerUltimo(p, db);
    if (!registro) throw errorHttp('No hay un reemplazo preparado para este periodo.', 404);
    if (!registro.ticket_reemplazo) throw errorHttp('No hay un ticket de reemplazo confirmado. Verifica el intento en SUNAT antes de repetir.', 409,
      { estado: registro.estado });
    if (registro.estado === 'TERMINADO') return resultado(await sincronizarReemplazo(p, registro, db), true);
    if (registro.estado === 'RECHAZADO') return resultado(registro, true);
    const consulta = await sire.consultarEstadoTicketSire({ ...p, ticket: registro.ticket_reemplazo, db });
    const encontrado = (Array.isArray(consulta.registros) ? consulta.registros : []).find((r) =>
      String(r.numTicket) === registro.ticket_reemplazo && String(r.perTributario) === p.periodo.replace('-', '')
      && Number(r.codProceso) === 3);
    if (!encontrado) return { ...resultado(registro, true), encontrado: false };
    const principal = String(encontrado.codEstadoProceso || '');
    const detalle = String(encontrado.detalleTicket?.codEstadoEnvio || '');
    const codigo = [principal, detalle].includes('03') ? '03' : principal || detalle;
    const estado = codigo === '03' ? 'RECHAZADO' : ['04', '06'].includes(codigo) ? 'TERMINADO' : 'ENVIADO';
    const guardado = await repository.actualizar(p, registro, {
      estado, ticket: registro.ticket_reemplazo, codigo, respuesta: consulta.respuesta_sunat,
      descripcion: encontrado.desEstadoProceso || encontrado.detalleTicket?.desEstadoEnvio || 'En proceso SUNAT.',
    }, db);
    return { ...resultado(await sincronizarReemplazo(p, guardado, db), true), encontrado: true };
  });
};
const conciliarReemplazo = async (entrada) => {
  const p = validar(entrada);
  if (p.confirmar !== true || !/^[A-Za-z0-9]{1,50}$/.test(p.ticketReemplazo || '')) {
    throw errorHttp('Indica el ticket observado en SUNAT y confirmar: true para verificarlo.', 400);
  }
  return conCandado(p, async (db) => {
    const registro = await repository.obtenerUltimo(p, db);
    comprobarArchivo(p, registro);
    if (!['INCIERTO', 'ENVIANDO'].includes(registro.estado)) throw errorHttp('Solo se concilian intentos pendientes de verificar.', 409);
    if (registro.ticket_reemplazo && registro.ticket_reemplazo !== p.ticketReemplazo) throw errorHttp('El intento ya tiene otro ticket confirmado.', 409);
    const consulta = await sire.consultarEstadoTicketSire({ ...p, db, ticket: p.ticketReemplazo });
    const encontrado = (consulta.registros || []).find((r) => String(r.numTicket) === p.ticketReemplazo
      && String(r.perTributario) === p.periodo.replace('-', '') && Number(r.codProceso) === 3
      && r.nomArchivoImportacion === registro.nombre_archivo);
    // La fecha de carga del ticket debe corresponder a este intento y no a una carga anterior del mismo nombre.
    const fechaTexto = String(encontrado?.fecCargaImportacion || '');
    const fechaIso = fechaTexto.replace(/^(\d{2})\/(\d{2})\/(\d{4})[T ,]+/, '$3-$2-$1T');
    const fecha = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(fechaIso) ? fechaIso : fechaIso + '-05:00');
    const solicitud = new Date(registro.fecha_solicitud);
    if (!encontrado || !Number.isFinite(fecha.getTime()) || !Number.isFinite(solicitud.getTime())
      || fecha.getTime() < solicitud.getTime() - 60000 || fecha.getTime() > Date.now() + 60000) {
      throw errorHttp('SUNAT no confirma que ese ticket corresponde al archivo y al momento de este intento. Se mantiene el bloqueo.', 409);
    }
    const principal = String(encontrado.codEstadoProceso || '');
    const detalle = String(encontrado.detalleTicket?.codEstadoEnvio || '');
    const codigo = [principal, detalle].includes('03') ? '03' : principal || detalle;
    const estado = codigo === '03' ? 'RECHAZADO' : ['04', '06'].includes(codigo) ? 'TERMINADO' : 'ENVIADO';
    const guardado = await repository.actualizar(p, registro, { estado, ticket: p.ticketReemplazo,
      codigo, descripcion: encontrado.desEstadoProceso || 'Ticket verificado en SUNAT.', respuesta: consulta.respuesta_sunat }, db);
    await repository.registrarConciliacion(p, registro, db);
    return resultado(await sincronizarReemplazo(p, guardado, db), true);
  });
};
module.exports = { conciliarReemplazo, prepararReemplazo, enviarReemplazo, obtenerReemplazo, descargarArchivo, consultarEstado };