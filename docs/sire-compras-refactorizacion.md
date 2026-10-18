> Actualizacion: las tablas SIRE Ventas y Compras estan vacias, segun confirmacion del usuario.
> Se genero docs/sql/sire_recrear_cabecera_detalle.sql para eliminar la estructura anterior y crear mve_sire_propuesta / mco_sire_propuesta (comprobantes) y sus tablas *_propuesta_datos (informacion general),
> sin migracion ni respaldo. Es el script de referencia para la nueva estructura.
> Ventas cabecera: PK (id_usuario, documento_id, periodo, r_cod, r_serie, r_numero).
> Compras cabecera: PK (id_usuario, documento_id, periodo, r_documento_id, r_cod, r_serie, r_numero).
> r_documento_id identifica al proveedor y permite facturas con igual tipo, serie y numero de proveedores distintos.
> Una fila por comprobante. Los campos tributarios, referencias y ajustes antes ubicados en _det se integraron en la cabecera.
> No se crean tablas _det ni item; tampoco se almacena el arreglo detalle JSONB. valores_originales conserva el original de cada compra.
> Las tablas se particionan por periodo.
> Sin elemento, id_propuesta ni id_detalle. Cada factura o nota usa su propia identidad SUNAT.
> Al comparar con el sistema, las facturas usan los campos principales y las notas usan los campos de referencia del movimiento interno.
> *_propuesta conserva una fila por comprobante. *_propuesta_datos conserva una fila por descarga con ticket, archivo BYTEA, fechas, cantidad y totales originales por moneda.
> PK de *_datos: (id_usuario, documento_id, periodo, ticket). Los comprobantes usan una FK con esa clave completa.
> No se repite el archivo en cada comprobante. Compras manuales permiten ticket NULL. mct_contabilidadticket mantiene el control de tickets, aceptacion y reemplazo.
> Una nueva descarga conserva su propia fila de datos generales; el backend debe conciliar antes de actualizar comprobantes ajustados.
> El mismo script recrea tambien mve_sire_aceptacion y mve_sire_reemplazo, confirmadas vacias.
> Aceptacion conserva id_aceptacion BIGSERIAL y sus estados/contexto, elimina id_propuesta y referencia *_datos por ticket_propuesta.
> Reemplazo conserva UUID, ZIP, estados e indices, elimina id_propuesta_actualizada y referencia *_datos por ticket_actualizacion (nullable).
> Registrar los datos generales del ticket de actualizacion al obtenerlo, aun antes de descargar el archivo; la FK se verifica al COMMIT.
> Campos de contexto alineados: id_usuario VARCHAR(50), documento_id VARCHAR(20), periodo VARCHAR(10), id_libro VARCHAR(6).
> *_datos de Ventas admite REEMPLAZADO para conservar el estado administrativo existente.
> Solo se preparo SQL: el backend actual aun usa las claves anteriores y requiere adaptacion.
> No ejecutar la migracion anterior ni reutilizar sus SQL de instalacion con la nueva estructura.
> El contenido siguiente documenta la implementacion anterior a este cambio de claves.

# SIRE Compras: backend cabecera/detalle

## Estado y arquitectura

Implementado el backend. No se ejecuto la migracion ni un despliegue en Railway.

- mco_sire_propuesta conserva cabecera, BYTEA y JSONB anterior. Las nuevas descargas guardan
  tambien el JSONB de compatibilidad mientras se completa la transicion; las lecturas activas
  ya reconstruyen la propuesta desde los valores originales de cada fila normalizada.
- mco_sire_propuesta_det contiene los comprobantes originales y operativos de Comercial y Transporte.
  Una fila operativa por identidad documental y empresa; las versiones de descarga quedan como
  historico inactivo en la misma tabla, no como otra propuesta personalizada duplicada.
- mct_contabilidadticket conserva el control de tickets. No se modifico el cliente externo SUNAT.
- mco_sire_personalizada se conserva intacta para migracion y auditoria, sin escrituras del nuevo CRUD.

