// Sin --aplicar: solo diagnostico. Nunca llama a SUNAT ni imprime credenciales.
const pool=require('../src/db');
const {db}=require('../src/config');
pool.options.connectionTimeoutMillis=5000;
(async()=>{
 if(!db.host || !db.database || !db.user)throw new Error('Configura DB_HOST, DB_DATABASE y DB_USER para identificar la base destino.');
 const reporte=await require('../src/modules/sire/compras/application/migrarDetalle')(pool,{aplicar:process.argv.includes('--aplicar')});
 console.log(JSON.stringify(reporte,null,2));
})().catch(e=>{console.error('Migracion SIRE Compras no completada:',e.message);process.exitCode=1;}).finally(()=>pool.end());
