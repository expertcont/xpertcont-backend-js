// Solo se publican campos seleccionados; nunca el cuerpo OAuth ni el JWT.
const limpiar = (valor, secretos = []) => {
  let texto = String(valor ?? '');
  for (const secreto of secretos.filter(Boolean).sort((a, b) => b.length - a.length)) {
    texto = texto.split(String(secreto)).join('[OCULTO]');
  }
  return texto.replace(/Bearer\s+\S+/gi, 'Bearer [OCULTO]')
    .replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[TOKEN OCULTO]')
    .replace(/[\r\n\t]/g, ' ').slice(0, 400);
};

const resumirRespuesta = (data, secretos = []) => {
  const errores = Array.isArray(data?.errors) ? data.errors.slice(0, 5) : [];
  return {
    codigoSunat: limpiar(data?.codError || data?.cod || data?.error || errores[0]?.codError, secretos),
    mensajeSunat: limpiar(data?.error_description || data?.msg || data?.message || data?.desError
      || errores.map(e => e.desError || e.msg).filter(Boolean).join(' '), secretos),
  };
};

const registrar = (contexto, etapa, resultado, datos = {}) => {
  console.log('[SUNAT CPE diagnostico]', JSON.stringify({ ...contexto, etapa, resultado, ...datos }));
};

module.exports = { resumirRespuesta, registrar };
