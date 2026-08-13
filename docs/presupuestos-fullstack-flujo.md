# Flujo fullstack - Presupuesto a factura comercial

Este documento guia el flujo completo desde React hasta PostgreSQL para presupuestos, costeo, generacion comercial y posterior envio SUNAT.

## Idea central

El presupuesto es un documento interno/comercial `NV`.

```text
Presupuesto:
mve_venta NV
  -> mve_ventaserv
      -> mve_ventaservdet
```

La factura o boleta comercial es otro documento nuevo.

```text
Comprobante comercial:
mve_venta 01/03
  -> mve_ventadet
```

El presupuesto no cambia de identidad. Cuando se genera un comprobante, el `NV` se marca con:

```text
fact_cod
fact_serie
fact_num
```

## Flujo operativo

### 1. Abrir listado de presupuestos

Frontend:

```text
xpertcont-frontend-react/src/components/Admin/presupuestos/AdminVentaPresupuestoList.js
```

Ruta React:

```text
/ad_ventapresupuesto/:id_anfitrion/:id_invitado/:periodo/:documento_id
```

Backend:

```text
GET /ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:dia
```

Tabla:

```text
mve_venta
```

La lista debe ser liviana: cabeceras, total, estado y cantidad de trabajos.

### 2. Crear presupuesto

Frontend llama:

```text
POST /ad_presupuesto
```

Backend:

```text
crearPresupuesto()
  -> fve_crear_presupuesto(...)
```

Resultado:

```text
mve_venta NV-0001-r_numero-1
estado = P
```

Luego el frontend navega al formulario de edicion:

```text
/ad_ventapresupuesto/:id_anfitrion/:id_invitado/:periodo/:documento_id/:r_numero/edit
```

### 3. Cargar presupuesto completo

Frontend:

```text
AdminVentaPresupuestoNuevoForm.js
```

Backend:

```text
GET /ad_presupuesto/full/:periodo/:id_anfitrion/:documento_id/NV/0001/:r_numero/1
```

Respuesta:

```text
mve_venta
  servicios: mve_ventaserv[]
    detalles: mve_ventaservdet[]
```

### 4. Editar cabecera

Frontend guarda datos como:

- Fecha.
- Moneda.
- Forma de pago.
- Cliente.
- Direccion.
- Contacto.
- Celular.
- Campania/glosa.

Backend:

```text
PUT /ad_presupuesto
```

Tabla:

```text
mve_venta
```

### 5. Crear o editar trabajos

Cada trabajo visible al cliente se guarda en:

```text
mve_ventaserv
```

Backend:

```text
POST /ad_presupuestoserv
PUT  /ad_presupuestoserv
```

Campos clave:

```text
descripcion      nombre corto visible
especificacion   descripcion larga
cont_und         unidad
cantidad
r_monto_total    total comercial del trabajo con IGV
r_moneda
utilidad
```

Regla: los trabajos son las futuras lineas facturables.

### 6. Crear o editar recursos internos

Cada recurso interno se guarda en:

```text
mve_ventaservdet
```

Backend:

```text
GET    /ad_presupuestoservdet/...
POST   /ad_presupuestoservdet
PUT    /ad_presupuestoservdet/...
DELETE /ad_presupuestoservdet/...
```

Despues de insertar, modificar o eliminar recursos, PostgreSQL recalcula:

```text
fve_ventaservdet_rtotales(...)
  -> fve_ventaserv_rtotales(...)
```

Regla: `mve_ventaservdet` es costeo interno. No pasa como detalle de factura.

### 7. Cerrar presupuesto

Frontend muestra boton mientras:

```text
estado = P
```

Backend:

```text
PUT /ad_presupuesto
```

Actualiza:

```text
mve_venta.estado = C
```

Un presupuesto cerrado ya no deberia permitir acciones destructivas normales.

### 8. Generar factura o boleta comercial

Frontend debe llamar:

