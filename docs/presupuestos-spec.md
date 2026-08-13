# Spec funcional - Modulo de Presupuestos

Este documento describe el comportamiento actual y esperado del modulo de presupuestos de XpertCont. La idea es usarlo como punto de partida "spec driven": antes de tocar backend, frontend o PostgreSQL, validar que el cambio encaje con estas reglas.

## Objetivo

Gestionar presupuestos comerciales para trabajos/servicios de fabricacion, instalacion o produccion, manteniendo separado:

- El presupuesto interno/comercial.
- El costeo por trabajo.
- La futura emision tributaria CPE.

Un presupuesto no debe desaparecer ni cambiar su identidad cuando se emite una factura. El presupuesto queda como documento origen/historico.

## Modelo documental

### Presupuesto

El presupuesto se guarda en `mve_venta` con:

```text
r_cod    = 'NV'
r_serie  = '0001'
elemento = 1
estado   = 'P' pendiente o 'C' cerrado
```

`NV` representa el presupuesto/nota de venta interna. Ya no se usa `NP` para este flujo de presupuestos.

Campos base relevantes:

- `id_usuario`: propietario/anfitrion en base de datos.
- `documento_id`: empresa/contabilidad.
- `periodo`: periodo mensual, ejemplo `2026-08`.
- `r_cod`, `r_serie`, `r_numero`, `elemento`: PK documental.
- `r_fecemi`: fecha de emision del presupuesto.
- `r_fecvcto`: por ahora igual a `r_fecemi`.
- `r_id_doc`: por ahora constante `6` para RUC.
- `r_documento_id`: RUC/DNI del cliente.
- `r_razon_social`: cliente.
- `r_direccion`: direccion del cliente.
- `contacto_nombre`, `contacto_celular`: contacto comercial.
- `glosa`: campania/observacion.
- `r_moneda`: `PEN` por defecto.
- `r_tc`: `1` por defecto.
- `r_forma_pago_id`: forma de pago.
- `estado`: `P` pendiente, `C` cerrado.

### Trabajos o servicios

Cada trabajo se guarda en `mve_ventaserv`.

Un presupuesto puede tener varios trabajos. Cada trabajo puede representar un panel, ubicacion, instalacion, servicio grafico o actividad presupuestada.

Campos relevantes:

- PK heredada del presupuesto: `id_usuario`, `documento_id`, `periodo`, `r_cod`, `r_serie`, `r_numero`, `elemento`.
- `servicio`: correlativo interno del trabajo.
- `descripcion`: nombre corto visible del trabajo.
- `especificacion`: descripcion larga o condiciones del trabajo.
- `cantidad`: cantidad referencial.
- `utilidad`: porcentaje comercial/referencial usado para prorratear costo desde pantalla.
- `r_moneda`: moneda del trabajo.
- `r_monto_total`: total visible/referencial del trabajo.
- Campos tributarios consolidados: `r_base002`, `r_igv002`, `r_base003`, `r_base004`, `r_total_gratuito`, etc.

Regla actual: en cabecera del trabajo no se usan como datos editables `precio_unitario`, `monto_base`, `igv` ni `precio_neto`, para evitar confusion. Esos importes viven realmente en el detalle facturable/costeado.

### Detalle de recursos

Los materiales, operarios y servicios de costeo se guardan en `mve_ventaservdet`.

Campos relevantes:

- PK heredada del trabajo: `id_usuario`, `documento_id`, `periodo`, `r_cod`, `r_serie`, `r_numero`, `elemento`, `servicio`.
- `item`: correlativo del detalle.
- `descripcion`: descripcion del recurso.
- `cont_und`: unidad.
- `cantidad`.
- `precio_unitario`.
- `precio_neto`.
- `monto_base`.
- `igv`.
- `porc_igv`.
- `tipo_igv_codigo`.
- `utilidad`: utilidad prorrateada/calculada desde pantalla.
- `horas`, `dias`: usados principalmente para operarios.
- `largo`, `ancho`: usados principalmente para servicios por metro cuadrado.

Reglas de UI/costeo:

