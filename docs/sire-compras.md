> Backend normalizado: consultar **sire-compras-refactorizacion.md** para migracion, despliegue y conciliacion. La descripcion legacy de tablas que sigue se conserva como referencia.

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


## Propuesta personalizada (borrador de trabajo)

Instalar primero docs/sql/mco_sire_propuesta.sql si el modulo no esta instalado, y luego
**docs/sql/mco_sire_personalizada.sql** en la BD del backend. No se ejecutan migraciones automaticamente.
Desplegar backend y frontend. No requiere cambios en Comercial ni en Transportes.

Al importar el detalle desde Propuesta SUNAT, se crea automaticamente la copia de trabajo
personalizada. No existe un boton de carga separado. Al abrir Propuesta personalizada se
sincronizan tambien propuestas que ya estaban guardadas antes de este cambio, sin consultar
SUNAT ni generar tickets. La copia agrega solo comprobantes nuevos; conserva ediciones,
exclusiones, pendientes y la propuesta original. Si SUNAT elimina o cambia un comprobante en
un ticket posterior, las decisiones existentes se mantienen para revision manual.

- Agregar: alta manual con validacion de fecha, proveedor, moneda e importes.
- Editar: cambia datos, motivo y estado. Se conserva original e historial de versiones.
- Excluir: baja logica con motivo obligatorio. Puede recuperarse con Incluir en el periodo.
- Pendiente: motivo/documentacion faltante y periodo futuro obligatorio. Se muestra en el
  periodo de origen, en el de destino y en los posteriores mientras siga pendiente.
  No pasa a DECLARAR automaticamente: el operador debe revisarlo e incluirlo explicitamente.
- Al incluirlo en otro periodo, queda asignado solo a ese destino; en el origen se muestra
  la asignacion y se bloquea su edicion para evitar una doble inclusion entre periodos.
- Exportar por declarar: todos los DECLARAR asignados al periodo actual, independiente de
  los filtros de pantalla. Exportar revision: las filas visibles con estado, motivo y periodos.
  Ambos son Excel de trabajo, no archivos de reemplazo RCE ni presentaciones a SUNAT.

API bajo /sire/compras:

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | /personalizada/:periodo/:id_anfitrion/:documento_id | Lista y recupera decisiones persistidas |
| POST | /personalizada/importar | Agrega comprobantes del ultimo ticket importado |
| POST | /personalizada | Crea compra manual |
| PUT | /personalizada/:id_compra | Edita compra y estado |
| DELETE | /personalizada/:id_compra | Excluye con motivo, sin borrar original |

Mutaciones: enviar id_anfitrion, documento_id y periodo en body. PUT/DELETE requieren
version entera actual. PUT/POST reciben comprobante con los campos RCE normalizados,
estado (DECLARAR/EXCLUIDO/PENDIENTE), motivo y periodo_destino para pendientes.
Un conflicto de version o comprobante duplicado devuelve HTTP 409.
El alcance por anfitrion/RUC/periodo se aplica en cada consulta y actualizacion.

Pruebas: node --test src/modules/sire/compras/tests/personalizada.test.js
> Implementacion vigente: [SIRE Compras: trabajo del contador](sire-compras-contador.md). La pantalla principal es Compras por declarar y el registro interno es opcional. Las instrucciones antiguas de migracion/recreacion que siguen son historicas y no deben reaplicarse.

