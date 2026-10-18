module.exports = (service) => {
const handler = (accion) => async (req, res) => {
  try {
    const result = await service[accion]({ ...req.query, ...req.body, ...req.params, usuario_ajuste: req.user?.email || req.auth?.payload?.email || null });
    if (accion === 'descargar') {
      const nombre = String(result.nombre_archivo || 'propuesta_compras.zip').split(/[\\/]/).pop().replace(/[^A-Za-z0-9_.-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      res.setHeader('Content-Type', nombre.toLowerCase().endsWith('.zip') ? 'application/zip' : 'text/plain; charset=utf-8');
      return res.send(result.archivo);
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('Error SIRE Compras:', error.message);
    return res.status(status).json({ success: false, message: (error.codigo === 'SIRE_RESPUESTA_NO_JSON' || error.codigo === 'SIRE_PERSONALIZADA_MIGRACION')
      ? error.mensajePublico : status >= 500
      ? 'No se pudo completar la consulta de SIRE Compras. Revisa la configuracion del servicio y vuelve a intentar.' : error.message });
  }
};
return { ...Object.fromEntries(['listarPersonalizada','importarPersonalizada','crearPersonalizada','editarPersonalizada','eliminarPersonalizada','revisarConciliacion','confirmarConciliacion'].map(accion => [accion, handler(accion)])), recuperar: handler('recuperar'), generarTicket: handler('generarTicket'), consultar: handler('consultar'), descargar: handler('descargar') };

};
