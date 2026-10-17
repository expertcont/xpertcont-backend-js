const test=require('node:test');
const assert=require('node:assert/strict');
const crearServicio=require('../application/personalizada.service');
const crearBase=require('../application/sireCompras.service');
const crearRepo=require('../infrastructure/personalizada.repository');
const {validarCompra,clave}=require('../domain/personalizada');
const contexto={id_anfitrion:'host@example.com',documento_id:'20123456789',periodo:'2026-09'};
const compra={fecha_emision:'2026-09-15',tipo_comprobante:'01',serie:'F001',numero:'000123',tipo_doc_proveedor:'6',documento_proveedor:'20999999999',proveedor:'PROVEEDOR',moneda:'PEN',base001:100,igv001:18,total:118};
function entorno(){
 const rows=[];
 const visible=(p,r)=>r.id_usuario===p.idAnfitrion && r.documento_id===p.documentoId && (r.periodo_origen===p.periodo || r.periodo_destino===p.periodo || r.estado==='PENDIENTE' && r.periodo_destino<=p.periodo);
 const repo={
  listar:async p=>rows.filter(r=>visible(p,r)),
  obtener:async(p,id)=>rows.find(r=>visible(p,r) && String(r.id_compra)===String(id)),
  crear:async(p,r)=>{if(rows.some(x=>x.clave===r.clave && x.documento_id===p.documentoId && x.id_usuario===p.idAnfitrion))throw Object.assign(Error('duplicate'),{code:'23505'});const row={...r,id_compra:String(rows.length+1),id_usuario:p.idAnfitrion,documento_id:p.documentoId,periodo_origen:p.periodo,origen:'MANUAL',version:1};rows.push(row);return row;},
  importar:async(p,ticket,items)=>{let n=0;for(const item of items){if(rows.some(r=>r.clave===item.clave || r.clave_origen===item.clave))continue;const r=await repo.crear(p,{...item,estado:'DECLARAR',motivo:'',periodo_destino:p.periodo});r.origen='SUNAT';r.clave_origen=item.clave;n++;}return n;},
  actualizar:async(p,id,version,r)=>{const row=await repo.obtener(p,id);if(!row || row.version!==version)return null;Object.assign(row,r,{version:version+1});return row;},
 };
 const service=crearServicio({repo,propuestas:{obtenerPropuesta:async()=>({detalle:[compra]})},tickets:{obtenerDatosTicketPropuestaSire:async()=>({sire_tpropuesta:'TICKET'})},validar:crearBase({}).validar});
 return {service,repo,rows};
}
test('cargar SUNAT incluye todos sin duplicar ni borrar exclusiones al recargar',async()=>{
 const e=entorno();assert.equal((await e.service.importarPersonalizada(contexto)).cantidad,1);
 await e.service.eliminarPersonalizada({...contexto,id_compra:'1',version:1,motivo:'Gasto personal'});
 assert.equal((await e.service.importarPersonalizada(contexto)).cantidad,0);
 const {registros}=await e.service.listarPersonalizada(contexto);assert.equal(registros.length,1);assert.equal(registros[0].estado,'EXCLUIDO');
});
test('CRUD manual persiste edicion, exclusion y recuperacion',async()=>{
 const e=entorno();await e.service.crearPersonalizada({...contexto,comprobante:compra});
 await e.service.editarPersonalizada({...contexto,id_compra:'1',version:1,comprobante:{...compra,proveedor:'EDITADO'}});
 await e.service.eliminarPersonalizada({...contexto,id_compra:'1',version:2,motivo:'No corresponde'});
 assert.equal(e.rows[0].estado,'EXCLUIDO');
 await e.service.editarPersonalizada({...contexto,id_compra:'1',version:3,comprobante:e.rows[0].comprobante,estado:'DECLARAR'});
 assert.equal(e.rows[0].version,4);assert.equal(e.rows[0].comprobante.proveedor,'EDITADO');
});
test('pendientes aparecen el siguiente periodo y no se incluyen hasta revision explicita',async()=>{
 const e=entorno();await e.service.crearPersonalizada({...contexto,comprobante:compra,estado:'PENDIENTE',motivo:'Falta constancia',periodo_destino:'2026-10'});
 const octubre={...contexto,periodo:'2026-10'};
 let r=(await e.service.listarPersonalizada(octubre)).registros[0];assert.equal(r.estado,'PENDIENTE');
 assert.equal((await e.service.listarPersonalizada({...contexto,periodo:'2026-11'})).registros.length,1);
 await e.service.editarPersonalizada({...octubre,id_compra:r.id_compra,version:r.version,comprobante:r.comprobante,estado:'DECLARAR'});
 assert.equal(e.rows[0].periodo_destino,'2026-10');assert.equal(e.rows[0].estado,'DECLARAR');
 assert.equal((await e.service.listarPersonalizada({...contexto,periodo:'2026-11'})).registros.length,0);
 await assert.rejects(e.service.editarPersonalizada({...contexto,id_compra:'1',version:2,comprobante:compra}),err=>err.statusCode===409);
});
test('pendiente puede posponerse otra vez sin duplicarse',async()=>{
 const e=entorno();await e.service.crearPersonalizada({...contexto,comprobante:compra,estado:'PENDIENTE',motivo:'Falta documento',periodo_destino:'2026-10'});
 await e.service.editarPersonalizada({...contexto,periodo:'2026-10',id_compra:'1',version:1,comprobante:compra,estado:'PENDIENTE',motivo:'Sigue faltando',periodo_destino:'2026-11'});
 assert.equal(e.rows.length,1);assert.equal(e.rows[0].periodo_destino,'2026-11');
});
test('impide cambios de otra empresa, anfitrion o periodo y versiones antiguas',async()=>{
 const e=entorno();await e.service.crearPersonalizada({...contexto,comprobante:compra});
 const editar={...contexto,id_compra:'1',version:1,comprobante:compra};
 for(const cambio of [{documento_id:'20888888888'},{id_anfitrion:'other@example.com'},{periodo:'2026-08'}])await assert.rejects(e.service.editarPersonalizada({...editar,...cambio}),err=>err.statusCode===404);
 await e.service.editarPersonalizada(editar);
 await assert.rejects(e.service.editarPersonalizada(editar),err=>err.statusCode===409);
});
test('requiere motivo y destino futuro para pendientes, y motivo para excluir',async()=>{
 const e=entorno();
 for(const r of [{estado:'PENDIENTE',motivo:'falta',periodo_destino:'2026-09'},{estado:'PENDIENTE',periodo_destino:'2026-10'},{estado:'EXCLUIDO'},{estado:'OTRO'}])await assert.rejects(e.service.crearPersonalizada({...contexto,comprobante:compra,...r}),err=>err.statusCode===422);
 assert.equal(e.rows.length,0);
});
test('valida fecha real, RUC, importes y no admite fecha de un periodo futuro',()=>{
 for(const cambio of [{fecha_emision:'2026-09-31'},{fecha_emision:'2026-10-01'},{documento_proveedor:'123'},{total:'NaN'},{total:Infinity},{tipo_comprobante:'x'}])assert.throws(()=>validarCompra({...compra,...cambio},'2026-09'),err=>err.statusCode===422);
 assert.equal(validarCompra({...compra,total:-118},'2026-09').total,-118);
});
test('detecta duplicados normalizando serie y ceros del correlativo',async()=>{
 const e=entorno();await e.service.crearPersonalizada({...contexto,comprobante:compra});
 await assert.rejects(e.service.crearPersonalizada({...contexto,comprobante:{...compra,serie:'f001',numero:'123'}}),err=>err.statusCode===409);
 assert.equal(clave(validarCompra(compra,'2026-09')),clave(validarCompra({...compra,numero:'123'},'2026-09')));
});
test('repositorio parametriza empresa, periodo y version, y conserva historial',async()=>{
 const calls=[];const repo=crearRepo({query:async(sql,args)=>{calls.push({sql,args});return {rows:[],rowCount:0};}});
 const p={idAnfitrion:'HOST',documentoId:'20123456789',periodo:'2026-10'};
 await repo.listar(p);assert.deepEqual(calls[0].args,['HOST','20123456789','2026-10']);assert.match(calls[0].sql,/estado='PENDIENTE' AND periodo_destino<=\$3/);
 await repo.actualizar(p,'7',2,{clave:'KEY',comprobante:compra,estado:'EXCLUIDO',motivo:'No aplica',periodo_destino:'2026-10'});
 assert.match(calls[1].sql,/id_usuario=\$1 AND documento_id=\$2/);assert.match(calls[1].sql,/version=\$5/);assert.match(calls[1].sql,/jsonb_build_array/);assert.equal(calls[1].args[4],2);
});
