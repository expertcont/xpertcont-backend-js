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

// Decodificar permite inspeccionar declaraciones, no verifica la firma ni permisos efectivos.
// No devolver userdata, tickets SOL, cookies, clientId ni el token original.
const resumirToken = (token, rucEmpresa, ahora = Date.now()) => {
  let jwt;
  try {
    jwt = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    if (!jwt || typeof jwt !== 'object' || Array.isArray(jwt)) throw new Error('JWT invalido');
  } catch {
    return { jwtDecodificable: false };
  }
  let audiencia = jwt.aud;
  if (typeof audiencia === 'string') {
    try { audiencia = JSON.parse(audiencia); } catch { audiencia = null; }
  }
  const audienciaInterpretable = Array.isArray(audiencia);
  const recursosCpe = audienciaInterpretable ? audiencia
    .filter(a => a?.api === 'https://api-cpe.sunat.gob.pe')
    .flatMap(a => Array.isArray(a.recurso) ? a.recurso : [])
    .filter(r => typeof r?.id === 'string')
    .slice(0, 50)
    .map(r => ({ id: limpiar(r.id), indicador: limpiar(r.indicador), gt: limpiar(r.gt) })) : [];
  const segundosAhora = Math.floor(ahora / 1000);
  const fecha = valor => typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
  const expiracion = fecha(jwt.exp);
  const emision = fecha(jwt.iat);
  const validoDesde = fecha(jwt.nbf);
  const ruc = [jwt.sub, jwt.userdata?.numRUC].find(v => typeof v === 'string' && /^\d{11}$/.test(v));
  let emisorHost = null;
  try { emisorHost = new URL(jwt.iss).hostname; } catch { /* Emisor ausente o no interpretable. */ }
  return {
    jwtDecodificable: true,
    grantType: typeof jwt.grantType === 'string' ? limpiar(jwt.grantType) : null,
    emisorHost,
    rucTokenCoincide: ruc ? ruc === String(rucEmpresa) : null,
    emision, validoDesde, expiracion,
    segundosRestantes: expiracion === null ? null : expiracion - segundosAhora,
    tokenVencido: expiracion === null ? null : expiracion <= segundosAhora,
    tokenAunNoVigente: validoDesde === null ? null : validoDesde > segundosAhora,
    audienciaInterpretable,
    consultacpeDeclarado: audienciaInterpretable ? recursosCpe.some(r =>
      r.id === '/v1/contribuyente/consultacpe' && r.indicador === '1') : null,
    recursosCpe,
  };
};

module.exports = { resumirRespuesta, registrar, resumirToken };
