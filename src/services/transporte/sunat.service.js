// Reglas del proceso SUNAT / Resumen Diario de transporte.
//
// Arma los payloads, decide el flujo del resumen, consulta el ticket, interpreta
// las respuestas de SUNAT y coordina con el repository. No conoce req ni res.
const fetch = require('node-fetch');

const { toIsoDate, toIsoDateColumna, toNumber } = require('../../utils/formato');
const { leerRespuestaSunat, normalizarErrorSunatTransporte } = require('../../utils/sunat');
const { normalizarTexto } = require('../../utils/texto');
const repository = require('../../repositories/transporte/sunat.repository');

// ------------------------------------------------------------------
// Payload del comprobante dentro del resumen
// ------------------------------------------------------------------

const esCortesiaTributariaTransporte = (venta = {}) => (
  toNumber(venta.precio_neto) === 0 || toNumber(venta.registrado, 1) === 0
);

const construirComprobanteResumenTransporte = (venta) => {
  const total = toNumber(venta.r_monto_total || venta.precio_neto);
  const cortesia = esCortesiaTributariaTransporte(venta);

  return {
    tipo_documento: venta.r_cod_ref || venta.r_cod,
    serie: venta.r_serie_ref || venta.r_serie,
    numero: venta.r_numero_ref || venta.r_numero,
    cliente_numero_documento: venta.cliente_documento_id || '-',
    cliente_tipo_documento: venta.cliente_id_doc || '0',
    status: '1',
    moneda_id: 'PEN',
    total_a_pagar: cortesia ? 0 : total,
    total_gravada: cortesia ? 0 : toNumber(venta.r_gravado),
    total_exonerada: cortesia ? 0 : toNumber(venta.r_exonerado),
    total_inafecta: 0,
    total_gratuita: cortesia ? total : 0,
    total_igv: cortesia ? 0 : toNumber(venta.r_igv),
    tipo_operacion: venta.tipo_operacion,
    cortesia_tributaria: cortesia,
    origen: {
      periodo: venta.periodo,
      r_cod: venta.r_cod,
      r_serie: venta.r_serie,
      r_numero: venta.r_numero,
      elemento: venta.elemento,
      registrado: toNumber(venta.registrado, 1),
    }
  };
};

const normalizarErrorResumenSunatTransporte = (responseData, fallbackMessage = 'Error en la API SUNAT enviando resumen') => {
  const data = responseData?.error || responseData?.data || responseData || {};
  const descripcion = data.respuesta_sunat_descripcion || data.mensaje || data.message || fallbackMessage;
  const nivel = data.nivel || 'ERROR';

  return {
    success: false,
    estado: data.estado === true ? 'ENVIADO' : 'ERROR',
    nivel,
    codigo: data.codigo || 'ERROR_SUNAT',
    titulo_usuario: data.titulo_usuario || (nivel === 'PENDIENTE' ? 'Resumen pendiente' : 'No se pudo enviar a SUNAT'),
    mensaje_usuario: data.mensaje_usuario || descripcion,
    respuesta_codigo: data.codigo || 'ERROR_SUNAT',
    respuesta_desc: descripcion,
    respuesta_sunat_descripcion: descripcion,
    detalle_tecnico: data.detalle_sunat || data.detalleSunat || descripcion,
    permite_reintento: data.permite_reintento ?? data.permiteReintento ?? true,
    ticket: data.ticket || null,
    nombre_archivo: data.nombre_archivo || null,
    ruta_xml: data.ruta_xml || 'error',
    ruta_cdr: data.ruta_cdr || 'error',
    codigo_hash: data.codigo_hash || null
  };
};

