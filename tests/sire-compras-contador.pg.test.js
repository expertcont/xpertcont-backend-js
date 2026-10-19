const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const crearRepo=require('../src/modules/sire/compras/infrastructure/comprobantes.repository');
const crearServicio=require('../src/modules/sire/compras/application/sireCompras.service');
const crearPersonalizada=require('../src/modules/sire/compras/application/personalizada.service');
const crearConciliacion=require('../src/modules/sire/compras/application/conciliacion.service');
const {parsearTextoCompras}=require('../src/modules/sire/compras/domain/parserRce');
const {leerArchivoPropuesta}=require('../src/modules/sire/compras/infrastructure/archivoPropuesta');
const cabecera=require('../src/modules/sire/compras/tests/fixtures/cabecera-rce.json');

test('Compras: contador sin registro interno, CRUD y conciliacion conservando ajustes',{skip:!process.env.SIRE_PGLITE_MODULE},async()=>{
 const {PGlite}=require(process.env.SIRE_PGLITE_MODULE);const pg=new PGlite();
 const query=async(sql,params)=>{
  try{
   if(!params && sql.includes(';'))return (await pg.exec(sql)).at(-1) || {rows:[]};
   const r=await pg.query(sql,params);r.rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])));return r;
  }catch(e){e.message+=' [SQL: '+sql.slice(0,130)+']';delete e.query;delete e.params;throw e;}
 };
 const pool={query,connect:async()=>({query,release(){}})};
 const p={idAnfitrion:'contador@example.com',documentoId:'20123456789',periodo:'2026-09',idLibro:'080000'};
 const entrada={id_anfitrion:p.idAnfitrion,documento_id:p.documentoId,periodo:p.periodo};
 const archivo=(total='118.00')=>{
  const r=Array(cabecera.length).fill('');Object.assign(r,{0:p.documentoId,1:'EMPRESA',2:'202609',3:'CAR1',4:'15/09/2026',6:'01',7:'F001',9:'123',11:'6',12:'20999999999',13:'PROVEEDOR',14:'100.00',15:'18.00',24:total,25:'PEN',26:'1'});
  return Buffer.from(cabecera.join('|')+'\r\n'+r.join('|')+'\r\n');
 };
 const parsear=b=>parsearTextoCompras({contenido:leerArchivoPropuesta(b),documentoId:p.documentoId,periodo:p.periodo});
 try{
  await pg.exec(fs.readFileSync(path.join(__dirname,'../docs/sql/sire_recrear_cabecera_detalle.sql'),'utf8'));
  await pg.exec('CREATE TABLE mct_contabilidadticket(id_usuario CHAR(60),documento_id CHAR(20),periodo CHAR(10),id_libro CHAR(6),sire_tpropuesta VARCHAR(50));');
  const repo=crearRepo(pool);
  const tickets={obtenerDatosTicketPropuestaSire:async()=>(await query('SELECT * FROM mct_contabilidadticket LIMIT 1')).rows[0] || null};
  const servicio=crearServicio({propuestas:repo,tickets,comprasSistema:{obtenerComprasSistema:async()=>{throw Object.assign(new Error('Sin registro administrativo'),{code:'42P01'});}},sunat:{},leerArchivo:leerArchivoPropuesta});
  const personal=crearPersonalizada({repo,propuestas:repo,tickets,validar:servicio.validar,consultarPropuesta:servicio.consultar});
  const conciliacion=crearConciliacion({repo,validar:servicio.validar});
  assert.equal((await servicio.recuperar(entrada)).sistema_disponible,false);
  const b=archivo();const c=parsear(b)[0];
  const manual=await personal.crearPersonalizada({...entrada,comprobante:{...c,numero:'999'},estado:'PENDIENTE',motivo:'Falta constancia',periodo_destino:'2026-10'});
  assert.equal(manual.registro.origen,'MANUAL');
  assert.equal((await repo.listar({...p,periodo:'2026-10'})).length,1);
  await query('INSERT INTO mct_contabilidadticket VALUES($1,$2,$3,$4,$5)',[p.idAnfitrion,p.documentoId,p.periodo,p.idLibro,'T1']);
  await repo.guardarPropuesta(p,'T1','rce.txt',b,[c]);
  let actual=(await repo.listar(p)).find(r=>r.origen==='SUNAT');
  assert.equal((await repo.listar(p)).length,2);
  await personal.editarPersonalizada({...entrada,id_compra:actual.id_compra,version:1,comprobante:{proveedor:'PROVEEDOR REVISADO'},estado:'EXCLUIDO',motivo:'No corresponde declarar'});
  actual=await repo.obtener(p,actual.id_compra);
  assert.equal(actual.original.proveedor,'PROVEEDOR');assert.equal(actual.estado,'EXCLUIDO');
  await assert.rejects(personal.editarPersonalizada({...entrada,id_compra:actual.id_compra,version:1,comprobante:c}),e=>e.statusCode===409);
  assert.equal(await repo.obtener({...p,idAnfitrion:'otra-empresa'},actual.id_compra).catch(e=>e.statusCode),409);
  await repo.guardarPropuesta(p,'T1','rce.txt',b,[c]);
  assert.equal((await repo.listar(p)).length,2);
  await query("UPDATE mct_contabilidadticket SET sire_tpropuesta='T2'");
  const nuevo=archivo('119.00');const datos=parsear(nuevo);
  assert.equal((await repo.guardarPropuesta(p,'T2','rce2.txt',nuevo,datos)).conciliacion_pendiente,true);
  actual=await repo.obtener(p,actual.id_compra);assert.equal(actual.comprobante.total,'118.00');
  const revision=await conciliacion.revisarConciliacion({...entrada,id_propuesta:'T2'});
  await assert.rejects(conciliacion.confirmarConciliacion({...entrada,id_propuesta:'T2',confirmar:true,huella_revision:'0'.repeat(64)}),e=>e.statusCode===409);
  await conciliacion.confirmarConciliacion({...entrada,id_propuesta:'T2',confirmar:true,huella_revision:revision.huella_revision});
  actual=(await repo.listar(p)).find(r=>r.origen==='SUNAT');
  assert.equal(actual.estado,'EXCLUIDO');assert.equal(actual.comprobante.proveedor,'PROVEEDOR REVISADO');assert.equal(actual.comprobante.total,'119.00');
  assert.equal((await repo.listar(p)).filter(r=>r.origen==='MANUAL').length,1);
  assert.deepEqual((await repo.obtenerArchivo(p,'T1')).archivo,b);
  const recuperado=await servicio.recuperar(entrada);assert.equal(recuperado.sistema_disponible,false);assert.equal(recuperado.propuesta.detalle[0].total,'119.00');
  assert.equal((await query('SELECT count(*)::int AS n FROM mco_sire_propuesta')).rows[0].n,2);
  assert.equal((await query('SELECT count(*)::int AS n FROM mco_sire_propuesta_datos')).rows[0].n,2);
 }finally{await pg.close();}
});
