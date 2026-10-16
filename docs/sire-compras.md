# SIRE Compras general — primera etapa

Disponible en SIRE > Compras para todos los rubros. Opera por anfitrion, RUC y periodo, con el libro RCE 080000. La opcion de ventas de Transportes conserva su comportamiento.

## Puesta en marcha

1. Ejecutar `docs/sql/mco_sire_propuesta.sql` en la BD de Railway.
2. Desplegar el backend y el frontend.
3. Abrir SIRE > Compras, seleccionar empresa y periodo. Se recupera automaticamente el ticket existente de RCE.
4. Generar ticket cuando sea necesario y consultar hasta recuperar la propuesta. Descargar el archivo original o revisar la comparacion y exportarla a Excel.

Reutiliza las credenciales SOL/SIRE de la empresa. Los tickets de compras permanecen separados de ventas por id_libro. La propuesta y el ZIP de compras se guardan en mco_sire_propuesta; no se insertan ni modifican asientos contables.

## Comparacion

Se compara la propuesta con las cabeceras de compras del libro 008 en mct_asientocontable, excluyendo registros de origen SIRE para evitar comparar la propuesta contra si misma. No se filtra por rubro. Las compras que aun no se hayan registrado en ese libro apareceran como Solo SUNAT.

Se identifica cada comprobante por documento del proveedor, tipo, serie, numero y anio DAM. Se normalizan ceros iniciales del correlativo; se comparan fecha, moneda y todos los importes de compras en centimos. Los duplicados se muestran para revision y no se consideran coincidencias.

Esta etapa comprende consulta, descarga y comparacion de propuestas. La aceptacion, reemplazo y presentacion del RCE se incorporaran en la siguiente etapa; no se reutilizan las acciones RVIE de Transportes para presentar compras.

## Verificacion

Backend: `node --test src/modules/sire/compras/tests/sireCompras.test.js tests/sire-aceptacion.test.js tests/sire-reemplazo.test.js tests/sire-ultimo-ticket.test.js`.
Las pruebas simulan BD y SUNAT. La conexion real se valida despues del despliegue y de aplicar el SQL, usando una empresa con credenciales configuradas.

## Estructura independiente

El backend esta en `src/modules/sire/compras/` y se registra en `app.js` con el prefijo `/sire/compras`.

- `domain/`: formato de compras y reglas de comparacion, sin HTTP, ZIP ni base de datos.
- `application/`: casos de uso con dependencias inyectadas.
- `infrastructure/`: persistencia de propuestas, lectura de archivos y adaptador de compras del sistema.
- `http/`: controlador y rutas propios.
- `tests/`: pruebas del modulo.
- `index.js`: unico punto de composicion e integracion con el servidor.

La lectura actual de `mct_asientocontable` esta aislada en `infrastructure/comprasSistema.repository.js`. Cuando cambie la fuente de compras, se sustituye ese adaptador; el dominio y los casos de uso de SIRE no dependen del modulo Comercial.

Solo el punto de composicion utiliza la conexion PostgreSQL y la integracion SUNAT compartida. Ningun caso de uso importa controladores o servicios de Comercial ni de Transportes.

Esta reorganizacion conserva las URL y la tabla de propuestas existentes; no necesita otro cambio de esquema.