- `MATERIAL`: usa cantidad y costo unitario.
- `OPERARIO`: usa horas/dias y costo hora.
- `SERVICIO`: usa largo/ancho y costo por metro cuadrado.
- La utilidad por defecto es `30%` y se define en el trabajo.
- Al agregar detalles, la utilidad del trabajo se prorratea/calcula hacia el detalle.

## Estados

### Pendiente

```text
estado = 'P'
```

Estado inicial. Permite editar cabecera, trabajos y detalles.

### Cerrado

```text
estado = 'C'
```

Indica que el presupuesto ya esta listo/aprobado internamente. Debe restringir acciones destructivas.

Regla actual:

- Solo se pueden eliminar presupuestos pendientes.
- El boton de cerrar aparece en el formulario mientras el presupuesto esta pendiente.

## Flujo principal

```text
1. Crear/obtener presupuesto NV
   -> mve_venta
   -> correlativo por fve_genera01_correl / fve_genera02_correl

2. Actualizar cabecera del presupuesto
   -> mve_venta

3. Crear trabajo
   -> mve_ventaserv

4. Actualizar trabajo
   -> mve_ventaserv

5. Agregar/editar/eliminar recursos
   -> mve_ventaservdet
   -> recalcular totales del trabajo
   -> recalcular totales del presupuesto

6. Cerrar presupuesto
   -> mve_venta.estado = 'C'

7. Generar CPE futuro
   -> crear nuevo documento tributario
   -> no cambiar PK del presupuesto
```

## Regla de calculo

PostgreSQL es la fuente oficial de totales tributarios.

Frontend puede calcular vistas previas para UX, pero despues de persistir debe leer la respuesta o recargar desde backend.

Backend Node.js no debe recalcular impuestos como fuente de verdad. Su rol es:

- Validar parametros minimos.
- Invocar funciones PostgreSQL.
- Ejecutar SQL de CRUD donde corresponda.
- Invocar recalculos PSQL despues de cambios en detalle.
- Devolver datos normalizados al frontend.

## Endpoints actuales del modulo

Los endpoints viven en:

```text
src/controllers/presupuesto.controllers.js
src/routes/presupuesto.routes.js
```

### Listado de presupuestos

Debe ser liviano para la pantalla principal.

No debe cargar todo el JSON anidado de servicios y detalles por cada presupuesto. La vista principal solo necesita cabeceras y agregados rapidos como cantidad de trabajos.

Campos utiles para listado:

- numero concatenado: `r_cod-r_serie-r_numero`
- fecha
- cliente
- estado
- moneda
- total
- cantidad de trabajos

### Presupuesto completo

Se usa al abrir el formulario.

Puede devolver JSON anidado:

```text
mve_venta
  servicios: mve_ventaserv[]
    detalles: mve_ventaservdet[]
```

### Crear/actualizar cabecera

Debe mantener:

- `r_fecvcto = r_fecemi`, por ahora.
- `r_id_doc = '6'`, por ahora.
- `r_tc = 1`, por ahora.
- `estado = 'P'` al crear.
- `ctrl_mod_us = null` al crear; se informa al modificar.

### Crear trabajo

Debe crear `mve_ventaserv` con valores minimos y devolver campos alineados al frontend.

Campos esperados utiles:

- `servicio`
- `descripcion`
- `especificacion`
- `cantidad`
- `utilidad`
- `r_monto_total`
- `r_moneda`

### Actualizar trabajo

Debe permitir modificar:

- `descripcion`
- `especificacion`
- `cantidad`
- `utilidad`
- `r_monto_total`
- `r_moneda`
- `ctrl_mod_us`

No debe exigir datos de precio unitario/base/igv/precio neto en cabecera de trabajo.

### CRUD detalle

Debe soportar:

- listar detalles de un trabajo.
- insertar detalle.
- modificar detalle.
- eliminar detalle.

Despues de insertar, modificar o eliminar detalle se debe recalcular:

```text
fve_ventaservdet_rtotales(...)
  -> fve_ventaserv_rtotales(...)
```

