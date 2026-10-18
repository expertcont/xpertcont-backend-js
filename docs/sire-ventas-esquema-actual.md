# SIRE Ventas: esquema actual y backend

El backend utiliza la estructura de docs/sql/sire_recrear_cabecera_detalle.sql ya aplicada por el usuario.
No volver a ejecutar ese script de recreacion sobre registros existentes.

- mve_sire_propuesta: una fila por comprobante SUNAT, PK por usuario, empresa, periodo, tipo, serie y numero. Sin elemento ni tabla de productos/detalle.
- mve_sire_propuesta_datos: una fila por ticket, con ZIP/BYTEA original, fecha, cantidad, hash y totales por moneda. Las descargas anteriores conservan su archivo.
- Aceptacion: ticket_propuesta referencia los datos generales. Reemplazo: ticket_actualizacion referencia la descarga posterior. No se consultan id_propuesta ni id_propuesta_actualizada como columnas.
- Se mantienen las rutas y llamadas externas SUNAT. Para compatibilidad con el frontend, id_propuesta en el JSON contiene el ticket; id_propuesta_actualizada tambien contiene el ticket una vez ACTUALIZADO. No son IDs numericos en la base.
- Ticket nuevo: se conserva en mct_contabilidadticket y se registra en *_datos aun antes de descargar. El ticket de actualizacion del reemplazo se registra junto con sus datos generales.
- Una importacion valida reemplaza atomicamente los comprobantes vigentes del periodo y conserva los datos generales y archivos anteriores. Un ticket desactualizado o un archivo distinto para el mismo ticket se rechaza. Repetir la descarga no duplica comprobantes.
- La recuperacion y aceptacion respetan el ticket vigente de mct_contabilidadticket. El archivo original guardado puede descargarse sin volver a SUNAT.
- Factura del sistema: identidad principal. Nota directa 07/08: identidad principal y referencia al original. Nota guardada como ajuste de factura: identidad de los campos de referencia. Comercial conserva la fecha del movimiento en r_fecemi; r_fecemi_ref identifica la fecha del comprobante original. Transporte mantiene su mapeo de fechas. elemento solo distingue movimientos internos.
- El registro y la comparacion resuelven mad_usuario.rubro del anfitrion: Comercial lee mve_venta (r_base002, r_base003, r_base004 y r_igv002); Transporte lee mve_transventa. No se mezclan sus tablas ni se exige RDI de Transporte para Comercial.
- Los correlativos numericos se comparan sin ceros iniciales, conservando su texto original para mostrarlo. Los datos generales de SUNAT se recuperan por empresa, periodo y ticket, sin descartarlos por una etiqueta de rubro antigua.
- Notas de credito comparan importes negativos; notas de debito positivos; anulados comparan cero. La generacion de reemplazo usa la misma identidad y fechas.
- Se conserva el bloqueo de presentacion, estados inciertos e idempotencia de aceptacion/reemplazo. No se envia nada a SUNAT durante la validacion local.

scripts/migrar-sire-transporte.js ahora verifica el esquema sin modificarlo; --aplicar se rechaza para evitar reinstalar los SQL antiguos.
La validacion basica tests/sire-ventas-esquema.pg.test.js paso usando PostgreSQL temporal y SUNAT simulado: guardado, comparacion de factura y notas directas/en referencias, aceptacion sin reenvio, preparacion de reemplazo, actualizacion por ticket, recuperacion de archivo anterior e aislamiento entre empresas. No se uso Railway ni se invoco SUNAT real.

Tambien se verifico Comercial con ceros iniciales en mve_venta y mve_transventa vacia: los mismos documentos coinciden y una diferencia real de importe sigue apareciendo.

Compras sigue pendiente de adaptar; no forma parte de esta entrega de backend de Ventas.
