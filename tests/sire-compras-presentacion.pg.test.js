const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const AdmZip=require('adm-zip');
const cabecera=require('../src/modules/sire/compras/tests/fixtures/cabecera-rce.json');
const crearCompras=require('../src/modules/sire/compras/infrastructure/comprobantes.repository');
const crearControl=require('../src/modules/sire/compras/infrastructure/presentacion.repository');
const crearServicio=require('../src/modules/sire/compras/application/presentacion.service');
const {parsearTextoCompras}=require('../src/modules/sire/compras/domain/parserRce');

test('RCE: revision, aceptacion, ZIP personalizado, bloqueo de reenvios y preliminar',{skip:!process.env.SIRE_PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.SIRE_PGLITE_MODULE),pg=new PGlite();
 const query=async(sql,params)=>{
  const r=await pg.query(sql,params);
  r.rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])));
  return r;
 };
 const pool={query,connect:async()=>({query,release(){}})};
 const validar=e=>({idAnfitrion:e.id_anfitrion,documentoId:e.documento_id,periodo:e.periodo,idLibro:'080000'});
 const p={idAnfitrion:'contador@example.com',documentoId:'20123456789',periodo:'2025-09',idLibro:'080000'};
 const entrada=p=>({id_anfitrion:p.idAnfitrion,documento_id:p.documentoId,periodo:p.periodo});
 let aceptaciones=0,reemplazos=0,preliminares=0,proceso=2;
 const sunat={
  aceptar:async()=>{aceptaciones++;return {ticket:'ACEPT1',respuesta_sunat:{numTicket:'ACEPT1'}};},
  reemplazar:async args=>{reemplazos++;assert.equal(args.buffer[0],80);await args.guardarCarga('https://api-sire.sunat.gob.pe/carga/1');return {ticket:'REEMP1',respuesta_sunat:{numTicket:'REEMP1'}};},
  preliminar:async()=>{preliminares++;return {ticket:'PREL1',respuesta_sunat:{numTicket:'PREL1'}};},
  consultar:async args=>({registros:[{numTicket:'AJENO',perTributario:'202509',codProceso:proceso,codEstadoProceso:'03'},
    {numTicket:args.ticket,perTributario:'202509',codLibro:'080000',codProceso:proceso,codEstadoProceso:'06',detalleTicket:{cntCPError:0}}],respuesta_sunat:{ok:true}}),
 };
 try{
  await pg.exec(fs.readFileSync('docs/sql/sire_recrear_cabecera_detalle.sql','utf8'));
  await pg.exec(fs.readFileSync('docs/sql/mco_sire_presentacion.sql','utf8'));
  await pg.exec('CREATE TABLE mct_contabilidadticket(id_usuario CHAR(60),documento_id CHAR(20),periodo CHAR(10),id_libro CHAR(6),sire_tpropuesta VARCHAR(50));');
  const compras=crearCompras(pool),repo=crearControl(pool),servicio=crearServicio({repo,comprobantes:compras,sunat,validar});
  const cargar=async contexto=>{
   const r=Array(cabecera.length).fill('');Object.assign(r,{0:contexto.documentoId,1:'EMPRESA PRUEBA',2:'202509',3:'CAR1',4:'15/09/2025',6:'01',7:'F001',9:'123',11:'6',12:'20999999999',13:'PROVEEDOR',14:'100.00',15:'18.00',24:'118.00',25:'PEN',26:'1'});
   const b=Buffer.from(cabecera.join('|')+'\r\n'+r.join('|')+'\r\n');
   const c=parsearTextoCompras({contenido:b.toString(),documentoId:contexto.documentoId,periodo:contexto.periodo})[0];
   await query('INSERT INTO mct_contabilidadticket VALUES($1,$2,$3,$4,$5)',[contexto.idAnfitrion,contexto.documentoId,contexto.periodo,contexto.idLibro,'T1']);
   await compras.guardarPropuesta(contexto,'T1','rce.txt',b,[c]);return {b,c};
  };
  const {b,c}=await cargar(p);
  const revision=await servicio.revisarPresentacion(entrada(p));
  assert.equal(revision.puede_aceptar,true);
  await assert.rejects(servicio.aceptarPropuesta({...entrada(p),...revision,confirmar:true,huella_revision:'obsoleta'}),e=>e.statusCode===409);
  const aceptada=(await servicio.aceptarPropuesta({...entrada(p),...revision,confirmar:true})).aceptacion;
  assert.equal(aceptada.estado,'ENVIADO');assert.equal(aceptada.ticket,'ACEPT1');
  await assert.rejects(servicio.aceptarPropuesta({...entrada(p),...revision,confirmar:true}),e=>e.statusCode===409);
  assert.equal(aceptaciones,1);
  await assert.rejects(compras.crear(p,{comprobante:{...c,numero:'999'},estado:'DECLARAR',periodo_destino:p.periodo}),e=>e.statusCode===409);
  const identificacion={...entrada(p),tipo:'aceptacion',id_operacion:aceptada.id};
  assert.equal((await servicio.consultarPresentacion(identificacion)).aceptacion.estado,'TERMINADO');
  await servicio.registrarPreliminar({...identificacion,confirmar:true});
  await assert.rejects(servicio.registrarPreliminar({...identificacion,confirmar:true}),e=>e.statusCode===409);
  proceso=777;assert.equal((await servicio.consultarPreliminar(identificacion)).aceptacion.preliminar.estado,'TERMINADO');assert.equal(preliminares,1);
  assert.deepEqual((await compras.obtenerArchivo(p,'T1')).archivo,b);

  const p2={...p,documentoId:'20123456780'};await cargar(p2);
  const origen=(await compras.listar(p2))[0];
  await compras.actualizar(p2,origen.id_compra,origen.version,{comprobante:origen.comprobante,estado:'EXCLUIDO',motivo:'No corresponde',periodo_destino:p2.periodo});
  const manual=await compras.crear(p2,{comprobante:{...c,car_sunat:'',numero:'999',total:'20.00'},estado:'DECLARAR',periodo_destino:p2.periodo});
  assert.equal((await servicio.revisarPresentacion(entrada(p2))).puede_aceptar,false);
  const preparado=(await servicio.prepararReemplazo(entrada(p2))).reemplazo;
  const descargado=await servicio.descargarReemplazo({...entrada(p2),id_reemplazo:preparado.id});
  const zip=new AdmZip(descargado.archivo),txt=zip.readAsText(zip.getEntries()[0]);
  const cols=txt.trimEnd().split('|');cols.pop();
  assert.equal(cols.length,41);assert.equal(cols[0],p2.documentoId);assert.equal(cols[2],'202509');assert.equal(cols[3],'');assert.equal(cols[9],'999');assert.equal(cols[24],'20.00');
  assert.match(descargado.nombre_archivo,/00080400021112\.zip$/);
  await compras.actualizar(p2,manual.id_compra,manual.version,{comprobante:{...manual.comprobante,total:'30.00'},estado:'DECLARAR',periodo_destino:p2.periodo});
  await assert.rejects(servicio.enviarReemplazo({...entrada(p2),id_reemplazo:preparado.id,confirmar:true}),e=>e.statusCode===409);
  assert.equal(reemplazos,0);
  const nuevo=(await servicio.prepararReemplazo(entrada(p2))).reemplazo;
  const enviado=(await servicio.enviarReemplazo({...entrada(p2),id_reemplazo:nuevo.id,confirmar:true})).reemplazo;
  assert.equal(enviado.estado,'ENVIADO');assert.equal(enviado.cantidad_registros,1);assert.equal(reemplazos,1);
  proceso=61;
  assert.equal((await servicio.consultarPresentacion({...entrada(p2),tipo:'reemplazo',id_operacion:nuevo.id})).reemplazo.estado,'TERMINADO');
  await assert.rejects(servicio.descargarReemplazo({...entrada(p),id_reemplazo:nuevo.id}),e=>e.statusCode===404);
  assert.equal((await query('SELECT sire_tpropuesta FROM mct_contabilidadticket LIMIT 1')).rows[0].sire_tpropuesta,'T1');

  const p3={...p,documentoId:'20123456781'};await cargar(p3);
  const incierto=crearServicio({repo,comprobantes:compras,validar,sunat:{...sunat,aceptar:async()=>{throw Object.assign(new Error('timeout'),{resultadoIncierto:true});}}});
  const revisada=await incierto.revisarPresentacion(entrada(p3));
  await assert.rejects(incierto.aceptarPropuesta({...entrada(p3),...revisada,confirmar:true}),e=>e.statusCode===503);
  assert.equal((await incierto.recuperarPresentacion(entrada(p3))).aceptacion.estado,'INCIERTO');
  await assert.rejects(incierto.aceptarPropuesta({...entrada(p3),...revisada,confirmar:true}),e=>e.statusCode===409);
 }finally{await pg.close();}
});