const esRechazoResumenSunatTransporte = (respuesta = {}) => {
  const nivel = normalizarTexto(respuesta.nivel).toUpperCase();
  const codigo = normalizarTexto(respuesta.codigo || respuesta.respuesta_codigo).toUpperCase();
  const descripcion = normalizarTexto(
    respuesta.respuesta_desc
    || respuesta.respuesta_sunat_descripcion
    || respuesta.mensaje_usuario
    || respuesta.message
    || respuesta.detalle_tecnico
  ).toLowerCase();

  return nivel === 'RECHAZADO'
    || codigo === 'RECHAZADO'
    || codigo === '2223'
    || descripcion.includes('documento indicado no existe')
    || descripcion.includes('comprobante a eliminar')
    || descripcion.includes('ya fue enviado')
    || descripcion.includes('ya fue presentado');
};

const generaJsonResumenCPEexpertcontTransporte = async ({
  periodo,
  id_usuario,
  documento_id,
  fecha_documentos,
  correlativo = 1,
  id_punto_venta,
  tipo_operacion,
}) => {
  // RESUMEN DIARIO SUNAT - VERSION JSON DEL ANTIGUO SFS/TRD
  // Paso 1: obtener datos del emisor.
  // Equivale a los datos de empresa/certificado que antes rodeaban al archivo
  // SFS: RUC, razon social, direccion, ubigeo y modo de envio.
  const datosQuery = { rows: await repository.obtenerContabilidadAdminResumenQuery([id_usuario, documento_id]) };
  const datos = datosQuery.rows[0];

  if (!datos) {
    throw new Error('CONTABILIDAD NO ENCONTRADA');
  }

  // Paso 2: seleccionar las boletas del dia que formaran el resumen.
  // Equivale a elegir los comprobantes que antes se listaban en el TRD.
  // E = encomienda gravada con IGV.
  // B = boleto de viaje exonerado.
  // Se excluyen comprobantes con RDI para no volver a resumir documentos ya tratados.
  let query = `
    SELECT tv.*,
           CAST(tv.r_fecemi AS VARCHAR(10)) AS fecha_emision
      FROM mve_transventa tv
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.r_fecemi = $4::date
       AND COALESCE(NULLIF(tv.r_cod_ref, ''), tv.r_cod) = '03'
       AND tv.tipo_operacion IN ('B', 'E')
       AND COALESCE(tv.numero_rdi, '') = ''
  `;
  const params = [periodo, id_usuario, documento_id, fecha_documentos];

  if (id_punto_venta) {
    params.push(id_punto_venta);
    query += ` AND tv.id_punto_venta = $${params.length} `;
  }

  if (tipo_operacion && ['B', 'E'].includes(tipo_operacion)) {
    params.push(tipo_operacion);
    query += ` AND tv.tipo_operacion = $${params.length} `;
  }

  query += `
     ORDER BY tv.tipo_operacion, tv.r_serie, tv.r_numero, tv.elemento
  `;

  const ventaQuery = { rows: await repository.obtenerBoletasResumenQuery(query, params) };

  if (ventaQuery.rows.length === 0) {
    throw new Error('No hay boletas de transporte pendientes para resumir en la fecha indicada.');
  }

  const comprobantes = ventaQuery.rows.map(construirComprobanteResumenTransporte);

  // Paso 4: armar el payload final que reemplaza al archivo TRD.
  // El backend API SUNAT lo transformara a XML UBL SummaryDocuments.
  const payload = {
    empresa: {
      ruc: datos.documento_id,
      razon_social: datos.razon_social,
      nombre_comercial: datos.razon_social,
      domicilio_fiscal: datos.direccion,
      ubigeo: datos.ubigeo,
      distrito: datos.distrito,
      provincia: datos.provincia,
      departamento: datos.departamento,
      modo: datos.modo,
    },
    resumen: {
      numero: fecha_documentos.replace(/-/g, ''),
      correlativo: String(correlativo),
      fecha_documentos,
      fecha_resumen: toIsoDate(new Date()),
    },
    comprobantes,
  };

  return {
    payload,
    operaciones: ventaQuery.rows
  };
};

