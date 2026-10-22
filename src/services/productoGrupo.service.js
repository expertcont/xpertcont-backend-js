/**
 * Reglas de Grupos Color: resolver empresa, comprobar comercial/SKU y validar.
 * Recibe datos simples y devuelve registros; no depende de req/res de Express.
 */
const repository = require('../repositories/productoGrupo.repository');

// Límites del DDL, aplicados también a llamadas directas al API.
const LIMITES = Object.freeze({ codigo: 15, nombre: 100, descripcion: 300, usuario: 50 });
const MENSAJE_NO_ENCONTRADO = 'Grupo de producto no encontrado.';

/** Error esperado cuyo mensaje puede exponerse al cliente desde el controlador. */
class ProductoGrupoError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ProductoGrupoError';
    this.status = status;
  }
}

/** Parámetros y grupos utilizan el mismo documento efectivo, incluida la matriz. */
async function obtenerContexto(idAnfitrion, documentoId) {
  if (!idAnfitrion || !documentoId) {
    throw new ProductoGrupoError(400, 'Indica el usuario y la empresa.');
  }

  const documento = await repository.resolverDocumento(idAnfitrion, documentoId);
  const contexto = { id_anfitrion: idAnfitrion, documento };
  const config = await repository.obtenerConfiguracion(contexto);
  const habilitado = String(config?.rubro || '').trim().toUpperCase() === 'COMERCIAL'
    && config?.producto_sku === '1';

  return { ...contexto, habilitado };
}

async function validarAcceso(idAnfitrion, documentoId) {
  const { id_anfitrion, documento, habilitado } = await obtenerContexto(idAnfitrion, documentoId);
  if (!habilitado) {
    throw new ProductoGrupoError(403, 'Los grupos requieren rubro comercial y la opción SKU activada.');
  }

  return { id_anfitrion, documento };
}

function normalizarGrupo(datos, codigo, idAnfitrion) {
  const grupo = {
    codigo: String(codigo || '').trim(),
    nombre: String(datos.nombre || '').trim(),
    descripcion: String(datos.descripcion || '').trim(),
    // Conserva el contrato actual: el cliente informa el operador de auditoría.
    usuario: String(datos.ctrl_mod_us || datos.ctrl_crea_us || idAnfitrion).trim(),
  };
  const superaLimite = Object.entries(LIMITES).some(([campo, limite]) => grupo[campo].length > limite);
  if (!grupo.codigo || !grupo.nombre || superaLimite) {
    throw new ProductoGrupoError(400, 'Completa código (máximo 15), nombre (máximo 100) y descripción (máximo 300 caracteres).');
  }

  return { ...grupo, nombre: grupo.nombre.toUpperCase() };
}

const listar = contexto => repository.listar(contexto);

/** En edición, el código de la URL prevalece: el body no renombra la clave. */
async function guardar(contexto, datos = {}, { editar = false, codigoOriginal } = {}) {
  const grupo = normalizarGrupo(datos, editar ? codigoOriginal : datos.id_grupo, contexto.id_anfitrion);

  try {
    const guardado = editar
      ? await repository.actualizar(contexto, grupo)
      : await repository.crear(contexto, grupo);

    if (!guardado) throw new ProductoGrupoError(404, MENSAJE_NO_ENCONTRADO);
    return guardado;
  } catch (error) {
    // Traducir solo conflictos esperados; los fallos técnicos conservan su causa.
    if (error.code === '23505') {
      throw new ProductoGrupoError(409, 'El código de grupo ya existe.');
    }
    throw error;
  }
}

async function eliminar(contexto, codigo) {
  try {
    const eliminado = await repository.eliminar(contexto, codigo);
    if (!eliminado) throw new ProductoGrupoError(404, MENSAJE_NO_ENCONTRADO);
  } catch (error) {
    // Se respetan las claves foráneas existentes, sin borrados en cascada.
    if (error.code === '23503') {
      throw new ProductoGrupoError(409, 'No se puede eliminar un grupo que está en uso.');
    }
    throw error;
  }
}

module.exports = { ProductoGrupoError, obtenerContexto, validarAcceso, listar, guardar, eliminar };
