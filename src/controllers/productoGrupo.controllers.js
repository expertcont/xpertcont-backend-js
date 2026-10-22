/**
 * Adaptador HTTP de Grupos Color.
 * Estructura: rutas -> controlador/middleware -> servicio -> repositorio -> PostgreSQL.
 * Este archivo interpreta req/res y traduce errores. El servicio concentra las
 * reglas comercial/SKU y las validaciones; el repositorio contiene el SQL.
 * Las rutas y los controladores históricos de grupos conservan su implementación.
 */
const grupos = require('../services/productoGrupo.service');

// 1. BORDE HTTP: un único manejo de errores para todos los handlers del módulo.
// No se usa el middleware global, que actualmente no asigna un estado de error.
function responderError(res, error) {
  if (error instanceof grupos.ProductoGrupoError) {
    return res.status(error.status).json({ message: error.message });
  }

  console.error('Error en mantenimiento de grupos:', error.message);
  return res.status(500).json({ message: 'No se pudo completar la operación de grupos.' });
}

function atender(handler) {
  return async (req, res, next) => {
    try {
      return await handler(req, res, next);
    } catch (error) {
      return responderError(res, error);
    }
  };
}

// 2. CONFIGURACIÓN Y ACCESO: preparar una empresa efectiva por petición.
// La comprobación de comercial/SKU no sustituye la autenticación de la aplicación.
const obtenerConfiguracionGrupos = atender(async (req, res) => {
  const { id_anfitrion, documento_id } = req.params;
  const { habilitado } = await grupos.obtenerContexto(id_anfitrion, documento_id);
  return res.json({ habilitado });
});

const validarAccesoGrupos = atender(async (req, res, next) => {
  const { id_anfitrion, documento_id } = req.params;
  req.grupoContexto = await grupos.validarAcceso(id_anfitrion, documento_id);
  return next();
});

// 3. OPERACIONES: contexto ya validado y contrato HTTP original.
const obtenerGrupos = atender(async (req, res) => {
  const registros = await grupos.listar(req.grupoContexto);
  return res.json(registros);
});

const guardarGrupo = atender(async (req, res) => {
  const editar = req.method === 'PUT';
  const guardado = await grupos.guardar(req.grupoContexto, req.body || {}, {
    editar,
    codigoOriginal: req.params.id_grupo,
  });
  return res.status(editar ? 200 : 201).json(guardado);
});

const eliminarGrupo = atender(async (req, res) => {
  await grupos.eliminar(req.grupoContexto, req.params.id_grupo);
  return res.sendStatus(204);
});

module.exports = {
  obtenerConfiguracionGrupos,
  validarAccesoGrupos,
  obtenerGrupos,
  guardarGrupo,
  eliminarGrupo,
};