const marcarOperacionesRdiSunatTransporte = async ({
  idUsuario,
  documentoId,
  numeroRdi,
  estado = 'PENDIENTE',
  respuestaDesc = null,
  ticket = null,
  ctrlModUs = null,
}) => {
  const estadoNormalizado = normalizarTexto(estado).toUpperCase() || 'PENDIENTE';
  const descripcionBase = estadoNormalizado === 'ACEPTADO'
    ? `Resumen Diario SUNAT ${numeroRdi} aceptado.`
    : estadoNormalizado === 'RECHAZADO'
      ? `Resumen Diario SUNAT ${numeroRdi} rechazado.`
      : `Procesado por Resumen Diario SUNAT ${numeroRdi}.`;
  const descripcion = [
    descripcionBase,
    ticket ? `Ticket: ${ticket}.` : null,
    respuestaDesc || null,
  ].filter(Boolean).join(' ').substring(0, 100);
  const marcaRdi = `RDI:${numeroRdi}`;
  const estadoSunat = repository.estadoSunatTransportePorNivel(estadoNormalizado);

  const result = { rows: await repository.actualizarOperacionesRdiQuery([
      idUsuario,
      documentoId,
      numeroRdi,
      marcaRdi,
      descripcion,
      ctrlModUs,
      estadoNormalizado,
      estadoSunat,
    ]) };
};

const incrementarIntentoRdiSunatTransporte = async ({ idUsuario, documentoId, numeroRdi }) => {
  try {
  const result = { rows: await repository.incrementarIntentoRdiQuery([idUsuario, documentoId, numeroRdi]) };
  } catch (error) {
    if (error.code !== '42703') throw error;

  const result = { rows: await repository.incrementarIntentoRdiFallbackQuery([idUsuario, documentoId, numeroRdi]) };
  }
};

const generarPayloadResumenSunatTransporteDesdeRdi = async ({
  periodo,
  idUsuario,
  documentoId,
  numeroRdi,
  tipoOperacion,
}) => {
  const datos = await repository.obtenerDatosResumenSunatTransporte(idUsuario, documentoId);
  const rdi = await repository.obtenerRdiSunatTransporte({ idUsuario, documentoId, numeroRdi });

  if (!rdi) {
    throw new Error(`No se encontro el Resumen Diario ${numeroRdi}.`);
  }

  const params = [periodo, idUsuario, documentoId, numeroRdi];
  let query = `
    SELECT tv.*,
           CAST(tv.r_fecemi AS VARCHAR(10)) AS fecha_emision
      FROM public.mve_transventa tv
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.numero_rdi = $4
  `;

  if (tipoOperacion && ['B', 'E'].includes(tipoOperacion)) {
    params.push(tipoOperacion);
    query += ` AND tv.tipo_operacion = $${params.length} `;
  }

  query += ` ORDER BY tv.tipo_operacion, tv.r_serie, tv.r_numero, tv.elemento `;

  const ventaQuery = { rows: await repository.obtenerComprobantesPorRdiQuery(query, params) };

  if (ventaQuery.rows.length === 0) {
    throw new Error(`El Resumen Diario ${numeroRdi} no tiene boletas de transporte asociadas.`);
  }

  const comprobantes = ventaQuery.rows.map(construirComprobanteResumenTransporte);

  const [, fechaNumero = toIsoDateColumna(rdi.fecha).replace(/-/g, ''), correlativo = String(rdi.secuencia || 1)] =
    String(numeroRdi).match(/^RC-(\d{8})-(\d+)$/) || [];

  return {
    rdi,
    total_documentos: comprobantes.length,
    payload: {
      empresa: {
        ruc: datos.documento_id,
        razon_social: datos.razon_social,
        nombre_comercial: datos.razon_social,
        domicilio_fiscal: datos.direccion,
        ubigeo: datos.ubigeo,
        distrito: datos.distrito,
        provincia: datos.provincia,
        departamento: datos.departamento,
        modo: datos.modo,
      },
      resumen: {
        numero: fechaNumero,
        correlativo: String(correlativo),
        fecha_documentos: toIsoDateColumna(rdi.fecha),
        fecha_resumen: toIsoDateColumna(rdi.fecha),
      },
      comprobantes,
    }
  };
};

