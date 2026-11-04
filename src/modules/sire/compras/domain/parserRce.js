const { decimal } = require('./decimal');
// Parser del TXT/CSV de propuesta RCE descargado de SUNAT.
//
// Mapa estructural (separador |):
//   0 RUC | 1 razón social | 2 período | 3 CAR | 4 fecha emisión | 5 vencimiento
//   6 tipo CPE | 7 serie | 8 año DAM | 9 número | 10 número final
//   11 tipo doc. proveedor | 12 doc. proveedor | 13 proveedor
//   14..24 bases/IGV/total | 25 moneda | 26 tipo cambio
//   27..32 documento de referencia | 33..n columnas adicionales SUNAT
//
// Flujo: leer líneas -> validar cabecera -> validar RUC/período/fila ->
// validar identificación del comprobante -> convertir a objeto Xpertcont.
const COLUMNA = Object.freeze({
  RUC: 0,
  PERIODO: 2,
  CAR: 3,
  FECHA_EMISION: 4,
  FECHA_VENCIMIENTO: 5,
  TIPO_COMPROBANTE: 6,
  SERIE: 7,
  ANO_DAM: 8,
  NUMERO: 9,
  NUMERO_FINAL: 10,
  TIPO_DOCUMENTO_PROVEEDOR: 11,
  DOCUMENTO_PROVEEDOR: 12,
  PROVEEDOR: 13,
  PRIMER_MONTO: 14,
  TOTAL: 24,
  MONEDA: 25,
  TIPO_CAMBIO: 26,
  FECHA_REFERENCIA: 27,
  TIPO_REFERENCIA: 28,
  SERIE_REFERENCIA: 29,
  DAM_REFERENCIA: 30,
  NUMERO_REFERENCIA: 31,
  CLASIFICACION: 32,
  PRIMER_ADICIONAL: 33,
});

const fallo = message => Object.assign(new Error(message), { statusCode: 422 });
// La cabecera puede cambiar tildes, espacios o mayúsculas; se compara normalizada.
const normalizar = valor => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');
// Convierte DD/MM/AAAA de SUNAT a AAAA-MM-DD y valida fechas inexistentes.
function fecha(valor) {
  if (!valor) return '';

  const partes = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!partes) throw fallo('La propuesta contiene una fecha invalida.');

  const iso = `${partes[3]}-${partes[2]}-${partes[1]}`;
  const fechaUtc = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(fechaUtc.getTime()) || fechaUtc.toISOString().slice(0, 10) !== iso) {
    throw fallo('La propuesta contiene una fecha invalida.');
  }
  return iso;
}

function encabezadoValido(cabecera) {
  const requeridas = {
    0: 'ruc', 2: 'periodo', 3: 'carsunat', 4: 'fechadeemision',
    14: 'bigravadodg', 15: 'igvipmdg', 16: 'bigravadodgng',
    17: 'igvipmdgng', 18: 'bigravadodng', 19: 'igvipmdng',
    20: 'valoradqng', 24: 'totalcp', 25: 'moneda',
  };
  return cabecera.length >= 33
    && Object.entries(requeridas).every(([indice, nombre]) => normalizar(cabecera[indice]) === nombre);
}

function camposFaltantes(fila) {
  const faltantes = [];
  if (!/^\d{2}$/.test(fila[COLUMNA.TIPO_COMPROBANTE])) faltantes.push('tipo de comprobante');
  if (!fila[COLUMNA.NUMERO]) faltantes.push('número de comprobante');
  if (!fila[COLUMNA.DOCUMENTO_PROVEEDOR]) faltantes.push('documento del proveedor');
  return faltantes;
}

