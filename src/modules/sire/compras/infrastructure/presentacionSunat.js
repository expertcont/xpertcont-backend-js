const fetch = require('node-fetch');
const cliente = require('../../../../services/sire/sireSunatClient.service');
const tus = require('../../../../services/sire/sireReemplazoSunat.service');

module.exports = ({request=fetch,obtenerToken=cliente.obtenerTokenSire,enviarArchivo=tus.enviarArchivo}={}) => {
  const post = async (p, ruta) => {
    const token = await obtenerToken(p);
    let response, data;
    try {
      response = await request('https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rce/'+ruta, {
        method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
        timeout:90000,redirect:'error',
      });
      const raw = await response.text();
      try {data=raw?JSON.parse(raw):null;}catch(_){data=null;}
    } catch (_) {
      throw Object.assign(new Error('No se pudo confirmar la respuesta de SUNAT. Consulta el estado antes de repetir el envio.'),{statusCode:503,resultadoIncierto:true});
    }
    if (!response.ok) throw Object.assign(new Error(data?.msg || data?.message || 'SUNAT rechazo la solicitud RCE.'), {
      statusCode:response.status>=400 && response.status<500?422:502,
      resultadoIncierto:response.status>=500 || [408,409].includes(response.status),respuestaSunat:data,
    });
    const ticket=String(data?.numTicket || '').trim();
    if (!/^[A-Za-z0-9]{1,50}$/.test(ticket)) throw Object.assign(new Error('SUNAT no devolvio un ticket RCE valido. Verifica el resultado antes de reenviar.'),{statusCode:502,resultadoIncierto:true,respuestaSunat:data});
    return {ticket,respuesta_sunat:data};
  };
  return {
    aceptar:p=>post(p,'propuesta/web/registroslibros/'+p.periodo.replace('-','')+'/aceptarpropuesta'),
    preliminar:p=>post(p,'preliminar/web/registroslibros/'+p.periodo.replace('-','')+'/registrapreliminares'),
    reemplazar:p=>enviarArchivo({...p,idLibro:'080000'}),
    consultar:p=>cliente.consultarEstadoTicketSire({...p,idLibro:'080000'}),
  };
};