const consultarTicketRdiSunatTransporte = async ({
  idUsuario,
  documentoId,
  numeroRdi,
  periodo,
  ctrlModUs = null,
}) => {
  const datos = await repository.obtenerDatosResumenSunatTransporte(idUsuario, documentoId);
  const rdi = await repository.obtenerRdiSunatTransporte({ idUsuario, documentoId, numeroRdi });

  if (!rdi) {
    throw new Error(`No se encontro el Resumen Diario ${numeroRdi}.`);
  }

  if (!rdi.ticket) {
    return {
      success: false,
      numero_rdi: numeroRdi,
      estado: normalizarTexto(rdi.estado).toUpperCase() || 'PENDIENTE',
      mensaje_usuario: `Resumen Diario ${numeroRdi} aun no tiene ticket para consultar.`,
      permite_reintento: true,
    };
  }

  const [, fechaNumero = toIsoDateColumna(rdi.fecha).replace(/-/g, ''), correlativo = String(rdi.secuencia || 1)] =
    String(numeroRdi).match(/^RC-(\d{8})-(\d+)$/) || [];
  const nombreArchivo = `${documentoId}-RC-${fechaNumero}-${correlativo}`;
  const payload = {
    empresa: {
      ruc: datos.documento_id,
      razon_social: datos.razon_social,
      modo: datos.modo,
    },
    ticket: rdi.ticket,
    nombre_archivo: nombreArchivo,
    resumen: {
      numero: fechaNumero,
      correlativo: String(correlativo),
      fecha_documentos: toIsoDateColumna(rdi.fecha),
    }
  };

  const apiResponse = await fetch('https://expertcont-api-sunat.up.railway.app/cpesunatresumen/ticket', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 90000,
  });
  const responseData = await leerRespuestaSunat(apiResponse);

  if (!apiResponse.ok) {
    const errorNormalizado = normalizarErrorResumenSunatTransporte(responseData, 'Error consultando ticket de Resumen Diario');
    const estadoRdiError = esRechazoResumenSunatTransporte(errorNormalizado)
      ? 'RECHAZADO'
      : (normalizarTexto(rdi.estado).toUpperCase() || 'ENVIADO');

    await repository.actualizarRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      estado: estadoRdiError,
      respuestaCodigo: errorNormalizado.codigo,
      respuestaDesc: errorNormalizado.respuesta_desc,
    });

    if (estadoRdiError === 'RECHAZADO') {
      await marcarOperacionesRdiSunatTransporte({
        idUsuario,
        documentoId,
        numeroRdi,
        estado: estadoRdiError,
        respuestaDesc: errorNormalizado.respuesta_desc,
        ticket: rdi.ticket,
        ctrlModUs,
      });
    }

    return {
      ...errorNormalizado,
      numero_rdi: numeroRdi,
      estado: estadoRdiError,
      nivel: estadoRdiError,
      ticket: rdi.ticket,
    };
  }

  const dataSunat = responseData?.data || responseData;
  const nivel = dataSunat.nivel || 'PENDIENTE';
  const estadoRdi = nivel === 'ACEPTADO'
    ? 'ACEPTADO'
    : nivel === 'RECHAZADO'
      ? 'RECHAZADO'
      : 'ENVIADO';
  const descripcion = dataSunat.respuesta_sunat_descripcion || dataSunat.mensaje || dataSunat.message || '';

  await repository.actualizarRdiSunatTransporte({
    idUsuario,
    documentoId,
    numeroRdi,
    estado: estadoRdi,
    ticket: dataSunat.ticket || rdi.ticket,
    respuestaCodigo: dataSunat.codigo || null,
    respuestaDesc: descripcion.substring(0, 500),
  });

  await marcarOperacionesRdiSunatTransporte({
    idUsuario,
    documentoId,
    numeroRdi,
    estado: estadoRdi,
    respuestaDesc: descripcion,
    ticket: dataSunat.ticket || rdi.ticket,
    ctrlModUs,
  });

  return {
    success: dataSunat.estado === true || nivel === 'PENDIENTE',
    numero_rdi: numeroRdi,
    estado: estadoRdi,
    nivel,
    codigo: dataSunat.codigo,
    ticket: dataSunat.ticket || rdi.ticket,
    nombre_archivo: dataSunat.nombre_archivo || nombreArchivo,
    ruta_cdr: dataSunat.ruta_cdr,
    respuesta_sunat_descripcion: descripcion,
    mensaje_usuario: nivel === 'PENDIENTE'
      ? `SUNAT aun esta procesando el Resumen Diario ${numeroRdi}.`
      : descripcion,
    periodo,
  };
};