## Busqueda de cliente

El formulario de presupuesto usa el mismo mecanismo del formulario de ventas:

```text
POST /correntistagenera
```

Payload:

```json
{
  "ruc": "20505567890"
}
```

Respuesta usada:

- `nombre_o_razon_social` -> `r_razon_social`
- `r_id_doc` -> `r_id_doc`
- `direccion_completa` -> `r_direccion`

## Emision CPE futura

Para presupuestos no conviene convertir `NV` en `01` cambiando la PK.

El criterio aprobado es:

1. El presupuesto `NV` permanece intacto.
2. Al generar CPE se crea un nuevo documento tributario en `mve_venta`.
3. Ese nuevo documento tendra su propio correlativo:

```text
01-F001-00000001  Factura
03-B001-00000001  Boleta, si aplica
07-...            Nota de credito
08-...            Nota de debito
```

4. El CPE debe guardar referencia al presupuesto origen, usando campos existentes cuando sea suficiente:

```text
r_cod_ref
r_serie_ref
r_numero_ref
r_fecemi_ref
```

5. Los trabajos/servicios del presupuesto se transforman en items facturables del CPE.
6. El costeo detallado queda en el presupuesto como respaldo interno.

Pendiente para PSQL:

- Revisar funciones actuales de emision desde `NP` a CPE.
- Crear version para presupuesto que genere nuevo CPE desde `NV`.
- No modificar ni borrar la PK del presupuesto origen.

## Frontend

Modulo principal:

```text
xpertcont-frontend-react/src/components/Admin/presupuestos
```

Archivos:

- `AdminVentaPresupuestoList.js`: listado general.
- `AdminVentaPresupuestoNuevoForm.js`: formulario de alta/edicion.
- `AdminVentaPresupuestoPdf.js`: PDF.
- `AdminVentaPresupuestoDemoData.js`: helpers y data demo/compatibilidad.
- `modals/TrabajoFormModal.js`: modal de trabajo.
- `modals/TrabajoInfoModal.js`: modal informativo del trabajo en listado.
- `modals/ProductoSelectorModal.js`: seleccion de recursos/productos.

Rutas:

```text
/ad_ventapresupuesto/:id_anfitrion/:id_invitado/:periodo/:documento_id
/ad_ventapresupuesto/:id_anfitrion/:id_invitado/:periodo/:documento_id/new
/ad_ventapresupuesto/:id_anfitrion/:id_invitado/:periodo/:documento_id/:comprobante/edit
```

Reglas UI:

- En listado movil, las acciones deben mostrarse como botones grandes tipo app nativa.
- En formulario, el documento del cliente muestra icono de busqueda RUC/DNI a la derecha.
- La utilidad se edita en el trabajo, no en cada detalle.
- Los controles numericos usan stepper visual para cantidad, horas, largo, ancho, costo hora, costo m2 y utilidad.
- Los modales se agrupan dentro de `modals/`.

## Criterios de aceptacion actuales

- Crear presupuesto `NV` pendiente.
- Reabrir presupuesto pendiente si la funcion PSQL asi lo define.
- Actualizar cabecera con cliente/contacto/direccion/campania.
- Buscar RUC/DNI y autocompletar cliente.
- Crear trabajo con utilidad por defecto `30%`.
- Editar trabajo.
- Agregar materiales, operarios y servicios al trabajo.
- Editar/eliminar detalles.
- Recalcular totales desde PostgreSQL.
- Cerrar presupuesto.
- Eliminar solo presupuestos pendientes.
- Listado principal no debe cargar JSON full pesado.
- Vista principal debe mostrar cantidad de trabajos.
- Click en trabajo del listado abre modal informativo simple.

## Pendientes principales

- Definir PSQL de generacion CPE desde presupuesto `NV`.
- Definir si se requiere tabla puente de trazabilidad o basta con campos `*_ref`.
- Completar pruebas de generacion de factura desde trabajos.
- Revisar permisos por usuario para cerrar/eliminar/generar CPE.
- Limpiar documentacion antigua que todavia menciona `NP` como presupuesto.
