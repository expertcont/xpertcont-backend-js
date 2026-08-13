# Presupuestos a CPE - referencia de AdminSunatIcon

Este documento resume como funciona hoy el envio CPE desde ventas y como debe adaptarse luego para presupuestos. La idea es separar el espacio UI en presupuestos ahora, y despues implementar el flujo tributario sin mezclarlo con el presupuesto interno.

## Flujo actual en ventas

### Frontend

Archivo:

```text
xpertcont-frontend-react/src/components/Admin/AdminSunatIcon.js
```

Uso actual desde ventas:

```text
xpertcont-frontend-react/src/components/Admin/AdminVentaList.js
```

`AdminSunatIcon` recibe la clave documental y estado SUNAT del registro:

```text
comprobante_key  -> clave para procesar, ejemplo 01-F001-0000001
comprobante      -> clave para mostrar links, ejemplo 01-F001-0000001
cdr_pendiente
elemento
firma            -> r_vfirmado
documentoId
periodoTrabajo
idAnfitrion
contabilidadTrabajo
backHost
cdr_nivel
onRefresh
```

El componente tiene dos comportamientos:

- Si `firma` existe, no vuelve a generar el CPE. Abre un modal con rutas esperadas de XML, CDR y PDF.
- Si `firma` esta vacio, pide confirmacion y llama al backend:

```http
POST /ad_ventacpe
```

Payload enviado:

```json
{
  "p_periodo": "2026-08",
  "p_id_usuario": "usuario propietario",
  "p_documento_id": "ruc empresa",
  "p_r_cod": "01",
  "p_r_serie": "F001",
  "p_r_numero": "0000001",
  "p_elemento": 1
}
```

El frontend no arma cabecera tributaria ni detalle. Solo envia la identidad del documento.

### Backend principal XpertCont

Ruta:

```text
xpertcont-backend-js/src/routes/venta.routes.js
```

Endpoint:

```js
router.post('/ad_ventacpe', generarCPEexpertcont);
```

Controlador:

```text
xpertcont-backend-js/src/controllers/venta.controllers.js
```

Funcion principal:

```js
generarCPEexpertcont()
```

Pasos:

1. Recibe la clave documental enviada por `AdminSunatIcon`.
2. Llama a `generaJsonPrevioCPEexpertcont(...)`.
3. Lee datos de empresa desde `mad_usuario_contabilidad`.
4. Lee cabecera desde `mve_venta`.
5. Lee detalle desde `mve_ventadet`.
6. Construye el JSON tributario.
7. Consume el segundo backend SUNAT:

```text
https://expertcont-api-sunat.up.railway.app/cpesunat
```

8. Con la respuesta actualiza `mve_venta`:

```text
r_vfirmado
cdr_codigo
cdr_descripcion
cdr_nivel
cdr_pendiente
registrado = 0 si fue rechazado definitivo con correlativo consumido
```

9. Si el documento fue anulado por rechazo definitivo, tambien marca `mve_ventadet.registrado = 0`.
10. Devuelve al frontend:

```text
estado
codigo
nivel
consumioCorrelativo
cdr_pendiente
respuesta_sunat_descripcion
ruta_xml
ruta_cdr
ruta_pdf
codigo_hash
```

## JSON actual enviado al backend SUNAT

`generaJsonPrevioCPEexpertcont` arma:

```text
empresa
cliente
venta
items
```

### Empresa

Sale de `mad_usuario_contabilidad`.

Campos relevantes:

```text
ruc
razon_social
nombre_comercial
domicilio_fiscal
ubigeo
distrito
provincia
departamento
modo
```

### Cliente

Sale de `mve_venta`.

```text
razon_social_nombres = r_razon_social
documento_identidad  = r_documento_id
tipo_identidad       = r_id_doc
cliente_direccion    = r_direccion
```

### Venta

Sale de `mve_venta`.

Campos relevantes:

```text
codigo
serie
numero
fecha_emision
hora_emision
fecha_vencimiento
moneda_id
forma_pago_id
efectivo2
forma_pago2
base_gravada
base_exonerada
base_inafecta
base_gratuita
total_igv
nota
referencias de nota de credito/debito
r_vfirmado
```