const enviarRdiSunatTransporte = async ({
  periodo,
  idUsuario,
  documentoId,
  numeroRdi,
  tipoOperacion,
  ctrlModUs = null,
}) => {
  const { rdi, payload, total_documentos } = await generarPayloadResumenSunatTransporteDesdeRdi({
    periodo,
    idUsuario,
    documentoId,
    numeroRdi,
    tipoOperacion,
  });

  const estadoActual = normalizarTexto(rdi.estado).toUpperCase();
  if (rdi.ticket) {
    return consultarTicketRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      periodo,
      ctrlModUs,
    });
  }

  if (['ACEPTADO', 'RECHAZADO'].includes(estadoActual)) {
    return {
      success: estadoActual === 'ACEPTADO',
      numero_rdi: numeroRdi,
      estado: estadoActual,
      ticket: rdi.ticket,
      total_documentos,
      mensaje_usuario: `Resumen Diario ${numeroRdi} en estado ${estadoActual}.`,
    };
  }

  const lockKey = `rdi-trans:${idUsuario}:${documentoId}:${numeroRdi}`;
  const { client: lockClient, lockAcquired } = await repository.adquirirCandadoRdi(lockKey);

  try {
    if (!lockAcquired) {
      return {
        success: false,
        numero_rdi: numeroRdi,
        estado: estadoActual || 'PENDIENTE',
        total_documentos,
        mensaje_usuario: `Resumen Diario ${numeroRdi} ya esta siendo procesado. Espera unos segundos y consulta nuevamente.`,
      };
    }

    await incrementarIntentoRdiSunatTransporte({ idUsuario, documentoId, numeroRdi });

    const apiResponse = await fetch('https://expertcont-api-sunat.up.railway.app/cpesunatresumen', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 90000,
    });
    const responseData = await leerRespuestaSunat(apiResponse);
    const dataSunat = responseData?.data || responseData;

    if (!apiResponse.ok) {
      const errorNormalizado = normalizarErrorResumenSunatTransporte(responseData);
      await repository.actualizarRdiSunatTransporte({
        idUsuario,
        documentoId,
        numeroRdi,
        estado: 'ERROR',
        respuestaCodigo: errorNormalizado.codigo,
        respuestaDesc: errorNormalizado.respuesta_desc,
      });

      return {
        ...errorNormalizado,
        numero_rdi: numeroRdi,
        total_documentos,
      };
    }

    const ticket = dataSunat.ticket || null;
    const estadoRdi = ticket ? 'ENVIADO' : 'ERROR';
    const descripcion = dataSunat.respuesta_sunat_descripcion || dataSunat.mensaje || dataSunat.message || '';

    await repository.actualizarRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      estado: estadoRdi,
    ticket,
    respuestaCodigo: dataSunat.codigo || null,
    respuestaDesc: descripcion.substring(0, 500),
    });

    if (ticket) {
      await marcarOperacionesRdiSunatTransporte({
        idUsuario,
        documentoId,
        numeroRdi,
        estado: 'PENDIENTE',
        respuestaDesc: descripcion,
        ticket,
        ctrlModUs,
      });
    }

    return {
      success: Boolean(ticket),
      numero_rdi: numeroRdi,
      estado: estadoRdi,
      nivel: dataSunat.nivel || 'TICKET',
      ticket,
      nombre_archivo: dataSunat.nombre_archivo || `${documentoId}-${numeroRdi}`,
      total_documentos,
      respuesta_sunat_descripcion: descripcion,
      mensaje_usuario: ticket
        ? `Resumen Diario ${numeroRdi} enviado a SUNAT. Ticket: ${ticket}.`
        : `SUNAT no retorno ticket para el Resumen Diario ${numeroRdi}.`,
      ruta_xml: dataSunat.ruta_xml,
      codigo_hash: dataSunat.codigo_hash,
      payload
    };
  } catch (error) {
    const esRecepcionIncierta = ['request-timeout', 'ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED'].includes(error.type || error.code);
    const estado = esRecepcionIncierta ? 'INCIERTO' : 'ERROR';
    const mensaje = esRecepcionIncierta
      ? 'No se pudo confirmar la recepcion del resumen por SUNAT. Verifica antes de reenviar.'
      : (error.message || 'Error interno procesando Resumen Diario SUNAT.');

    await repository.actualizarRdiSunatTransporte({
      idUsuario,
      documentoId,
      numeroRdi,
      estado,
      respuestaCodigo: estado,
      respuestaDesc: mensaje.substring(0, 500),
    });

    return {
      success: false,
      numero_rdi: numeroRdi,
      estado,
      nivel: estado,
      total_documentos,
      mensaje_usuario: mensaje,
      respuesta_sunat_descripcion: mensaje,
      detalle_tecnico: error.message,
      permite_reintento: estado === 'ERROR',
    };
  } finally {
    await repository.liberarCandadoRdi(lockClient, lockKey, lockAcquired);
  }
};

