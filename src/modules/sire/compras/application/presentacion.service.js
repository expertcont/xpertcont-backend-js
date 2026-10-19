const {fallo} = require('../domain/personalizada');
const {generarArchivo,sinCambios,hash} = require('../domain/presentacion');
const {original} = require('../infrastructure/comprobantes.repository');
const terminal = ['TERMINADO','RECHAZADO'];
const uuid = v => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(v || ''));
const publico = (r,tipo) => r ? {
  tipo,id:r['id_'+tipo],estado:r.estado,ticket:r['ticket_'+tipo],ticket_propuesta:r.ticket_propuesta,
  descripcion:r.descripcion,codigo_estado_sunat:r.codigo_estado_sunat,cantidad_registros:r.cantidad_registros,
  fecha_actualizacion:r.fecha_actualizacion,nombre_archivo:r.nombre_archivo,
  resumen:r.resumen,preliminar:r.respuesta_sunat?.preliminar || null,
} : null;
module.exports = ({repo,comprobantes,sunat,validar}) => {
  const contexto = entrada => ({...validar(entrada),usuarioAjuste:entrada.usuario_ajuste || null});
  const confirmar = entrada => {if(entrada.confirmar!==true)throw fallo('Confirma la operacion revisada con confirmar: true.',400);};
  const periodoPermitido = p => {
    const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit'}).formatToParts(new Date());
    const actual=['year','month'].map(k=>partes.find(r=>r.type===k).value).join('-');
    if(p.periodo>actual)throw fallo('No se puede enviar un periodo futuro a SUNAT.',400);
  };
  const libre = async(db,p) => {if((await repo.activos(db,p)).length)throw fallo('Existe una aceptacion o reemplazo enviado, terminado o incierto. Consulta su resultado antes de otra presentacion.',409);};
  const foto = async(db,p,entrada) => {
    const h=await repo.propuesta(db,p);
    const filas=(await comprobantes.filasEmpresa(db,p)).filter(r=>r.periodo_origen===p.periodo || r.periodo_declaracion===p.periodo || (r.estado_contador==='PENDIENTE' && r.periodo_declaracion<=p.periodo));
    const registros=filas.map(comprobantes.publico);
    const incluidos=registros.filter(r=>r.estado==='DECLARAR' && r.periodo_destino===p.periodo);
    const originales=h?original(h):[];
    const razon=String(entrada.razon_social || (originales[0]?.raw_linea || '').split('|')[1] || '').trim();
    const moneda=entrada.moneda_contable || 'PEN';
    const huella=hash(JSON.stringify({ticket:h?.ticket || null,archivo:h?.huella_archivo || null,razon,moneda,
      filas:registros.map(r=>[r.id_compra,r.version])}));
    return {h,registros,incluidos,razon,moneda,huella,puede_aceptar:Boolean(h && sinCambios(originales,registros,p.periodo))};
  };
  const recuperarPresentacion = async entrada => {
    const p=contexto(entrada);
    return repo.bloquear(p,async db=>({aceptacion:publico(await repo.obtener(db,p,'aceptacion'),'aceptacion'),
      reemplazo:publico(await repo.obtener(db,p,'reemplazo'),'reemplazo')}));
  };
  const revisarPresentacion = async entrada => {
    const p=contexto(entrada);
    return repo.bloquear(p,async db=>{
      const f=await foto(db,p,entrada);
      return {huella_revision:f.huella,ticket_propuesta:f.h?.ticket || null,puede_aceptar:f.puede_aceptar,
        razon_social:f.razon,moneda_contable:f.moneda,cantidad_registros:f.incluidos.length,
        message:f.puede_aceptar?'La lista coincide con la propuesta SUNAT completa. Puedes aceptarla.':'Hay ajustes o compras manuales. Prepara un reemplazo con las compras por declarar.'};
    });
  };
  const prepararReemplazo = async entrada => {
    const p=contexto(entrada);
    return repo.bloquear(p,async db=>{
      await libre(db,p);
      const f=await foto(db,p,entrada), a=generarArchivo(p,f.incluidos,f.razon,f.moneda);
      const resumen={huella_revision:f.huella,razon_social:f.razon,moneda_contable:f.moneda,totales:a.totales,
        excluidos:f.registros.filter(r=>r.estado==='EXCLUIDO').length,
        pendientes:f.registros.filter(r=>['PENDIENTE','OBSERVADO'].includes(r.estado)).length};
      const r=await repo.preparar(db,p,a,resumen,f.h?.ticket || null);
      return {reemplazo:publico(r,'reemplazo'),message:'ZIP RCE preparado. Descargalo y revisalo antes de enviarlo a SUNAT.'};
    });
  };
  const descargarReemplazo = async entrada => {
    const p=contexto(entrada);
    if(!uuid(entrada.id_reemplazo))throw fallo('Indica un reemplazo valido.',400);
    return repo.bloquear(p,async db=>{
      const r=await repo.obtener(db,p,'reemplazo',entrada.id_reemplazo);
      if(!r)throw fallo('No se encontro el reemplazo en esta empresa y periodo.',404);
      return {nombre_archivo:r.nombre_archivo,archivo:r.archivo_zip};
    });
  };
  const enviar = async(entrada,tipo) => {
    const p=contexto(entrada);confirmar(entrada);periodoPermitido(p);
    return repo.bloquear(p,async db=>{
      let r;
      if(tipo==='reemplazo'){
        if(!uuid(entrada.id_reemplazo))throw fallo('Prepara y revisa el reemplazo antes de enviarlo.',400);
        r=await repo.obtener(db,p,tipo,entrada.id_reemplazo);
        if(!r)throw fallo('No se encontro el reemplazo.',404);
        if(r.estado!=='PREPARADO')throw fallo('Este reemplazo ya se intento enviar. Consulta su estado; prepara otro solo si SUNAT lo rechazo.',409);
      }
      await libre(db,p);
      const f=await foto(db,p,tipo==='reemplazo'?r.resumen:entrada);
      if(tipo==='aceptacion'){
        if(!f.puede_aceptar)throw fallo('La lista tiene ajustes o no hay una propuesta descargada. Usa reemplazo para enviar tus cambios.',409);
        if(entrada.huella_revision!==f.huella || entrada.ticket_propuesta!==f.h.ticket)throw fallo('La propuesta cambio. Vuelve a revisar antes de aceptar.',409);
        r=await repo.intentarAceptacion(db,p,f.h);
      }else{
        if(f.huella!==r.resumen.huella_revision)throw fallo('Las compras o el ticket cambiaron desde la preparacion. Genera y revisa otro archivo.',409);
        r=await repo.actualizar(db,p,tipo,r.id_reemplazo,{estado:'ENVIANDO',fecha_solicitud:new Date().toISOString()});
      }
      const id=r['id_'+tipo];let envio;
      try {
        envio=tipo==='aceptacion'?await sunat.aceptar({...p,db}):await sunat.reemplazar({...p,db,
          buffer:r.archivo_zip,nombreArchivo:r.nombre_archivo,
          guardarCarga:async url=>repo.actualizar(db,p,tipo,id,{url_carga:url})});
        r=await repo.actualizar(db,p,tipo,id,{estado:'ENVIADO',['ticket_'+tipo]:envio.ticket,
          descripcion:'Solicitud recibida. Consulta el ticket para verificar el resultado de SUNAT.',
          respuesta_sunat:{envio:envio.respuesta_sunat}});
      }catch(e){
        const incierto=Boolean(envio || e.resultadoIncierto);
        await repo.actualizar(db,p,tipo,id,{estado:incierto?'INCIERTO':'RECHAZADO',
          ['ticket_'+tipo]:envio?.ticket || e.ticketReemplazo || null,
          descripcion:incierto?'Resultado incierto. Verifica en SUNAT antes de volver a enviar.':e.message,
          respuesta_sunat:{envio:envio?.respuesta_sunat || e.respuestaSunat || null}}).catch(guardado=>console.error('No se pudo actualizar control RCE:',guardado.message));
        throw Object.assign(fallo(incierto?'Resultado incierto. Consulta el ticket o verifica en SUNAT; no repitas el envio.':e.message,incierto?503:e.statusCode || 502),{mensajePublico:incierto?'Resultado incierto. Consulta el ticket o verifica en SUNAT; no repitas el envio.':e.message});
      }
      return {[tipo]:publico(r,tipo),message:r.descripcion};
    });
  };
  const seleccionar = async(db,p,entrada) => {
    const tipo=entrada.tipo;
    if(!['aceptacion','reemplazo'].includes(tipo))throw fallo('Selecciona aceptacion o reemplazo.',400);
    if(!uuid(entrada.id_operacion))throw fallo('Selecciona una operacion valida.',400);
    const r=await repo.obtener(db,p,tipo,entrada.id_operacion);
    if(!r)throw fallo('No se encontro la operacion en esta empresa y periodo.',404);
    return {r,tipo,id:r['id_'+tipo]};
  };
  const consultarTicket = async(db,p,ticket,procesos) => {
    const respuesta=await sunat.consultar({...p,db,ticket});
    const encontrado=(respuesta.registros || []).find(r=>String(r.numTicket)===ticket && String(r.perTributario)===p.periodo.replace('-','')
      && (!r.codLibro || String(r.codLibro)==='080000') && (!procesos || procesos.includes(Number(r.codProceso))));
    if(!encontrado)return {estado:'ENVIADO',descripcion:'SUNAT aun no devuelve este ticket. Vuelve a consultar.',respuesta:respuesta.respuesta_sunat};
    const detalles=Array.isArray(encontrado.detalleTicket)?encontrado.detalleTicket:encontrado.detalleTicket?[encontrado.detalleTicket]:[];
    const estados=[encontrado.codEstadoProceso,...detalles.map(r=>r.codEstadoEnvio)].filter(v=>v!=null).map(v=>String(v).padStart(2,'0'));
    const errores=detalles.some(r=>Number(r.cntCPError)>0);
    const rechazado=estados.includes('03') || errores;
    // RCE devuelve 04/06 al completar procesos; cualquier error de detalle prevalece.
    const estado=rechazado?'RECHAZADO':estados.some(c=>['04','06'].includes(c))?'TERMINADO':'ENVIADO';
    return {estado,codigo:rechazado?'03':String(encontrado.codEstadoProceso || estados[0] || ''),
      descripcion:encontrado.desEstadoProceso || detalles[0]?.desEstadoEnvio || 'En proceso SUNAT.',respuesta:respuesta.respuesta_sunat};
  };
  const consultarPresentacion = async entrada => {
    const p=contexto(entrada);
    return repo.bloquear(p,async db=>{
      const {r,tipo,id}=await seleccionar(db,p,entrada);
      if(terminal.includes(r.estado))return {[tipo]:publico(r,tipo)};
      const ticket=r['ticket_'+tipo];
      if(!ticket)throw fallo('El intento no tiene ticket confirmado. Revisa el resultado en SUNAT antes de reenviar.',409);
      const c=await consultarTicket(db,p,ticket,tipo==='aceptacion'?[2,39]:[61]);
      const nuevo=await repo.actualizar(db,p,tipo,id,{estado:c.estado,codigo_estado_sunat:c.codigo || null,descripcion:c.descripcion,
        respuesta_sunat:{...r.respuesta_sunat,consulta:c.respuesta}});
      return {[tipo]:publico(nuevo,tipo),message:c.descripcion};
    });
  };
  const registrarPreliminar = async entrada => {
    const p=contexto(entrada);confirmar(entrada);periodoPermitido(p);
    return repo.bloquear(p,async db=>{
      const {r,tipo,id}=await seleccionar(db,p,entrada);
      if(r.estado!=='TERMINADO')throw fallo('Primero consulta y confirma que la aceptacion o reemplazo termino correctamente.',409);
      if(r.respuesta_sunat?.preliminar && r.respuesta_sunat.preliminar.estado!=='RECHAZADO')throw fallo('Ya existe un intento de registrar preliminar. Consulta su estado antes de repetir.',409);
      const base={...r.respuesta_sunat,preliminar:{estado:'ENVIANDO',fecha:new Date().toISOString()}};
      await repo.actualizar(db,p,tipo,id,{respuesta_sunat:base});
      let envio;
      try{
        envio=await sunat.preliminar({...p,db});
        base.preliminar={...base.preliminar,estado:'ENVIADO',ticket:envio.ticket,respuesta:envio.respuesta_sunat};
        const nuevo=await repo.actualizar(db,p,tipo,id,{respuesta_sunat:base});
        return {[tipo]:publico(nuevo,tipo),message:'Registro preliminar solicitado. Consulta su ticket; la generacion final del libro se realiza en SOL.'};
      }catch(e){
        base.preliminar={...base.preliminar,estado:envio || e.resultadoIncierto?'INCIERTO':'RECHAZADO',ticket:envio?.ticket || null,descripcion:e.message};
        await repo.actualizar(db,p,tipo,id,{respuesta_sunat:base}).catch(()=>{});
        throw Object.assign(fallo('No se confirmo el registro preliminar. Actualiza y verifica su resultado antes de repetir.',e.statusCode || 502),{mensajePublico:'No se confirmo el registro preliminar. Actualiza y verifica su resultado antes de repetir.'});
      }
    });
  };
  const consultarPreliminar = async entrada => {
    const p=contexto(entrada);
    return repo.bloquear(p,async db=>{
      const {r,tipo,id}=await seleccionar(db,p,entrada), previo=r.respuesta_sunat?.preliminar;
      if(!previo?.ticket)throw fallo('No hay ticket preliminar confirmado. Verifica el intento en SUNAT.',409);
      if(terminal.includes(previo.estado))return {[tipo]:publico(r,tipo)};
      const c=await consultarTicket(db,p,previo.ticket,null);
      const nuevo=await repo.actualizar(db,p,tipo,id,{respuesta_sunat:{...r.respuesta_sunat,preliminar:{...previo,estado:c.estado,descripcion:c.descripcion,consulta:c.respuesta}}});
      return {[tipo]:publico(nuevo,tipo),message:c.descripcion};
    });
  };
  return {recuperarPresentacion,revisarPresentacion,prepararReemplazo,descargarReemplazo,
    aceptarPropuesta:entrada=>enviar(entrada,'aceptacion'),enviarReemplazo:entrada=>enviar(entrada,'reemplazo'),
    consultarPresentacion,registrarPreliminar,consultarPreliminar};
};
