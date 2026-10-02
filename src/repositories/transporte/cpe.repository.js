// SQL del envio individual de CPE de encomienda.
//
// Las cuatro consultas de este modulo viven aqui: datos de la contabilidad, la
// operacion con su ruta, y las dos actualizaciones que guardan el resultado de
// SUNAT (cdr_descripcion en el rechazo, r_vfirmado + cdr_descripcion en el
// exito). Cada funcion arma internamente su arreglo de parametros para que el
// orden $1..$N quede explicito junto al SQL que lo consume.
//
// El SQL se copio caracter por caracter del controller legacy: el string de cada
// consulta es identico al que se enviaba antes.
const pool = require('../../db');

// Datos de la empresa que envia. El service lanza 'CONTABILIDAD NO ENCONTRADA'
// si no hay fila.
const obtenerDatosContabilidad = async ({ idUsuario, documentoId }) => {
  const query = `
    SELECT *
      FROM mad_usuariocontabilidad
     WHERE id_usuario = $1
       AND documento_id = $2
       AND tipo = 'ADMIN'
    `;

  const result = await pool.query(query, [idUsuario, documentoId]);

  return result.rows[0];
};

// La encomienda a enviar, con el nombre de su ruta.
const obtenerEncomiendaParaCpe = async ({ periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento }) => {
  const query = `
    SELECT tv.*,
           ruta.nombre AS nombre_ruta
      FROM mve_transventa tv
      LEFT JOIN mve_transruta ruta
        ON ruta.id_usuario = tv.id_usuario
       AND ruta.documento_id = tv.documento_id
       AND ruta.id_ruta = tv.id_ruta
     WHERE tv.periodo = $1
       AND tv.id_usuario = $2
       AND tv.documento_id = $3
       AND tv.r_cod = $4
       AND tv.r_serie = $5
       AND tv.r_numero = $6
       AND tv.elemento = $7
    `;

  const result = await pool.query(query, [periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento]);

  return result.rows[0];
};

// Guarda el motivo del rechazo de SUNAT. No toca r_vfirmado.
const actualizarCdrDescripcionSunat = async ({
  periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento,
  cdrDescripcion, ctrlModUs,
}) => {
  const query = `
        UPDATE mve_transventa
           SET cdr_descripcion = $8,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($9, ctrl_mod_us)
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
        `;

  const params = [
        periodo,
        idUsuario,
        documentoId,
        rCod,
        rSerie,
        rNumero,
        elemento,
    cdrDescripcion,
    ctrlModUs
  ];

  await pool.query(query, params);
};

// Guarda la firma aceptada por SUNAT y su CDR. Solo se invoca cuando la
// contabilidad opera en modo externo (empresa.modo === '1').
const actualizarFirmaSunat = async ({
  periodo, idUsuario, documentoId, rCod, rSerie, rNumero, elemento,
  codigoHash, cdrDescripcion, ctrlModUs,
}) => {
  const query = `
        UPDATE mve_transventa
           SET r_vfirmado = COALESCE($8, r_vfirmado),
               cdr_descripcion = $9,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($10, ctrl_mod_us)
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
        `;

  const params = [
        periodo,
        idUsuario,
        documentoId,
        rCod,
        rSerie,
        rNumero,
        elemento,
    codigoHash,
    cdrDescripcion,
    ctrlModUs
  ];

  await pool.query(query, params);
};

module.exports = {
  obtenerDatosContabilidad,
  obtenerEncomiendaParaCpe,
  actualizarCdrDescripcionSunat,
  actualizarFirmaSunat,
};