// Regla de rechazo corregible. La evalua el repository con la fila ya
// bloqueada por el FOR UPDATE, para que la decision y la liberacion salgan
// de la misma transaccion.
const esRechazoRdiSunatTransporte = (rdi = {}) => {
  const estadoActual = normalizarTexto(rdi.estado).toUpperCase();
  return estadoActual === 'RECHAZADO'
    || esRechazoResumenSunatTransporte({
      nivel: estadoActual,
      codigo: rdi.respuesta_codigo,
      respuesta_desc: rdi.respuesta_desc,
    });
};

// Cuerpos de respuesta: los status los decide el controller.
const respuestaRdiNoEncontrado = (numeroRdi) => ({
  success: false,
  message: `No se encontro el RDI ${numeroRdi}.`,
  mensaje_usuario: `No se encontro el RDI ${numeroRdi}.`,
});

const respuestaRdiNoCorregible = () => ({
  success: false,
  message: 'El RDI no esta marcado como rechazo corregible.',
  mensaje_usuario: 'Este RDI no esta marcado como rechazo corregible. Primero consulta el ticket SUNAT para confirmar el estado.',
});

const respuestaRdiCorregido = (numeroRdi, liberados) => ({
  success: true,
  numero_rdi: numeroRdi,
  estado: 'RECHAZADO',
  estado_reproceso: 'REPROCESADO',
  liberados,
  mensaje_usuario: `${numeroRdi} quedo como rechazado reprocesado y se liberaron ${liberados} comprobante(s). Vuelve a enviar el RDI del dia para generar un nuevo ticket.`,
});

// Unico punto donde se responde 500 en la correccion del RDI rechazado, para
// que el error de la transaccion y su mensaje sigan siendo los de antes.
const errorRdiRechazado = (error) => {
  console.error('Error corrigiendo RDI rechazado de transporte:', error);
  return {
    status: 500,
    body: {
      success: false,
      message: error.message || 'Error interno corrigiendo RDI rechazado.',
      mensaje_usuario: 'No se pudo preparar la correccion del RDI rechazado.',
    },
  };
};

