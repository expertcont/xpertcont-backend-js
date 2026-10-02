// Capa de acceso a datos del flujo de encomiendas en agencia destino.
//
// Aqui vive el SQL y el pool. No conoce handlers HTTP ni reglas de negocio:
// solo ejecuta y devuelve filas.
//
// Se conservo exactamente el SQL que vivia en el controller historico. El unico
// cambio es que cada consulta recibe sus argumentos por nombre y arma el array de
// parametros aqui, para que el orden de los $1..$N quede a la vista y no dependa
// de como lo llame el service.
const pool = require('../../db');
const { columnasVentaTrans } = require('../transventaColumnas');

// ---------------------------------------------------------------------------
// Bandeja operativa de la agencia destino.
//
// El UNION por periodos se armaba en el controller con un map sobre los periodos
// buscados. Se mantiene igual, sin reescribirlo: mismos filtros, mismo orden y
// mismos limites.
// ---------------------------------------------------------------------------
const listarEncomiendasAgenciaQuery = async ({
  periodos,
  idAnfitrion,
  documentoId,
  idPuntoVentaDest,
  limite,
  entregadas,
}) => {
  const idUsuarioParam = periodos.length + 1;
  const documentoParam = periodos.length + 2;
  const puntoVentaDestParam = periodos.length + 3;
  const limiteParam = periodos.length + 4;

  const joinRutaEntrega = `
      LEFT JOIN (
        SELECT id_usuario AS ruta_id_usuario,
               documento_id AS ruta_documento_id,
               id_ruta AS ruta_id_ruta,
               nombre AS nombre_ruta
          FROM mve_transruta
      ) ruta
        ON ruta.ruta_id_usuario = venta.id_usuario
       AND ruta.ruta_documento_id = venta.documento_id
       AND ruta.ruta_id_ruta = venta.id_ruta
    `;

  const selectsPorPeriodo = periodos.map((_, index) => `
      SELECT ${columnasVentaTrans},
             ruta.nombre_ruta,
             venta.periodo AS periodo_origen
        FROM mve_transventa venta
        ${joinRutaEntrega}
       WHERE venta.periodo = $${index + 1}
         AND venta.id_usuario = $${idUsuarioParam}
         AND venta.documento_id = $${documentoParam}
         AND venta.id_punto_venta_dest = $${puntoVentaDestParam}
         AND venta.tipo_operacion = 'E'
         AND COALESCE(venta.registrado, 1) = 1
         AND venta.entrega_fecha IS ${entregadas ? 'NOT NULL' : 'NULL'}
    `).join(' UNION ALL ');

  const query = `
      SELECT *
        FROM (
          ${selectsPorPeriodo}
        ) encomiendas
       ORDER BY ${entregadas ? 'entrega_fecha DESC,' : ''} r_fecemi DESC, r_serie, r_numero DESC, elemento
       LIMIT $${limiteParam}
    `;

  const params = [
    ...periodos,
    idAnfitrion,
    documentoId,
    idPuntoVentaDest,
    limite,
  ];

  const result = await pool.query(query, params);
  return result.rows;
};

// ---------------------------------------------------------------------------
// Entrega al cliente. Aplica la regla de la contrasena de entrega en el propio
// WHERE, tal como estaba antes.
// ---------------------------------------------------------------------------
const registrarEntregaQuery = async ({
  periodo,
  idUsuario,
  documentoId,
  rCod,
  rSerie,
  rNumero,
  elemento,
  entregaDocumentoId,
  entregaNombres,
  entregaCtrlUs,
  entregaContra,
}) => {
  const result = await pool.query(
    `
      UPDATE mve_transventa
         SET entrega_fecha = (now() AT TIME ZONE 'America/Lima')::timestamp(5),
             entrega_documento_id = COALESCE($8, entrega_documento_id),
             entrega_nombres = COALESCE($9, entrega_nombres),
             entrega_ctrl_us = $10,
             ctrl_mod = (now() AT TIME ZONE 'America/Lima')::timestamp(5),
             ctrl_mod_us = $10
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND tipo_operacion = 'E'
         AND entrega_fecha IS NULL
         AND (COALESCE(contra, '') = '' OR UPPER(contra) = $11)
       RETURNING ${columnasVentaTrans}
    `,
    [
      periodo,
      idUsuario,
      documentoId,
      rCod,
      rSerie,
      rNumero,
      elemento,
      entregaDocumentoId,
      entregaNombres,
      entregaCtrlUs,
      entregaContra,
    ]
  );
  return result.rows;
};