El parser usa el encabezado real RCE: DG/DGNG/DNG con IGV separado, adquisiciones no gravadas,
ISC, ICBPER, otros, moneda/tipo de cambio, CAR y referencias. Los campos adicionales se
conservan por fila. Los importes se validan con decimales exactos, sin usar float para migrar.

## Instalacion

Antes del cambio de backend, ejecutar desde el backend con las variables de la BD destino:

    node scripts/migrar-sire-compras-detalle.js

Este comando solo simula en una transaccion READ ONLY. Si el diagnostico es conforme:

    node scripts/migrar-sire-compras-detalle.js --aplicar

El segundo comando aplica el esquema docs/sql/mco_sire_propuesta_det.sql y migra los datos
como una sola transaccion. No llama a SUNAT. No ejecutar solo el CREATE de detalle y asumir
que la migracion termino. Si el script encuentra discrepancias, revierte y hay que revisar
el informe antes de desplegar. Mantener respaldo de la BD y detener escrituras durante el
cambio. La aplicacion protege las operaciones si detecta datos legacy sin migrar.

La migracion reinterpreta el BYTEA, compara identidades, cantidad y sumas de todos los importes
por cabecera y moneda contra el JSONB, incorpora ajustes/manuales/pendientes/historial, verifica
los valores operativos y conserva las tablas anteriores. Repetirla no duplica registros.
Las coincidencias ambiguas y duplicados se detienen: no se resuelven sobrescribiendo datos.
Los nuevos IDs quedan fuera del rango legacy para proteger formularios que quedaron abiertos.
No inventa usuario de ajuste: el historial antiguo sin actor permanece sin actor.

## API y conciliacion

Se mantienen las rutas y contratos del CRUD y de propuesta. id_compra sigue exponiendose como
alias de id_detalle; el objeto comprobante se construye desde columnas tipadas. Los importes
NUMERIC se entregan como cadenas decimales para preservar precision, compatibles con las
conversiones de importe que ya hace el frontend. estado DECLARAR se mapea a INCLUIDO internamente.

La primera descarga alimenta el detalle en la misma transaccion que la cabecera. Una segunda
version queda PENDIENTE_CONCILIACION. Repetir el mismo archivo es idempotente; un archivo distinto
con el mismo ticket se rechaza para conservar el original. No hay cargas de trabajo duplicadas.

Endpoints administrativos nuevos, sin cambios en las llamadas a SUNAT:

- GET /sire/compras/personalizada/conciliacion/:id_propuesta/:periodo/:id_anfitrion/:documento_id
- POST /sire/compras/personalizada/conciliar/:id_propuesta

El GET devuelve huella_revision y la vista previa de originales, valores actuales, resultado
propuesto y conflictos. El POST requiere id_anfitrion, documento_id, periodo, confirmar=true y
la huella_revision. Si se edito algo despues de revisar, devuelve 409 y exige nueva revision.
Las ediciones del contador prevalecen en conflictos mostrados por la vista previa; originales
anteriores e historial permanecen. Se conservan manuales, asignados a otro periodo y ausentes.
No se excluyen comprobantes por ausencia en una descarga. La UI de esta conciliacion queda
para la siguiente etapa de frontend; el backend ya tiene revision y confirmacion explicitas.

El CRUD excluye logicamente, soporta OBSERVADO y PENDIENTE, usa control de version e historial.
usuario_ajuste se toma solo del contexto de usuario que provea el middleware; no del body.
Si no hay identidad autenticada disponible, permanece NULL.

## Validacion y recuperacion

Se usa PostgreSQL embebido temporal para comprobar consultas, migracion y conciliacion, sin
conectarse a Railway ni cambiar dependencias productivas. La prueba esta en
 tests/sire-compras-detalle.pg.test.js y recibe SIRE_PGLITE_MODULE apuntando al paquete de prueba.
No requiere compilar frontend.

No se eliminan archivo, detalle JSONB, tablas antiguas ni historial. Tras migrar, nuevas ediciones
solo existen en el detalle nuevo: volver al backend anterior requiere recuperar los ajustes
posteriores o un respaldo consistente; no es un rollback automatico por solo desplegar codigo viejo.