// Consulta el ticket de un RDI cuando el frontend manda ticket + empresa en vez
// de numero_rdi. Aqui vive la llamada al microservicio API SUNAT y la
// interpretacion de su respuesta; el controller solo devuelve status + body.
const consultarTicketResumenSunatTransporte = async ({
  empresa,
  modo,
  documentoId,
  idUsuario,
  idAnfitrion,
  ticket,
  nombreArchivo,
  fechaDocumentos,
  correlativo,
}) => {
  let empresaFinal = empresa || {
    ruc: documentoId,
    modo
  };

  if (!empresaFinal?.ruc || !ticket) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Debe enviar documento_id o empresa.ruc, y ticket.',
      },
    };
  }

  try {
    // Paso 1: preparar la consulta del ticket recibido por sendSummary.
    // Equivale al antiguo seguimiento SFS del ticket hasta obtener CDR.
    // Si SUNAT devuelve 98, sigue pendiente.
    // Si devuelve content, el backend API extrae el CDR y lo guarda.
    if (!empresa && (idUsuario || idAnfitrion) && documentoId) {
      const datosQuery = { rows: await repository.obtenerContabilidadTicketQuery([idUsuario || idAnfitrion, documentoId]) };
      const datos = datosQuery.rows[0];

      if (datos) {
        empresaFinal = {
          ruc: datos.documento_id,
          razon_social: datos.razon_social,
          modo: datos.modo,
        };
      }
    }

    const payload = {
      empresa: empresaFinal,
      ticket,
      nombre_archivo: nombreArchivo,
      resumen: fechaDocumentos ? {
        numero: fechaDocumentos.replace(/-/g, ''),
        correlativo: String(correlativo || 1),
        fecha_documentos: fechaDocumentos,
      } : undefined
    };

    // Paso 2: consultar el ticket en el microservicio API SUNAT.
    // Ese backend ejecuta SOAP getStatus y devuelve PENDIENTE/ACEPTADO/RECHAZADO.
    const apiResponse = await fetch('https://expertcont-api-sunat.up.railway.app/cpesunatresumen/ticket', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await leerRespuestaSunat(apiResponse);

    if (!apiResponse.ok) {
      const errorNormalizado = normalizarErrorSunatTransporte(responseData, 'Error consultando ticket de resumen');
      return { status: apiResponse.status, body: errorNormalizado };
    }

    const dataSunat = responseData?.data || responseData;

    return {
      status: 200,
      body: {
        success: dataSunat.estado === true || dataSunat.nivel === 'PENDIENTE',
        estado: dataSunat.estado,
        nivel: dataSunat.nivel,
        codigo: dataSunat.codigo,
        ticket: dataSunat.ticket || ticket,
        nombre_archivo: dataSunat.nombre_archivo || nombreArchivo,
        ruta_cdr: dataSunat.ruta_cdr,
        respuesta_sunat_descripcion: dataSunat.respuesta_sunat_descripcion,
        mensaje: dataSunat.mensaje
      },
    };
  } catch (error) {
    console.error('Error consultando resumen SUNAT de transporte:', error);
    return {
      status: 500,
      body: normalizarErrorSunatTransporte(
        { message: error.message },
        'Error interno consultando resumen SUNAT de transporte'
      ),
    };
  }
};

// Correccion del RDI rechazado: pide la transaccion al repository y traduce
// su resultado al status y cuerpo que espera el frontend.
const corregirRdiRechazadoTransporte = async ({ idUsuario, documentoId, numeroRdi, ctrlModUs }) => {
  try {
    const { resultado, liberados } = await repository.corregirRdiRechazadoTransaccion({
      idUsuario,
      documentoId,
      numeroRdi,
      ctrlModUs,
      esRechazo: (rdi) => esRechazoRdiSunatTransporte(rdi),
    });

    if (resultado === 'NO_ENCONTRADO') {
      return { status: 404, body: respuestaRdiNoEncontrado(numeroRdi) };
    }

    if (resultado === 'NO_CORREGIBLE') {
      return { status: 409, body: respuestaRdiNoCorregible() };
    }

    return { status: 200, body: respuestaRdiCorregido(numeroRdi, liberados) };
  } catch (error) {
    return errorRdiRechazado(error);
  }
};

// Primer RDI pendiente del dia, si ya hubo un intento anterior.
const obtenerRdiPendienteTransporte = ({ idUsuario, documentoId, fechaResumen, origenResumen }) => (
  repository.obtenerPrimerRdiPendienteSunatTransporte({
    idUsuario,
    documentoId,
    fechaResumen,
    origenResumen,
  })
);

