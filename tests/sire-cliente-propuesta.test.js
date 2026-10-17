const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function cliente(html=false) {
  const urls=[], guardados=[];
  const repository={
    obtenerDatosTicketPropuestaSire:async()=>null,
    obtenerCredencialesSire:async()=>({sire_id:'ID',sire_secret:'SECRET',sire_sol:'USER',sire_solpwd:'PWD'}),
    registrarTicketPropuestaSire:async p=>{guardados.push(p);return p.ticket;}
  };
  const fetch=async url=>{
    urls.push(url);
    if(url.includes('/oauth2/'))return {ok:true,json:async()=>({access_token:'TOKEN'})};
    return {ok:!html,status:html?404:200,json:async()=>{if(html)throw new SyntaxError('Unexpected token <');return {numTicket:'TICKET1'};}};
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/sire/sireSunatClient.service.js'),'utf8'),{
    module,URLSearchParams,Date,require:id=>{
      if(id==='node-fetch')return fetch;
      if(id==='../../repositories/sire/sire.repository')return repository;
      throw Error(id);
    }
  });
  return {api:module.exports,urls,guardados};
}
const params={idAnfitrion:'host@example.com',documentoId:'20123456789',periodo:'2026-09'};
test('RCE genera con su propia operacion y persiste el ticket de compras',async()=>{
  for(const idLibro of ['008','080000']){
    const e=cliente();
    assert.equal((await e.api.generarTicketPropuestaSire({...params,idLibro})).ticket,'TICKET1');
    const url=new URL(e.urls[1]);
    assert.equal(url.pathname,'/v1/contribuyente/migeigv/libros/rce/propuesta/web/propuesta/202609/exportacioncomprobantepropuesta');
    assert.equal(url.searchParams.get('codTipoArchivo'),'0');
    assert.equal(url.searchParams.get('codOrigenEnvio'),'2');
    assert.equal(e.guardados[0].idLibro,'080000');
  }
});
test('RVIE conserva su operacion original',async()=>{
  const e=cliente();await e.api.generarTicketPropuestaSire({...params,idLibro:'014'});
  assert.ok(e.urls[1].endsWith('/rvie/propuesta/web/propuesta/202609/exportapropuesta?codTipoArchivo=0'));
  assert.equal(e.guardados[0].idLibro,'140000');
});
test('respuesta HTML produce error controlado y no persiste un ticket',async()=>{
  const e=cliente(true);
  await assert.rejects(e.api.generarTicketPropuestaSire({...params,idLibro:'008'}),error=>{
    assert.equal(error.statusCode,502);
    assert.equal(error.codigo,'SIRE_RESPUESTA_NO_JSON');
    assert.match(error.mensajePublico,/Compras.*HTTP 404/);
    return true;
  });
  assert.equal(e.guardados.length,0);
});