function parsearTextoCompras({ contenido, documentoId, periodo }) {
 // Quita BOM UTF-8, conserva la posición real de la línea y descarta líneas vacías.
 const lineas = contenido.replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .map((texto, indice) => ({ texto, indice }))
  .filter(linea => linea.texto.trim());
 // Primera línea: cabecera. Solo se fijan posiciones tributarias críticas;
 // las columnas posteriores se guardan como datos_adicionales.
 const cabecera = lineas[0]?.texto.split('|').map(valor => valor.trim()) || [];
 if (!encabezadoValido(cabecera)) {
  throw fallo('No se reconoce la cabecera de la propuesta RCE. Verifica su version y columnas tributarias.');
 }
 // Correspondencia exacta de posiciones 14..24 en la propuesta RCE de SUNAT.
 const montos = ['base001', 'igv001', 'base002', 'igv002', 'base003', 'igv003',
  'base004', 'isc', 'icbp', 'otros', 'total'];

 return lineas.slice(1).map(({ texto, indice }) => {
  const fila = texto.split('|').map(valor => valor.trim());
  // No permitir importar otra empresa/período ni filas que no respeten la cabecera.
  if (fila.length !== cabecera.length
    || fila[COLUMNA.RUC] !== documentoId
    || fila[COLUMNA.PERIODO].replace(/-/g, '') !== periodo.replace(/-/g, '')) {
   throw fallo(`La linea ${indice + 1} no corresponde al RUC, periodo o formato RCE seleccionado.`);
  }
  // Estos tres datos permiten identificar y conciliar una compra. No se omite
  // una fila inválida: sería más peligroso perder una compra silenciosamente.
  const faltantes = camposFaltantes(fila);
  if (faltantes.length) {
   throw fallo(`La línea ${indice + 1} de la propuesta SUNAT no identifica un comprobante de compra: falta ${faltantes.join(', ')}.`);
  }
  // Mapea las posiciones fijas al modelo interno y conserva la línea original.
  // Las columnas que SUNAT agregue desde la 34 se preservan sin afectar el parseo.
  const compra = {
   linea: indice + 1,
   car_sunat: fila[COLUMNA.CAR],
   fecha_emision: fecha(fila[COLUMNA.FECHA_EMISION]),
   fecha_vencimiento: fecha(fila[COLUMNA.FECHA_VENCIMIENTO]),
   tipo_comprobante: fila[COLUMNA.TIPO_COMPROBANTE],
   serie: fila[COLUMNA.SERIE],
   ano_dam: fila[COLUMNA.ANO_DAM],
   numero: fila[COLUMNA.NUMERO],
   numero_final: fila[COLUMNA.NUMERO_FINAL],
   tipo_doc_proveedor: fila[COLUMNA.TIPO_DOCUMENTO_PROVEEDOR],
   documento_proveedor: fila[COLUMNA.DOCUMENTO_PROVEEDOR],
   proveedor: fila[COLUMNA.PROVEEDOR],
   moneda: fila[COLUMNA.MONEDA] || 'PEN',
   tipo_cambio: decimal(fila[COLUMNA.TIPO_CAMBIO], 6),
   fecha_emision_ref: fecha(fila[COLUMNA.FECHA_REFERENCIA]),
   tipo_comprobante_ref: fila[COLUMNA.TIPO_REFERENCIA],
   serie_ref: fila[COLUMNA.SERIE_REFERENCIA],
   codigo_dam_dsi_ref: fila[COLUMNA.DAM_REFERENCIA],
   numero_ref: fila[COLUMNA.NUMERO_REFERENCIA],
   clasificacion_bienes_servicios: fila[COLUMNA.CLASIFICACION],
   raw_linea: texto,
   datos_adicionales: Object.fromEntries(cabecera.slice(COLUMNA.PRIMER_ADICIONAL)
    .map((nombre, offset) => [`${offset + COLUMNA.PRIMER_ADICIONAL + 1}:${nombre}`, fila[offset + COLUMNA.PRIMER_ADICIONAL]])),
  };
  // Convierte importes de SUNAT a números con precisión decimal tributaria.
  montos.forEach((campo, offset) => {
   compra[campo] = decimal(fila[COLUMNA.PRIMER_MONTO + offset]);
  });
  return compra;
 });
}
module.exports = { parsearTextoCompras };
