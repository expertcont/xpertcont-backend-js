const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const engine=process.env.SIRE_PGLITE_MODULE;
const crearRepo=require('../src/modules/sire/compras/infrastructure/detalle.repository');
const crearBase=require('../src/modules/sire/compras/application/sireCompras.service');
const crearPersonalizada=require('../src/modules/sire/compras/application/personalizada.service');
const crearConciliacion=require('../src/modules/sire/compras/application/conciliacion.service');
const migrar=require('../src/modules/sire/compras/application/migrarDetalle');
const {parsearTextoCompras}=require('../src/modules/sire/compras/domain/parserRce');
const {leerArchivoPropuesta}=require('../src/modules/sire/compras/infrastructure/archivoPropuesta');
const {clave}=require('../src/modules/sire/compras/domain/personalizada');
const header=require('../src/modules/sire/compras/tests/fixtures/cabecera-rce.json');
const p={idAnfitrion:'host@example.com',documentoId:'20123456789',periodo:'2026-09'};
const ctx={id_anfitrion:p.idAnfitrion,documento_id:p.documentoId,periodo:p.periodo};
function archivo(cambios={}){const r=Array(header.length).fill('');Object.assign(r,{0:p.documentoId,1:'EMPRESA',2:'202609',3:'CAR1',4:'15/09/2026',6:'01',7:'F001',9:'00123',11:'6',12:'20999999999',13:'PROVEEDOR',14:'100.00',15:'18.00',24:'118.00',25:'PEN',26:'1',...cambios});return Buffer.from(header.join('|')+'\r\n'+r.join('|')+'\r\n');}
const parsear=b=>parsearTextoCompras({contenido:leerArchivoPropuesta(b),documentoId:p.documentoId,periodo:p.periodo});
test('PostgreSQL: importacion, CRUD, conciliacion y migracion verificadas en el motor',{skip:!engine},async t=>{
 const {PGlite}=require(engine);const pg=new PGlite();await pg.waitReady;
 const query=async(sql,params)=>{if(!params && sql.includes(';')){const result=await pg.exec(sql);return result[result.length-1] || {rows:[]};}try{const r=await pg.query(sql,params);r.rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])));return {...r,rowCount:r.affectedRows ?? r.rows.length};}catch(e){if(e.position)e.message+=' ['+sql.slice(Math.max(0,Number(e.position)-80),Number(e.position)+80)+']';delete e.query;delete e.params;throw e;}};
 const pool={query,connect:async()=>({query,release(){}})};
 const sql=n=>fs.readFileSync(path.join(__dirname,'../docs/sql',n),'utf8');
 const crearEsquema=async()=>{await pg.exec(`CREATE TABLE mct_contabilidadticket(id_usuario CHAR(60),documento_id CHAR(11),periodo CHAR(7),id_libro CHAR(6),sire_tpropuesta VARCHAR(50));`);await pg.exec(sql('mco_sire_propuesta.sql'));await pg.exec(sql('mco_sire_personalizada.sql'));await pg.exec(sql('mco_sire_propuesta_det.sql'));};
 try{
  await crearEsquema();const repo=crearRepo(pool);
  const personal=crearPersonalizada({repo,propuestas:repo,tickets:{obtenerDatosTicketPropuestaSire:async()=>({sire_tpropuesta:'T1'})},validar:crearBase({}).validar});
  const conciliar=crearConciliacion({repo,validar:crearBase({}).validar});
  let ticket='T1';const guardar=async(b=archivo())=>{await query('DELETE FROM mct_contabilidadticket');await query('INSERT INTO mct_contabilidadticket VALUES($1,$2,$3,$4,$5)',[p.idAnfitrion,p.documentoId,p.periodo,'080000',ticket]);return repo.guardarPropuesta(p,ticket,'rce.zip',b,parsear(b));};
  let idOriginal;
  await t.test('primer archivo alimenta una sola tabla operativa y repeticiones no duplican',async()=>{
   const r=await guardar();assert.equal(r.conciliacion_pendiente,false);idOriginal=(await repo.listar(p))[0].id_compra;
   await guardar();assert.equal((await query('SELECT count(*)::int AS n FROM mco_sire_propuesta_det')).rows[0].n,1);
   const original=await repo.obtenerPropuesta(p,'T1');assert.equal(original.detalle[0].base001,'100.00');
   await assert.rejects(guardar(archivo({14:'101',15:'18.18',24:'119.18'})),e=>e.statusCode===409);
   assert.deepEqual(Buffer.from((await repo.obtenerArchivo(p,'T1')).archivo),archivo());
  });
  await t.test('editar, excluir, observar y recuperar preserva originales y control de versiones',async()=>{
   const anterior=await repo.obtener(p,idOriginal);
   await personal.editarPersonalizada({...ctx,id_compra:idOriginal,version:anterior.version,comprobante:{base001:'110',igv001:'19.80',total:'129.80'},usuario_ajuste:'contador@example.com'});
   const r=await repo.obtener(p,idOriginal);assert.equal(r.comprobante.base001,'110.00');assert.equal(r.original.base001,'100.00');assert.equal(r.usuario_ajuste,'contador@example.com');
   await assert.rejects(personal.editarPersonalizada({...ctx,id_compra:idOriginal,version:anterior.version,comprobante:r.comprobante}),e=>e.statusCode===409);
   await personal.editarPersonalizada({...ctx,id_compra:idOriginal,version:r.version,comprobante:r.comprobante,estado:'OBSERVADO',motivo:'Revisar documento'});
   const observado=await repo.obtener(p,idOriginal);assert.equal(observado.estado,'OBSERVADO');
   await personal.editarPersonalizada({...ctx,id_compra:idOriginal,version:observado.version,comprobante:observado.comprobante,estado:'DECLARAR'});
  });
  await t.test('segunda descarga queda en espera sin sobrescribir ajustes',async()=>{
   ticket='T2';const r=await guardar(archivo({14:'200',15:'36',24:'236'}));assert.equal(r.conciliacion_pendiente,true);
   assert.equal((await repo.listar(p))[0].comprobante.total,'129.80');
   const pro=await repo.obtenerPropuesta(p,'T2');assert.equal(pro.detalle[0].total,'236.00');assert.equal(pro.conciliacion_pendiente,true);
   const revision=await conciliar.revisarConciliacion({...ctx,id_propuesta:r.id_propuesta});assert.ok(revision.registros[0].campos_con_conflicto.includes('total'));
   await assert.rejects(conciliar.confirmarConciliacion({...ctx,id_propuesta:r.id_propuesta,confirmar:true,huella_revision:'0'.repeat(64)}),e=>e.statusCode===409);
   await conciliar.confirmarConciliacion({...ctx,id_propuesta:r.id_propuesta,confirmar:true,huella_revision:revision.huella_revision});
   const lista=await repo.listar(p);assert.equal(lista.length,1);assert.equal(lista[0].comprobante.total,'129.80');assert.equal(lista[0].original.total,'236.00');idOriginal=lista[0].id_compra;
  });
  await t.test('manuales sin SUNAT y pendientes entre periodos usan la misma fila',async()=>{
   const compra=(await repo.obtener(p,idOriginal)).comprobante;
   const nuevo=await personal.crearPersonalizada({...ctx,comprobante:{...compra,numero:'999'},estado:'PENDIENTE',motivo:'Falta constancia',periodo_destino:'2026-10'});
   assert.equal(nuevo.registro.origen,'MANUAL');const octubre={...p,periodo:'2026-10'};
   assert.equal((await repo.listar(octubre)).length,1);
   await personal.editarPersonalizada({...ctx,periodo:'2026-10',id_compra:nuevo.registro.id_compra,version:1,comprobante:compra,estado:'DECLARAR'}).then(()=>assert.fail('debe rechazar identidad duplicada'),e=>assert.equal(e.statusCode,409));
   await personal.editarPersonalizada({...ctx,periodo:'2026-10',id_compra:nuevo.registro.id_compra,version:1,comprobante:nuevo.registro.comprobante,estado:'DECLARAR'});
   assert.equal((await repo.obtener(octubre,nuevo.registro.id_compra)).periodo_origen,'2026-09');
   assert.equal((await query('SELECT count(*)::int AS n FROM mco_sire_personalizada')).rows[0].n,0);
   assert.equal((await repo.listar({...p,documentoId:'20888888888'})).length,0);
  });
  await t.test('parser real conserva DGNG, DNG, referencias y precision decimal',async()=>{
   const r=parsear(archivo({16:'20',17:'3.60',18:'5',19:'0.90',20:'10',21:'2',22:'0.50',23:'1',24:'161',27:'15/08/2026',28:'01',29:'A001',31:'12',32:'1',33:'PROYECTO'}))[0];
   assert.equal(r.base002,'20.00');assert.equal(r.igv003,'0.90');assert.equal(r.icbp,'0.50');assert.equal(r.fecha_emision_ref,'2026-08-15');assert.equal(r.clasificacion_bienes_servicios,'1');assert.ok(Object.values(r.datos_adicionales).includes('PROYECTO'));
   const muestra=path.join(__dirname,'../../SIRE Documentacion/20603421885-20231111-0812-propuesta.txt');
   if(fs.existsSync(muestra)){const lista=parsearTextoCompras({contenido:leerArchivoPropuesta(fs.readFileSync(muestra)),documentoId:'20603421885',periodo:'2023-10'});assert.equal(lista.length,149);}
  });
  await t.test('migracion simula, verifica, preserva ajustes/manuales y es idempotente',async()=>{
   // Base efimera de prueba: nunca usa la conexion configurada ni Railway.
   await pg.exec('TRUNCATE mco_sire_propuesta_det,mco_sire_propuesta,mco_sire_personalizada,mct_contabilidadticket RESTART IDENTITY CASCADE');
   const b=archivo(),original=parsear(b)[0];
   const h=(await query('INSERT INTO mco_sire_propuesta(id_usuario,documento_id,periodo,ticket,nombre_archivo,archivo,detalle) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id_propuesta',[p.idAnfitrion,p.documentoId,p.periodo,'L1','rce.txt',b,JSON.stringify([original])])).rows[0];
   for(const [id,origen,numero,estado] of [[42,'SUNAT','00123','EXCLUIDO'],[43,'MANUAL','999','PENDIENTE']]){
    const c={...original,numero,base001:'90.00',igv001:'16.20',total:'106.20'};
    await query(`INSERT INTO mco_sire_personalizada(id_compra,id_usuario,documento_id,clave,clave_origen,periodo_origen,periodo_destino,origen,ticket_origen,estado,motivo,comprobante,original,version,historial) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Falta documento',$11::jsonb,$12::jsonb,3,'[{"cambio":"anterior"}]')`,[id,p.idAnfitrion,p.documentoId,clave(c),origen==='SUNAT'?clave(original):null,p.periodo,estado==='PENDIENTE'?'2026-10':p.periodo,origen,origen==='SUNAT'?'L1':null,estado,JSON.stringify(c),JSON.stringify(original)]);
   }
   await assert.rejects(repo.listar(p),e=>e.statusCode===503);
   const simulacion=await migrar(pool);assert.equal(simulacion.ajustes_legacy,2);assert.equal((await query('SELECT count(*)::int AS n FROM mco_sire_propuesta_det')).rows[0].n,0);
   const aplicado=await migrar(pool,{aplicar:true});assert.equal(aplicado.operativos,2);const lista=await repo.listar(p);assert.equal(lista.length,2);assert.ok(lista.every(r=>Number(r.id_compra)>43));assert.equal(lista.find(r=>r.origen==='SUNAT').estado,'EXCLUIDO');assert.equal(lista.find(r=>r.origen==='SUNAT').comprobante.total,'106.20');assert.equal(lista.find(r=>r.origen==='SUNAT').original.total,'118.00');
   assert.equal((await query('SELECT count(*)::int AS n FROM mco_sire_personalizada')).rows[0].n,2);
   assert.deepEqual(Buffer.from((await repo.obtenerArchivo(p,'L1')).archivo),b);
   assert.equal((await migrar(pool,{aplicar:true})).cabeceras,0);assert.equal((await repo.listar(p)).length,2);
   assert.equal((await query('SELECT detalle FROM mco_sire_propuesta WHERE id_propuesta=$1',[h.id_propuesta])).rows[0].detalle[0].total,'118.00');
  });
  await t.test('migracion con totales divergentes revierte todos los cambios',async()=>{
   const b=archivo({9:'456'}),r=parsear(b)[0];const json=[{...r,total:'999.00'}];
   await query('INSERT INTO mco_sire_propuesta(id_usuario,documento_id,periodo,ticket,nombre_archivo,archivo,detalle) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[p.idAnfitrion,p.documentoId,p.periodo,'MAL','mal.txt',b,JSON.stringify(json)]);
   const antes=(await query('SELECT count(*)::int AS n FROM mco_sire_propuesta_det')).rows[0].n;
   await assert.rejects(migrar(pool,{aplicar:true}),/No coinciden cantidades o totales/);
   assert.equal((await query('SELECT count(*)::int AS n FROM mco_sire_propuesta_det')).rows[0].n,antes);
  });
 }catch(e){delete e.query;delete e.params;throw e;}finally{await pg.close();}
});
