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

## Estado implementado hasta la fecha

Backend:

- Existe `POST /ad_presupuesto/comprobante`.
- Existe `generarComprobantePresupuesto()` en `src/controllers/presupuesto.controllers.js`.
- Existe la ruta en `src/routes/presupuesto.routes.js`.
- Existe SQL de referencia en `docs/sql/fve_presupuesto_generar_comprobante.sql`.
- La funcion PSQL ya no usa `fve_crear_comprobante`; inserta una cabecera nueva en `mve_venta`.
- El backend fue pusheado a `origin/master` en el commit `0ceb2fd Agregar generacion comercial desde presupuestos`.

PostgreSQL:

- La funcion genera `01/03` desde `NV`.
- Valida serie autorizada en `mad_seguridad_serie`.
- Usa `fve_genera01_correl` y `fve_genera02_correl`.
- Inserta items con `fve_ventadetinserta`.
- `fve_ventadetinserta` requiere `elemento numeric` y `r_fecemi varchar`, por eso la funcion hace casts explicitos.

Frontend:

- El boton/flujo visual `Generar CPE` existe como espacio reservado.
- Falta conectar el modal/accion frontend a `POST /ad_presupuesto/comprobante`.
- Luego debe navegar al comprobante comercial generado.

## Estructura de tablas

Cabecera compartida:

```text
mve_venta
PK: id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento
Campos principales: r_fecemi, r_fecvcto, glosa, debe, haber, r_id_doc,
r_documento_id, r_razon_social, r_direccion, r_base002, r_igv002,
r_monto_total, r_moneda, r_tc, efectivo, vuelto, forma_pago2, efectivo2,
registrado, r_forma_pago_id, fact_cod, fact_serie, fact_num,
dias_credito, contacto_nombre, contacto_celular, estado, cdr_*.
```

Detalle comercial:

```text
mve_ventadet
PK: id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, item
Campos principales: id_producto, r_fecemi, descripcion, cont_und, cantidad,
precio_unitario, monto_base, igv, precio_neto, porc_igv, no_kardex,
registrado, moneda, tipo_igv_codigo, pp_descripcion2, pp_largo,
pp_ancho, pp_utilidad, pp_horas, pp_dias.
```

Trabajos del presupuesto:

```text
mve_ventaserv
PK: id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, servicio
Campos principales: id_producto, descripcion, especificacion, cont_und,
cantidad, precio_unitario, monto_base, igv, precio_neto, porc_igv,
r_base002, r_igv002, r_monto_total, r_moneda, registrado, utilidad.
```

Costeo interno:

```text
mve_ventaservdet
PK: id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, servicio, item
Campos principales: id_producto, descripcion, cont_und, cantidad,
precio_unitario, monto_base, igv, precio_neto, porc_igv, tipo_igv_codigo,
largo, ancho, utilidad, horas, dias, registrado.
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

- Probar `POST /ad_presupuesto/comprobante` contra un presupuesto real.
- Confirmar producto comodin para `mve_ventadet.id_producto`.
- Implementar UI/modal de emision desde presupuesto: elegir `01/03`, serie, fecha y forma de pago.
- Navegar al comprobante generado.
- Desde el comprobante generado, usar `AdminSunatIcon`.

## Prueba recomendada

1. Probar primero en PostgreSQL con `BEGIN` y `ROLLBACK`.
2. Confirmar que aparece una cabecera nueva `01/03` en `mve_venta`.
3. Confirmar que aparecen items en `mve_ventadet`.
4. Confirmar que el `NV` queda con `fact_cod/fact_serie/fact_num`.
5. Repetir con `COMMIT`.
6. Probar `POST /ad_presupuesto/comprobante`.
7. Abrir el comprobante generado en `/ad_venta/...`.

## Handoff inmediato para continuar

No empezar por UI hasta confirmar que el endpoint responde correctamente.

Orden recomendado:

```text
1. Probar fve_presupuesto_generar_comprobante en PostgreSQL.
2. Probar POST /ad_presupuesto/comprobante.
3. Implementar modal frontend de emision.
4. Navegar al documento comercial generado.
5. Usar AdminSunatIcon desde el documento comercial.
```

Datos que debe tener el frontend para emitir:

```text
id_anfitrion
documento_id
periodo
id_invitado
fecha
origen: NV, 0001, r_numero, elemento 1
destino: r_cod_emitir 01/03, r_serie_emitir
cliente: r_id_doc, r_documento_id, r_razon_social, r_direccion
pago: r_moneda, r_forma_pago_id, dias_credito, efectivo, vuelto, forma_pago2, efectivo2
id_producto default o real para servicios
cont_und_default
```

Regla que no debe romperse:

```text
El presupuesto NV no cambia de PK.
El comprobante comercial nace como documento nuevo 01/03.
mve_ventaservdet nunca pasa como linea facturable.
```
