// Verifica el esquema ya instalado. Nunca recrea tablas ni aplica los SQL antiguos.
const pool=require('../src/db');
pool.options.connectionTimeoutMillis=5000;
(async()=>{
  const destino=require('../src/config').db;
  if(!destino.host || !destino.database || !destino.user)throw new Error('Configura explicitamente DB_HOST, DB_DATABASE y DB_USER.');
  if(process.argv.includes('--aplicar'))throw new Error('El esquema SIRE cambio. Este comando ahora solo verifica. No vuelvas a ejecutar el SQL de recreacion sobre datos existentes.');
  const esperadas={mve_sire_propuesta:['id_usuario','documento_id','periodo','r_cod','r_serie','r_numero','ticket','raw_linea'],
    mve_sire_propuesta_datos:['ticket','archivo','huella_archivo','cantidad_registros','totales_originales'],
    mve_sire_aceptacion:['ticket_propuesta','ticket_aceptacion'],mve_sire_reemplazo:['ticket_actualizacion','estado_actualizacion','resumen']};
  const r=await pool.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])`,[Object.keys(esperadas)]);
  const faltantes=[];
  for(const [tabla,columnas] of Object.entries(esperadas))for(const col of columnas)if(!r.rows.some(x=>x.table_name===tabla && x.column_name===col))faltantes.push(tabla+'.'+col);
  if(faltantes.length)throw new Error('Estructura SIRE Ventas incompleta: '+faltantes.join(', '));
  console.log('Esquema actual de SIRE Ventas verificado. No se modificaron datos.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
