const pool = require('../../db');

// El rubro pertenece al anfitrion, no a quien abre la pantalla como invitado.
const obtenerFuenteVentas = async (p, db = pool) => {
  const r = await db.query('SELECT rubro FROM public.mad_usuario WHERE id_usuario=$1::text LIMIT 1', [p.idAnfitrion]);
  const rubro = String(r.rows[0]?.rubro || 'COMERCIAL').trim().toUpperCase();
  if (['TRANSPORTE', 'TRANSPORTES'].includes(rubro)) return {
    rubro: 'TRANSPORTE',
    tabla: '(SELECT v.*,0::numeric AS r_inafecto FROM public.mve_transventa v)',
    filtro: "tv.tipo_operacion IN ('B', 'E')",
    rdi: 'public.mve_rdi_sunat',
  };
  // Adaptar las columnas de Comercial al contrato de lectura SIRE, sin tocar sus registros.
  return {
    rubro: 'COMERCIAL',
    tabla: `(SELECT v.*,'COMERCIAL'::text AS sire_rubro,
      v.r_base002 AS r_gravado,v.r_base003 AS r_exonerado,v.r_base004 AS r_inafecto,
      v.r_igv002 AS r_igv,NULL::numeric AS precio_neto,'COMERCIAL'::text AS tipo_operacion,
      v.r_id_doc AS cliente_id_doc,v.r_documento_id AS cliente_documento_id,v.r_razon_social AS cliente,
      COALESCE(NULLIF(to_jsonb(v)->>'estado_sunat',''),v.estado) AS estado_sunat
      FROM public.mve_venta v)`,
    filtro: 'TRUE',
    // Comercial no depende de la tabla de resumenes diarios de Transporte.
    rdi: `(SELECT NULL::text AS id_usuario,NULL::text AS documento_id,NULL::text AS numero_rdi,
      NULL::text AS ticket,NULL::text AS estado,NULL::text AS respuesta_codigo,NULL::text AS respuesta_desc WHERE FALSE)`,
  };
};

module.exports = { obtenerFuenteVentas };