### Items actuales

Salen de `mve_ventadet`.

```js
items: ventadet.map((item) => ({
  producto: item.descripcion,
  cantidad: item.cantidad,
  precio_base: item.monto_base,
  precio_neto: item.precio_neto,
  codigo_sunat: "-",
  codigo_producto: item.id_producto,
  codigo_unidad: item.cont_und,
  tipo_igv_codigo: item.tipo_igv_codigo || "10",
  porc_igv: item.porc_igv,
}))
```

## Adaptacion para presupuestos

Regla funcional acordada:

- El presupuesto `NV` no debe convertirse ni cambiar su identidad.
- Al generar CPE desde presupuesto se debe crear un nuevo documento tributario (`01`, `03`, etc.) o usar un flujo que tome el presupuesto como origen.
- El presupuesto queda como respaldo interno/historico.

### Cabecera

La cabecera tributaria puede reutilizar casi el mismo origen conceptual:

```text
mve_venta
```

En presupuestos, la cabecera `NV` contiene cliente, fecha, moneda, forma de pago, totales y glosa. Para el CPE final, la cabecera debe salir del documento tributario generado desde el presupuesto o de una funcion PSQL que proyecte el presupuesto a CPE.

### Detalle

La diferencia principal esta en los items.

Ventas actuales:

```text
mve_ventadet -> productos/items facturables
```

Presupuestos:

```text
mve_ventaserv -> trabajos/servicios presupuestados
mve_ventaservdet -> costeo interno de materiales, operarios y servicios
```

Para CPE desde presupuesto, los items tributarios no deben ser todos los recursos internos. Deben ser los trabajos/servicios visibles al cliente:

```text
mve_ventaserv
```

Mapeo esperado inicial:

```text
producto         <- mve_ventaserv.descripcion
cantidad         <- mve_ventaserv.cantidad
precio_base      <- base tributaria consolidada del servicio
precio_neto      <- total o precio comercial del servicio, si aplica para PDF
codigo_sunat     <- "-"
codigo_producto  <- codigo generico o servicio
codigo_unidad    <- unidad de servicio, probablemente "ZZ" o la unidad que defina SUNAT/negocio
tipo_igv_codigo  <- tipo IGV consolidado del servicio, default "10"
porc_igv         <- porcentaje IGV consolidado
```

Los recursos de `mve_ventaservdet` deben quedar como respaldo/costeo interno, no como lineas facturables, salvo que se defina explicitamente un modo de facturacion detallada.

## Propuesta tecnica futura

Crear un endpoint separado para presupuestos, para no forzar `AdminSunatIcon` ni `generarCPEexpertcont` a mezclar reglas:

```http
POST /ad_presupuesto/cpe
```

Payload similar al actual:

```json
{
  "p_periodo": "2026-08",
  "p_id_usuario": "usuario propietario",
  "p_documento_id": "ruc empresa",
  "p_r_cod": "NV",
  "p_r_serie": "0001",
  "p_r_numero": "0000003",
  "p_elemento": 1,
  "p_id_invitado": "usuario operativo"
}
```

Responsabilidades del endpoint:

1. Validar que el presupuesto exista y este en estado permitido.
2. Generar o resolver el documento CPE destino.
3. Mantener referencia al presupuesto origen.
4. Armar cabecera desde el CPE destino o desde la proyeccion del presupuesto.
5. Armar items desde `mve_ventaserv`.
6. Llamar a `https://expertcont-api-sunat.up.railway.app/cpesunat`.
7. Actualizar firma/CDR en el documento tributario, no destruir el presupuesto `NV`.
8. Devolver rutas XML/CDR/PDF al frontend.

## Nota UI

En `AdminVentaPresupuestoList.js` ya se dejo reservado el espacio visual con icono SUNAT, pero no debe ejecutar `AdminSunatIcon` todavia porque el componente actual llama directamente a `/ad_ventacpe`, que trabaja sobre detalle de productos `mve_ventadet`.

Cuando exista `/ad_presupuesto/cpe`, conviene crear un componente especifico o parametrizar el actual, por ejemplo:

```text
AdminPresupuestoSunatIcon
```

para que el presupuesto use su endpoint y sus reglas de servicios.