// Segunda consulta: distingue "contrasena incorrecta" de "no encontrada".
// Se conserva porque el frontend depende del 409 contra el 404.
const comprobarContraActivaQuery = async ({
  periodo,
  idUsuario,
  documentoId,
  rCod,
  rSerie,
  rNumero,
  elemento,
}) => {
  const result = await pool.query(
    `
        SELECT 1
          FROM mve_transventa
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
           AND tipo_operacion = 'E'
           AND entrega_fecha IS NULL
           AND COALESCE(contra, '') <> ''
         LIMIT 1
      `,
    [
      periodo,
      idUsuario,
      documentoId,
      rCod,
      rSerie,
      rNumero,
      elemento,
    ]
  );
  return result.rows;
};

// ---------------------------------------------------------------------------
// Permiso para liberar la contrasena: anfitrion, super o supervisor.
// ---------------------------------------------------------------------------
const consultarPermisoLiberacionQuery = async ({ idUsuario, idInvitado }) => {
  const result = await pool.query(
    `
        SELECT
          ($1 = $2) AS es_anfitrion,
          EXISTS (
            SELECT 1
              FROM public.mad_usuario mu
             WHERE mu.id_usuario = $2
               AND mu.super = '1'
          ) AS es_super,
          EXISTS (
            SELECT 1
              FROM public.mad_usuarioinvitado ui
             WHERE ui.id_usuario = $1
               AND ui.id_invitado = $2
               AND COALESCE(ui.activo, '1') <> '0'
               AND UPPER(COALESCE(NULLIF(TRIM(ui.supervisor), ''), '0')) IN ('1', 'S', 'SI', 'TRUE')
          ) AS es_supervisor
      `,
    [idUsuario, idInvitado]
  );
  return result.rows[0] || {};
};

const liberarContraQuery = async ({
  periodo,
  idUsuario,
  documentoId,
  rCod,
  rSerie,
  rNumero,
  elemento,
  ctrlModUs,
}) => {
  const result = await pool.query(
    `
        UPDATE mve_transventa
           SET contra = NULL,
               ctrl_mod = CURRENT_TIMESTAMP,
               ctrl_mod_us = COALESCE($8, ctrl_mod_us)
         WHERE periodo = $1
           AND id_usuario = $2
           AND documento_id = $3
           AND r_cod = $4
           AND r_serie = $5
           AND r_numero = $6
           AND elemento = $7
           AND tipo_operacion = 'E'
           AND entrega_fecha IS NULL
           AND COALESCE(contra, '') <> ''
         RETURNING ${columnasVentaTrans}
      `,
    [
      periodo,
      idUsuario,
      documentoId,
      rCod,
      rSerie,
      rNumero,
      elemento,
      ctrlModUs,
    ]
  );
  return result.rows;
};

// ---------------------------------------------------------------------------
// Llegada fisica a la agencia destino. No toca la entrega: son dos eventos
// distintos y el paquete puede quedarse dias esperando el recojo.
// ---------------------------------------------------------------------------
const registrarLlegadaRealQuery = async ({
  periodo,
  idUsuario,
  documentoId,
  rCod,
  rSerie,
  rNumero,
  elemento,
  ctrlModUs,
}) => {
  const result = await pool.query(
    `
      UPDATE mve_transventa
         SET llegada_real = (now() AT TIME ZONE 'America/Lima')::timestamp(5),
             ctrl_mod = (now() AT TIME ZONE 'America/Lima')::timestamp(5),
             ctrl_mod_us = COALESCE($8, ctrl_mod_us)
       WHERE periodo = $1
         AND id_usuario = $2
         AND documento_id = $3
         AND r_cod = $4
         AND r_serie = $5
         AND r_numero = $6
         AND elemento = $7
         AND tipo_operacion = 'E'
         AND llegada_real IS NULL
       RETURNING ${columnasVentaTrans}
    `,
    [
      periodo,
      idUsuario,
      documentoId,
      rCod,
      rSerie,
      rNumero,
      elemento,
      ctrlModUs,
    ]
  );
  return result.rows;
};

module.exports = {
  listarEncomiendasAgenciaQuery,
  registrarEntregaQuery,
  comprobarContraActivaQuery,
  consultarPermisoLiberacionQuery,
  liberarContraQuery,
  registrarLlegadaRealQuery,
};
