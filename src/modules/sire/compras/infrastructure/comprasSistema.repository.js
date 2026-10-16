// Adaptador de lectura. Sustituir esta fuente al migrar los registros del sistema.
module.exports = (pool) => {
const clave = p => [p.idAnfitrion, p.documentoId, p.periodo];
const obtenerComprasSistema = async (p) => {
  const r = await pool.query(`SELECT num_asiento, r_fecemi::text AS fecha_emision,
    r_cod AS tipo_comprobante, r_serie AS serie, r_ano_dam AS ano_dam, r_numero AS numero,
    r_id_doc AS tipo_doc_proveedor, r_documento_id AS documento_proveedor, r_razon_social AS proveedor,
    COALESCE(r_base001,0) AS base001, COALESCE(r_igv001,0) AS igv001,
    COALESCE(r_base002,0) AS base002, COALESCE(r_igv002,0) AS igv002,
    COALESCE(r_base003,0) AS base003, COALESCE(r_igv003,0) AS igv003,
    COALESCE(r_base004,0) AS base004, COALESCE(r_monto_isc,0) AS isc,
    COALESCE(r_monto_icbp,0) AS icbp, COALESCE(r_monto_otros,0) AS otros,
    COALESCE(r_monto_total,0) AS total, COALESCE(NULLIF(r_moneda,''),'PEN') AS moneda
    FROM public.mct_asientocontable WHERE id_usuario=$1 AND documento_id=$2 AND periodo=$3
      AND id_libro='008' AND COALESCE(origen,'')<>'SIRE' ORDER BY r_fecemi,num_asiento`, clave(p));
  return r.rows;
};
return { obtenerComprasSistema };
};
