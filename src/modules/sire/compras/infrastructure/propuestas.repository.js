module.exports=pool=>{const r=require('./detalle.repository')(pool);return {obtenerPropuesta:r.obtenerPropuesta,guardarPropuesta:r.guardarPropuesta,obtenerArchivo:r.obtenerArchivo};};
