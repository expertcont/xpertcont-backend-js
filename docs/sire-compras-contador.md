# SIRE Compras: trabajo del contador

La pantalla conserva el diseño y filtros de SIRE. Abre en **Compras por declarar**, donde el contador agrega, modifica, excluye, observa y deja pendientes los comprobantes.

- Propuesta SUNAT muestra el original descargado, reconstruido desde el BYTEA de su ticket. El CRUD no altera ese archivo.
- La primera importación incorpora automáticamente los comprobantes en la lista editable. No hay otra carga o copia de una propuesta personalizada.
- mco_sire_propuesta es la única tabla operativa. Usa la clave de usuario, empresa, período, proveedor, tipo, serie y número; no necesita id_detalle ni tabla de productos.
- mco_sire_propuesta_datos conserva cada ticket, archivo original, fechas, cantidades y totales exactos por moneda.
- Las altas manuales funcionan aun sin ticket y usan origen MANUAL. Las descargas usan origen SUNAT.
- Excluir es un cambio de estado recuperable. Los ajustes conservan originales, historial, versión y usuario cuando existe una identidad autenticada.
- Los pendientes pueden revisarse en el período destino o posteriores. No se incluyen automáticamente al cambiar de período. Incluirlos conserva una sola fila y su período de origen.
- Registro interno y Comparación aparecen solo cuando hay registros internos disponibles. No tener compras administrativas o asientos de compras no impide operar con SUNAT y el CRUD.
- Una nueva descarga conserva los ajustes existentes y queda pendiente de conciliación. Revisar nueva descarga muestra incorporaciones, ajustes, manuales y campos en conflicto. La confirmación verifica una huella para evitar aplicar una revisión obsoleta. Los campos ajustados prevalecen y los comprobantes ausentes se conservan.
- Presentación resume la lista completa por período y moneda, identifica pendientes/excluidos y permite exportar el Excel de revisión. El Excel no transmite información. Los botones separados de aceptación y reemplazo sí envían la operación revisada a SUNAT.

Se mantienen las rutas del módulo; id_compra ahora es una referencia opaca de la clave compuesta, no un número incremental. El frontend utiliza esa referencia sin interpretarla.

La estructura SQL ya recreada por el usuario sirve para esta implementación. **No volver a ejecutar el script de recreación:** borraría las tablas y los datos. El migrador anterior de detalle se bloqueó porque corresponde a otra arquitectura.

Para el seguimiento de aceptación y reemplazo, ejecutar únicamente [mco_sire_presentacion.sql](sql/mco_sire_presentacion.sql). Agrega `mco_sire_aceptacion` y `mco_sire_reemplazo`, con libro `080000`, UUID de operación y relaciones a los tickets de `mco_sire_propuesta_datos` por usuario, empresa y período. Son comunes a todos los rubros. No altera los comprobantes ni `mct_contabilidadticket`. Si ese script ya se ejecutó, esta implementación no requiere otro cambio SQL.

## Aceptación y reemplazo RCE

- Revisar aceptación calcula una huella de los comprobantes, versiones y ticket vigente. Aceptar solo se habilita si los incluidos coinciden con toda la propuesta original; excluir, modificar o agregar exige reemplazo. Se revisa de nuevo al enviar.
- Preparar reemplazo genera un ZIP con un TXT RCE sin cabecera, campos tributarios de Compras y nombre `LE<RUC><AAAAMM>0008040002OIM2`. CAR y CAR original se dejan vacíos según el anexo 11; se conservan los campos adicionales aplicables. No se invierte automáticamente el signo de las notas. La moneda contable se selecciona explícitamente.
- Se puede descargar el ZIP antes de enviarlo. El archivo, hash, cantidades y totales se conservan en el control. Si cambian las compras o el ticket, se rechaza el envío del archivo obsoleto y debe prepararse otro.
- El reemplazo usa carga TUS con libro `080000` y proceso `61`. Ventas conserva sus parámetros existentes. La aceptación usa la URL propia de RCE, no la de RVIE.
- ENVIANDO se persiste antes de invocar SUNAT. La URL de carga se persiste antes del PATCH. Un timeout o respuesta inesperada queda INCIERTO; no se reenvía automáticamente. Los controles se recuperan al abrir la pantalla.
- La consulta verifica ticket, RUC/contexto, período y proceso. Los errores del detalle prevalecen sobre estados de éxito. Los comprobantes de períodos enviados, inciertos o terminados quedan protegidos contra CRUD y conciliaciones; los rechazados se pueden corregir. Se usa el mismo bloqueo por empresa del CRUD durante el envío.
- Registrar preliminar es un paso explícito después del resultado correcto. Su intento, ticket y consultas quedan en `respuesta_sunat.preliminar` del control, sin otra tabla ni duplicar comprobantes. La generación final del libro se completa en SOL.
- Las operaciones con no domiciliados requieren su flujo separado; este cambio implementa el RCE de compras y no el archivo 080500. El backend no verifica catálogos tributarios completos: SUNAT devuelve las validaciones de la carga.

Rutas nuevas bajo `/sire/compras/presentacion`: recuperar por período/usuario/RUC, `POST revisar`, `aceptar`, `reemplazo/preparar`, `reemplazo/enviar`, `consultar`, `preliminar` y `preliminar/consultar`; descargar ZIP por ID y contexto. Envíos requieren `confirmar: true`; aceptación requiere la huella y el ticket revisados.

Referencias: [Manual API Compras v29, secciones 5.2–5.4 y 5.31](https://cpe.sunat.gob.pe/sites/default/files/2026-10/Manual%20de%20servicios%20Web%20Api%20-%20SIRE_Compras%20v29.pdf), [anexo 11 y tabla 13](https://www.sunat.gob.pe/legislacion/superin/2022/anexo-040-2022.pdf), [generación final en SOL](https://cpe.sunat.gob.pe/node/162).

Validación de presentación: `tests/sire-compras-presentacion.pg.test.js`, con PostgreSQL temporal y SUNAT simulado: aceptación sin ajustes, exclusión y manuales, ZIP RCE, huella obsoleta, aislamiento por empresa, bloqueos, recuperación, preliminar y resultado incierto. No se transmitieron declaraciones reales.

Validación básica: tests/sire-compras-contador.pg.test.js pasó en PostgreSQL temporal, sin registro interno, comprobando CRUD, versiones, pendientes, aislamiento por empresa, archivo original y conciliación que conserva ajustes. Sintaxis del frontend revisada, sin compilar. No se ejecutó SQL en Railway ni se enviaron declaraciones.
