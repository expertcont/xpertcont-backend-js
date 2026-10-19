// La estructura de Compras ya no utiliza tablas de detalle. No modifica la BD.
console.error('Este migrador pertenece al esquema anterior. Usa mco_sire_propuesta y mco_sire_propuesta_datos; no vuelvas a ejecutar la recreacion sobre datos existentes.');
process.exitCode=1;
