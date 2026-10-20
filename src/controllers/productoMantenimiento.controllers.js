const pool = require('../db');
const { resolverDocumentoId } = require('../utils/libreria.utils');

function validarRangos(rangos) {
  if (!Array.isArray(rangos) || !rangos.length) return 'Agrega al menos un rango de precios.';
  const unidades = new Set();
  for (const [index, rango] of rangos.entries()) {
    for (const campo of ['unidades', 'cant_min', 'cant_max']) {
      const n = Number(rango[campo]);
      if (!Number.isSafeInteger(n) || n < 1 || n > (campo === 'unidades' ? 2147483647 : 999999999999)) {
        return `Rango ${index + 1}: las cantidades deben ser enteros positivos dentro del límite permitido.`;
      }
    }
    if (Number(rango.cant_min) > Number(rango.cant_max)) return `Rango ${index + 1}: el mínimo supera al máximo.`;
    if (unidades.has(Number(rango.unidades))) return 'No repitas las unidades de referencia del producto.';
    unidades.add(Number(rango.unidades));
    if (!/^\d+(\.\d{1,2})?$/.test(String(rango.precio_venta)) || Number(rango.precio_venta) > 999999999999.99) {
      return `Rango ${index + 1}: ingresa un precio válido con hasta dos decimales.`;
    }
  }
  // El selector de venta actual necesita una referencia de una unidad.
  if (!unidades.has(1)) return 'Incluye un precio con una unidad de referencia para el selector de venta.';
  const ordenados = [...rangos].sort((a, b) => Number(a.cant_min) - Number(b.cant_min));
  let siguiente = 1;
  for (const rango of ordenados) {
    if (Number(rango.cant_min) !== siguiente) return 'Los rangos deben comenzar en 1 y ser consecutivos, sin huecos ni superposiciones.';
    siguiente = Number(rango.cant_max) + 1;
  }
  return '';
}

// Guarda el producto y su escala completa usando una sola conexión/transacción.
const guardarProductoMantenimiento = async (req, res) => {
      //volver a enviar
  let client;
  let transaction = false;
  try {
    const { id_anfitrion, documento_id, id_producto: codigoOriginal } = req.params;
    const { producto = {}, rangos } = req.body;
    const codigo = String(codigoOriginal || producto.id_producto || '').trim();
    const nombre = String(producto.nombre || '').trim();
    if (!codigo || codigo.length > 15 || !nombre || nombre.length > 100) {
      return res.status(400).json({ message: 'Completa código (hasta 15 caracteres) y nombre (hasta 100).' });
    }
    if (String(producto.descripcion || '').length > 300) return res.status(400).json({ message: 'La descripción admite hasta 300 caracteres.' });
    if (!/^\d+(\.\d{1,2})?$/.test(String(producto.precio_venta)) || Number(producto.precio_venta) > 9999999999.99) {
      return res.status(400).json({ message: 'Ingresa un precio de venta válido con hasta dos decimales.' });
    }
    if (producto.porc_igv === '' || !Number.isFinite(Number(producto.porc_igv)) || Number(producto.porc_igv) < 0 || Number(producto.porc_igv) > 100) {
      return res.status(400).json({ message: 'El porcentaje de IGV debe estar entre 0 y 100.' });
    }
    if (!Number.isSafeInteger(Number(producto.cantidad_und2 || 0)) || Number(producto.cantidad_und2 || 0) < 0) {
      return res.status(400).json({ message: 'La cantidad de transformación debe ser un entero mayor o igual que cero.' });
    }
    const documento = await resolverDocumentoId(pool, id_anfitrion, documento_id);
    client = await pool.connect();
    await client.query('BEGIN');
    transaction = true;
    const config = await client.query('SELECT precio_factor FROM mve_parametros WHERE id_usuario = $1 AND documento_id = $2 FOR SHARE', [id_anfitrion, documento]);
    const porCantidad = config.rows[0]?.precio_factor === '1';
    if (porCantidad) {
      const error = validarRangos(rangos);
      if (error) { await client.query('ROLLBACK'); transaction = false; return res.status(400).json({ message: error }); }
    }
    const campos = ['nombre', 'descripcion', 'precio_venta', 'porc_igv', 'cont_und', 'comercial', 'almacenable', 'activado', 'id_clase', 'id_subclase', 'id_producto2', 'cantidad_und2', 'cont_und2'];
    const valores = [nombre.toUpperCase(), String(producto.descripcion || '').trim(), producto.precio_venta,
      producto.porc_igv, producto.cont_und || null, Boolean(producto.comercial), Boolean(producto.almacenable),
      producto.activado !== false, producto.id_clase || null, producto.id_subclase || null,
      producto.id_producto2 || null, producto.cantidad_und2 || 0, producto.cont_und2 || null];
    const keys = [id_anfitrion, documento, codigo];
    let result;
    if (codigoOriginal) {
      result = await client.query(`UPDATE mst_producto SET ${campos.map((campo, i) => `${campo} = $${i + 4}`).join(', ')}
        WHERE id_usuario = $1 AND documento_id = $2 AND id_producto = $3 RETURNING *`, [...keys, ...valores]);
      if (!result.rowCount) { await client.query('ROLLBACK'); transaction = false; return res.status(404).json({ message: 'Producto no encontrado.' }); }
    } else {
      result = await client.query(`INSERT INTO mst_producto (id_usuario, documento_id, id_producto, ${campos.join(', ')}, origen)
        VALUES (${[...keys, ...valores].map((_, i) => `$${i + 1}`).join(', ')}, 'MANUAL') RETURNING *`, [...keys, ...valores]);
    }
    if (porCantidad) {
      // Conservar el origen de los rangos que ya existían.
      const anteriores = await client.query('SELECT unidades, origen FROM mst_producto_precio WHERE id_usuario = $1 AND documento_id = $2 AND id_producto = $3', keys);
      const origenes = new Map(anteriores.rows.map(r => [Number(r.unidades), r.origen]));
      await client.query('DELETE FROM mst_producto_precio WHERE id_usuario = $1 AND documento_id = $2 AND id_producto = $3', keys);
      for (const rango of rangos) {
        await client.query(`INSERT INTO mst_producto_precio (id_usuario, documento_id, id_producto, unidades, precio_venta, cant_min, cant_max, origen)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [...keys, rango.unidades, rango.precio_venta, rango.cant_min, rango.cant_max, origenes.get(Number(rango.unidades)) || 'MANUAL']);
      }
    }
    await client.query('COMMIT');
    transaction = false;
    return res.status(codigoOriginal ? 200 : 201).json(result.rows[0]);
  } catch (error) {
    if (transaction) await client.query('ROLLBACK');
    console.error('Error guardando mantenimiento de producto:', error.message);
    return res.status(error.code === '23505' ? 409 : 500).json({ message: error.code === '23505' ? 'El código del producto ya existe.' : 'No se pudo guardar el producto. No se aplicaron los cambios.' });
  } finally { client?.release(); }
};

module.exports = { guardarProductoMantenimiento };
