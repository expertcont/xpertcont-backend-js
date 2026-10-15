// Sin --aplicar solo verifica; no imprime credenciales ni datos de contribuyentes.
const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../src/db');
pool.options.connectionTimeoutMillis = 5000;
(async () => {
  const destino = require('../src/config').db;
  if (!destino.host || !destino.database || !destino.user) throw new Error('Configura DB_HOST, DB_DATABASE y DB_USER para identificar explicitamente la base destino.');
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT current_database() AS base');
    console.log('Base configurada:', rows[0].base);
    if (process.argv.includes('--aplicar')) {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['migracion-sire-transporte']);
      for (const archivo of ['mct_contabilidadticket_fecha_generacion_sire.sql','mve_sire_propuesta_tables.sql','mve_sire_aceptacion.sql','mve_sire_reemplazo.sql','mve_sire_reemplazo_flujo.sql']) {
        await client.query(await fs.readFile(path.join(__dirname, '../docs/sql', archivo), 'utf8'));
        console.log('Aplicada:', archivo);
      }
      await client.query('COMMIT');
    }
    const columnas = await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='mve_sire_reemplazo'`);
    const requeridas = ['fuente','resumen','ticket_actualizacion','estado_actualizacion','id_propuesta_actualizada','conciliado_por'];
    const faltantes = requeridas.filter((c) => !columnas.rows.some((r) => r.column_name === c));
    console.log(faltantes.length ? 'Falta aplicar migracion: ' + faltantes.join(', ') : 'Esquema de reemplazo verificado.');
    if (faltantes.length) process.exitCode = 1;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
})().catch((error) => { console.error('No se completo la migracion/verificacion:', error.code || error.message); process.exitCode = 1; })
  .finally(() => pool.end());