```text
POST /ad_presupuesto/comprobante
```

Backend:

```text
generarComprobantePresupuesto()
  -> fve_presupuesto_generar_comprobante(...)
```

PostgreSQL:

```text
1. Lee mve_venta NV.
2. Lee trabajos en mve_ventaserv.
3. Valida serie autorizada en mad_seguridad_serie.
4. Genera correlativo con fve_genera01_correl.
5. Inserta una cabecera nueva en mve_venta con r_cod 01/03.
6. Inserta un item en mve_ventadet por cada trabajo.
7. Confirma correlativo con fve_genera02_correl.
8. Marca el presupuesto NV con fact_cod/fact_serie/fact_num.
```

No se usa `fve_crear_comprobante` para presupuestos de servicios, porque esa funcion comercial cambia la PK del documento origen.

Mapeo de trabajos a detalle facturable:

```text
mve_ventaserv.descripcion      -> mve_ventadet.descripcion
mve_ventaserv.especificacion   -> mve_ventadet.pp_descripcion2
mve_ventaserv.cont_und         -> mve_ventadet.cont_und
mve_ventaserv.cantidad         -> mve_ventadet.cantidad
mve_ventaserv.r_monto_total    -> mve_ventadet.precio_neto
mve_ventaserv.r_moneda         -> mve_ventadet.moneda
mve_ventaserv.utilidad         -> mve_ventadet.pp_utilidad
```

Regla confirmada por factura real:

```text
mve_ventadet.precio_neto = total de linea con IGV
mve_ventadet.monto_base  = base unitaria sin IGV
mve_ventadet.igv         = IGV unitario
```

Ejemplo real:

```text
cantidad        = 30
precio_unitario = 4.33
precio_neto     = 129.80
monto_base      = 3.666667
igv             = 0.66
```

### 9. Abrir comprobante generado

La respuesta devuelve:

```text
r_cod
r_serie
r_numero
elemento
```

Frontend debe navegar al flujo comercial existente:

```text
/ad_venta/:id_anfitrion/:id_invitado/:periodo/:documento_id/:r_cod-:r_serie-:r_numero-:elemento/view
```

### 10. Enviar a SUNAT

Ya en el documento comercial normal, se usa el flujo existente:

```text
AdminSunatIcon
  -> POST /ad_ventacpe
```

No se debe enviar el presupuesto `NV` directamente a `/ad_ventacpe`.

## Archivos frontend

```text
xpertcont-frontend-react/src/components/Admin/presupuestos/AdminVentaPresupuestoList.js
xpertcont-frontend-react/src/components/Admin/presupuestos/AdminVentaPresupuestoNuevoForm.js
xpertcont-frontend-react/src/components/Admin/presupuestos/AdminVentaPresupuestoPdf.js
xpertcont-frontend-react/src/components/Admin/presupuestos/modals/TrabajoFormModal.js
xpertcont-frontend-react/src/components/Admin/presupuestos/modals/TrabajoInfoModal.js
xpertcont-frontend-react/src/components/Admin/presupuestos/modals/ProductoSelectorModal.js
xpertcont-frontend-react/src/components/Admin/presupuestos/modals/ClonarTrabajoModal.js
```

## Archivos backend

```text
xpertcont-backend-js/src/controllers/presupuesto.controllers.js
xpertcont-backend-js/src/routes/presupuesto.routes.js
xpertcont-backend-js/docs/sql/fve_presupuesto_generar_comprobante.sql
```

## Pendientes de integracion

- Ejecutar la funcion SQL en PostgreSQL.
- Probar `POST /ad_presupuesto/comprobante` contra un presupuesto real.
- Confirmar producto comodin para `mve_ventadet.id_producto`.
- Implementar UI/modal de emision desde presupuesto: elegir `01/03`, serie, fecha y forma de pago.
- Navegar al comprobante generado.
- Desde el comprobante generado, usar `AdminSunatIcon`.