// Crea el RDI del dia con la funcion de PostgreSQL y lo envia. Si la funcion
// no devuelve numero, reutiliza un RDI pendiente de la misma fecha.
const crearYEnviarResumenSunatTransporte = async ({
  periodo,
  idUsuario,
  documentoId,
  fechaDocumentos,
  origenResumen,
  tipoOperacion,
  idPuntoVenta,
  ctrlModUs,
}) => {
  const result = { rows: await repository.crearResumenDiarioQuery([
    idUsuario,
    documentoId,
    fechaDocumentos,
    origenResumen,
    idPuntoVenta || null
  ]) };

  if (result.rows.length === 0) {
    return {
      status: 500,
      body: {
        success: false,
        message: 'La funcion fve_crear_resumen_diario no retorno resultado',
        mensaje_usuario: 'No se pudo obtener respuesta al generar el Resumen Diario SUNAT.'
      },
    };
  }

  const resumen = result.rows[0];
  let numeroRdi = resumen.numero_rdi;

  if (!numeroRdi) {
    const existente = await repository.obtenerPrimerRdiPendienteSunatTransporte({
      idUsuario,
      documentoId,
      fechaResumen: fechaDocumentos,
      origenResumen,
    });

    if (!existente) {
      return {
        status: 200,
        body: {
          success: false,
          creado: false,
          cantidad: 0,
          origen: origenResumen,
          fecha: fechaDocumentos,
          message: resumen.mensaje || `No hay boletas de transporte pendientes para ${fechaDocumentos}.`,
          mensaje_usuario: resumen.mensaje || `No hay boletas de transporte pendientes para ${fechaDocumentos}.`,
        },
      };
    }

    numeroRdi = existente.numero_rdi;
  }

  const envio = await enviarRdiSunatTransporte({
    periodo,
    idUsuario,
    documentoId,
    numeroRdi,
    tipoOperacion,
    ctrlModUs,
  });

  return {
    status: 200,
    body: {
      ...envio,
      creado: resumen.creado === true,
      cantidad: Number(resumen.cantidad || envio.total_documentos || 0),
      origen: origenResumen,
      fecha: fechaDocumentos,
      message: envio.mensaje_usuario || resumen.mensaje,
      data: {
        ...resumen,
        ...envio,
        origen: origenResumen,
        fecha: fechaDocumentos,
      }
    },
  };
};

// Listado de RDI del periodo + conteo de boletas todavia sin resumir.
const obtenerResumenesRdiTransporte = async ({
  idAnfitrion,
  documentoId,
  periodo,
  origenResumen,
  tipoOperacionResumen,
}) => {
  const result = { rows: await repository.obtenerResumenesRdiQuery([idAnfitrion, documentoId, periodo, origenResumen, tipoOperacionResumen]) };

  const pendientesResult = { rows: await repository.obtenerPendientesResumenQuery([idAnfitrion, documentoId, periodo, tipoOperacionResumen]) };

  return { data: result.rows, pendientes: pendientesResult.rows };
};

module.exports = {
  consultarTicketResumenSunatTransporte,
  corregirRdiRechazadoTransporte,
  obtenerResumenesRdiTransporte,
  crearYEnviarResumenSunatTransporte,
  obtenerRdiPendienteTransporte,
  esRechazoRdiSunatTransporte,
  respuestaRdiNoEncontrado,
  respuestaRdiNoCorregible,
  respuestaRdiCorregido,
  errorRdiRechazado,
  esCortesiaTributariaTransporte,
  construirComprobanteResumenTransporte,
  normalizarErrorResumenSunatTransporte,
  esRechazoResumenSunatTransporte,
  generaJsonResumenCPEexpertcontTransporte,
  marcarOperacionesRdiSunatTransporte,
  incrementarIntentoRdiSunatTransporte,
  generarPayloadResumenSunatTransporteDesdeRdi,
  consultarTicketRdiSunatTransporte,
  enviarRdiSunatTransporte,
};