test('Cliente RCE: URL propia, libro de carga y respuesta HTML incierta',async()=>{
 const crearCliente=require('../src/modules/sire/compras/infrastructure/presentacionSunat');
 const p={idAnfitrion:'contador',documentoId:'20123456789',periodo:'2025-09'};
 const urls=[];let carga;
 const cliente=crearCliente({obtenerToken:async()=>'TOKEN_PRUEBA',request:async(url,options)=>{urls.push(url);assert.equal(options.method,'POST');return {ok:true,text:async()=>'{"numTicket":"TICKET1"}'};},enviarArchivo:async args=>{carga=args;return {ticket:'TICKET2'};}});
 await cliente.aceptar(p);await cliente.preliminar(p);await cliente.reemplazar(p);
 assert.match(urls[0],/rce\/propuesta\/web\/registroslibros\/202509\/aceptarpropuesta$/);
 assert.match(urls[1],/rce\/preliminar\/web\/registroslibros\/202509\/registrapreliminares$/);
 assert.equal(carga.idLibro,'080000');
 const html=crearCliente({obtenerToken:async()=>'TOKEN_PRUEBA',request:async()=>({ok:true,text:async()=>'<html>error</html>'})});
 await assert.rejects(html.aceptar(p),e=>e.resultadoIncierto===true);
});
