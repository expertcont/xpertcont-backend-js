// El elemento pertenece al movimiento interno. SIRE identifica la factura o nota por su propia clave.
const texto = v => String(v ?? '').trim();
const identidadVenta = v => {
  const principalNota = ['07','08'].includes(texto(v.r_cod));
  const notaReferencia = !principalNota && ['07','08'].includes(texto(v.r_cod_ref));
  return { principalNota, notaReferencia,
    tipo: texto(notaReferencia ? v.r_cod_ref : v.r_cod),
    serie: texto(notaReferencia ? v.r_serie_ref : v.r_serie),
    numero: texto(notaReferencia ? v.r_numero_ref : v.r_numero),
    fecha: notaReferencia ? v.r_fecemi_ref : v.r_fecemi,
    fechaOriginal: principalNota ? v.r_fecemi_ref : v.r_fecemi,
  };
};
const expresionesVenta = (a='tv') => {
  const nota = `(${a}.r_cod NOT IN ('07','08') AND ${a}.r_cod_ref IN ('07','08'))`;
  const elegir = (principal,referencia) => `(CASE WHEN ${nota} THEN ${a}.${referencia} ELSE ${a}.${principal} END)`;
  return { tipo:elegir('r_cod','r_cod_ref'),serie:elegir('r_serie','r_serie_ref'),numero:elegir('r_numero','r_numero_ref'),fecha:elegir('r_fecemi','r_fecemi_ref') };
};
module.exports = { identidadVenta, expresionesVenta };
