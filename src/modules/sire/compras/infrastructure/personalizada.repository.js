module.exports = pool => {
 const scope = p => [p.idAnfitrion,p.documentoId,p.periodo];
 const visible = "(periodo_origen=$3 OR periodo_destino=$3 OR (estado='PENDIENTE' AND periodo_destino<=$3))";
 const listar = async p => (await pool.query(`SELECT id_compra,periodo_origen,periodo_destino,origen,ticket_origen,estado,motivo,comprobante,version,fecha_modificacion
 FROM public.mco_sire_personalizada WHERE id_usuario=$1 AND documento_id=$2 AND `+visible+` ORDER BY comprobante->>'fecha_emision',id_compra`,scope(p))).rows;
 const obtener = async (p,id) => (await pool.query('SELECT * FROM public.mco_sire_personalizada WHERE id_usuario=$1 AND documento_id=$2 AND '+visible+' AND id_compra=$4',[...scope(p),id])).rows[0];
 const importar = async (p,ticket,rows) => {
   const r=await pool.query(
     `INSERT INTO public.mco_sire_personalizada (id_usuario,documento_id,periodo_origen,periodo_destino,origen,ticket_origen,clave,clave_origen,comprobante,original)
      SELECT $1,$2,$3,$3,'SUNAT',$4,r.clave,r.clave,r.comprobante,r.comprobante
      FROM jsonb_to_recordset($5::jsonb) AS r(clave text,comprobante jsonb) ON CONFLICT DO NOTHING RETURNING id_compra`,[...scope(p),ticket,JSON.stringify(rows)]);
   return r.rowCount;
 };
 const crear = async (p,r) => (await pool.query(
   `INSERT INTO public.mco_sire_personalizada (id_usuario,documento_id,periodo_origen,periodo_destino,origen,clave,comprobante,original,estado,motivo)
    VALUES ($1,$2,$3,$4,'MANUAL',$5,$6::jsonb,$6::jsonb,$7,$8) RETURNING *`,
   [...scope(p),r.periodo_destino,r.clave,JSON.stringify(r.comprobante),r.estado,r.motivo])).rows[0];
 const actualizar = async (p,id,version,r) => (await pool.query(
   `UPDATE public.mco_sire_personalizada t SET clave=$6,comprobante=$7::jsonb,estado=$8,motivo=$9,periodo_destino=$10,
     historial=historial || jsonb_build_array(to_jsonb(t)-'historial'),version=version+1,fecha_modificacion=clock_timestamp()
     WHERE id_usuario=$1 AND documento_id=$2 AND `+visible+` AND id_compra=$4 AND version=$5 RETURNING *`,
   [...scope(p),id,version,r.clave,JSON.stringify(r.comprobante),r.estado,r.motivo,r.periodo_destino])).rows[0];
 return {listar,obtener,importar,crear,actualizar};
};
