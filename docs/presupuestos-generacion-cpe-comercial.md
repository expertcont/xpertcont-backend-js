# Generacion de factura comercial desde presupuesto - referencia de ventas

Este documento resume como se graba hoy un documento comercial de venta desde `AdminVentaForm.js`. Sirve como base para disenar una funcion PostgreSQL que genere un CPE comercial desde un presupuesto `NV`, dejando el presupuesto como documento origen y usando el flujo SUNAT existente despues.

## Objetivo futuro

Para presupuestos, el flujo recomendado es:

```text
Presupuesto NV
  -> generar factura/boleta comercial real en mve_venta + mve_ventadet
  -> abrir/mostrar ese documento comercial
  -> enviar a SUNAT con AdminSunatIcon actual
```

Esto evita modificar `AdminSunatIcon` y evita que el presupuesto cambie de identidad.

## Frontend actual: AdminVentaForm.js

Archivo:

```text
xpertcont-frontend-react/src/components/Admin/AdminVentaForm.js
```

Ruta normal:

```text
/ad_venta/:id_anfitrion/:id_invitado/:periodo/:documento_id/:comprobante/:comprobante_ref
```

Donde `comprobante` tiene forma:

```text
r_cod-r_serie-r_numero-elemento
```

Ejemplo:

```text
NV-0001-0000003-1
```

## Carga inicial del documento

Cuando existe `params.comprobante`, el formulario divide la clave:

```js
const [COD, SERIE, NUMERO, ELEM] = params.comprobante.split('-');
```

Luego carga:

```js
mostrarVenta(COD, SERIE, NUMERO, ELEM);
mostrarVentaDetalle(COD, SERIE, NUMERO, ELEM);
mostrarVentaRef(COD, SERIE, NUMERO);
```

### Cabecera

Frontend:

```http
GET /ad_venta/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
```

Backend:

```text
src/routes/venta.routes.js
src/controllers/venta.controllers.js -> obtenerRegistro()
```

Tabla:

```text
mve_venta
```

Tambien hace join con `mad_usuariocontabilidad` para datos de impresion.

### Detalle

Frontend:

```http
GET /ad_ventadet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
```

Backend:

```text
src/routes/ventadet.routes.js
src/controllers/ventadet.controllers.js -> obtenerVentaDet()
```

Tabla:

```text
mve_ventadet
```

### Referencias

Frontend:

```http
GET /ad_ventadetref/:id_anfitrion/:documento_id/:cod/:serie/:num
```

Backend:

```text
src/controllers/ventadet.controllers.js -> obtenerVentaDetRef()
```

Tabla:

```text
mve_ventaref
```

## Crear pedido base NV

Desde listados o flujos de nuevo documento se usa:

```http
POST /ad_venta
```

Backend:

```text
src/controllers/venta.controllers.js -> generarRegistro()
```

Payload:

```json
{
  "id_anfitrion": "usuario propietario",
  "documento_id": "ruc empresa",
  "periodo": "2026-08",
  "id_invitado": "usuario operativo",
  "fecha": "2026-08-12"
}
```

PostgreSQL:

```sql
SELECT r_numero, r_fecemi, r_monto_total
FROM fve_crear_pedido($1, $2, $3, $4, $5)
```

Rol:

- Crear o recuperar una nota/pedido base `NV`.
- Preparar cabecera en `mve_venta`.
- Devolver numero, fecha y total.

## Examen backend exacto de grabado en BD

El backend Node no contiene la logica tributaria ni de correlativos en JavaScript para el flujo moderno. La delega a PostgreSQL mediante funciones `fve_*` y `fct_*`.

En el workspace local no se encontro el cuerpo `CREATE FUNCTION` de:

```text
fve_crear_pedido
fve_crear_comprobante
fve_crear_comprobante_ref
fve_ventadetinserta
fve_ventadetactualiza
fve_ventadetelimina
fct_genera_venta
fct_genera_venta_elem
```

Si se necesita reproducir exactamente la logica interna, hay que extraerla desde PostgreSQL o desde un dump completo de funciones. Lo que si esta claro en el backend es el contrato: parametros, tablas afectadas y datos devueltos.

### Cabecera manual antigua: `crearRegistro()`

Archivo:

```text
src/controllers/venta.controllers.js
```

Funcion:

```text
crearRegistro()
```

Esta funcion arma un `INSERT INTO mve_venta` directo. No es el flujo principal del formulario moderno para emitir desde `NV`, pero revela campos importantes de cabecera:

```text
id_usuario
documento_id
periodo
r_cod
r_serie
r_numero
elemento
r_fecemi
r_fecvcto
glosa
debe
haber
debe_me
haber_me
ctrl_crea
ctrl_crea_us
r_id_doc
r_documento_id
r_razon_social
r_cod_ref
r_serie_ref
r_numero_ref
r_fecemi_ref
r_base001
r_base002
r_base003
r_base004
r_igv002
r_monto_icbp
r_monto_otros
r_monto_total
r_moneda
r_tc
```

Para comprobantes normales que no son `07` ni `08`, el numero se genera con:

```sql
fct_genera_venta($1,$2,$3,$4,$5)
```

y `elemento = 1`.

Para notas `07`/`08`, usa:

```sql
fct_genera_venta_elem($1,$2,$3,$17,$18,$19)
```

porque conserva la clave del comprobante referenciado y genera un nuevo elemento.

Para presupuestos a CPE comercial, el caso objetivo inicial es comprobante normal `01` o `03`, por tanto debe generar nuevo `r_numero` y usar `elemento = 1`.

### Creacion moderna de pedido: `generarRegistro()`

Endpoint:

```http
POST /ad_venta
```

Controlador:

```js
generarRegistro()
```

Contrato PSQL:

```sql
SELECT r_numero, r_fecemi, r_monto_total
FROM fve_crear_pedido(
  p_id_usuario,
  p_documento_id,
  p_periodo,
  p_id_invitado,
  p_fecha
)
```

Este flujo crea/recupera un pedido `NV`, usado como documento editable previo. Para presupuestos ya tenemos un `NV` propio, asi que no conviene usar esta funcion para generar CPE final; sirve como referencia de convenciones.

### Emision comercial: `generarComprobante()`

Endpoint:

```http
POST /ad_ventacomp
```

Controlador:

```js
generarComprobante()
```

Para comprobante normal (`01`, `03`, `NV`, excepto `07`/`08`) el backend llama:

```sql
SELECT r_cod, r_serie, r_numero, elemento, r_fecemi, r_monto_total
FROM fve_crear_comprobante(
  $1,  -- id_anfitrion / id_usuario
  $2,  -- documento_id
  $3,  -- periodo
  $4,  -- id_invitado
  $5,  -- fecha
  $6,  -- r_cod origen
  $7,  -- r_serie origen
  $8,  -- r_numero origen
  $9,  -- r_cod_emitir destino
  $10, -- r_serie_emitir destino
  $11, -- r_id_doc cliente
  $12, -- r_documento_id cliente
  $13, -- r_razon_social cliente
  $14, -- r_direccion cliente
  $15, -- efectivo
  $16, -- vuelto
  $17, -- forma_pago2
  $18, -- efectivo2
  $19, -- r_moneda
  $20, -- r_forma_pago_id
  $21  -- dias_credito
)
```

La funcion PSQL devuelve:

```text
r_cod
r_serie
r_numero
elemento
r_fecemi
r_monto_total
```

El frontend usa esa respuesta para abrir el nuevo documento comercial:

```text
/ad_venta/.../:r_cod-:r_serie-:r_numero-:elemento/view
```

Implicancia para presupuestos:

- La nueva funcion deberia devolver exactamente esos campos.
- Debe crear un documento comercial real en `mve_venta`.
- Debe crear detalle real en `mve_ventadet`.
- Luego `AdminSunatIcon` funciona sin cambios porque `/ad_ventacpe` lee esas tablas.

### Detalle de venta: `crearVentaDet()`

Endpoint:

```http
POST /ad_ventadet
```

Controlador:

```js
crearVentaDet()
```

Contrato PSQL:

```sql
SELECT public.fve_ventadetinserta(
  $1,  -- id_anfitrion / id_usuario
  $2,  -- documento_id
  $3,  -- periodo
  $4,  -- r_cod
  $5,  -- r_serie
  $6,  -- r_numero
  $7,  -- elemento
  $8,  -- r_fecemi
  $9,  -- id_producto
  $10, -- descripcion
  $11, -- cantidad
  $12, -- precio_unitario
  $13, -- precio_neto
  $14, -- porc_igv
  $15  -- cont_und
) AS resultado;
```

La funcion retorna booleano en `resultado`.

Aunque no vemos el cuerpo PSQL, por el flujo del sistema se infiere que esta funcion:

- Inserta en `mve_ventadet`.
- Asigna/gestiona `item`.
- Calcula `monto_base`, `igv`, `tipo_igv_codigo` y totales relacionados.
- Recalcula acumulados de `mve_venta`.

Para una funcion presupuestal mas exacta hay dos caminos:

1. Reutilizar internamente `fve_ventadetinserta` por cada trabajo convertido a item.
2. Insertar directamente en `mve_ventadet` replicando su logica, pero esto es mas riesgoso si no tenemos el cuerpo de `fve_ventadetinserta`.

Recomendacion inicial: reutilizar `fve_ventadetinserta` dentro de `fve_presupuesto_generar_comprobante`, salvo que se extraiga y revise el cuerpo exacto de esa funcion.

### Actualizacion y eliminacion de detalle

Contratos:

```sql
SELECT public.fve_ventadetactualiza(
  p_id_usuario,
  p_documento_id,
  p_periodo,
  p_r_cod,
  p_r_serie,
  p_r_numero,
  p_elemento,
  p_item,
  p_descripcion,
  p_cantidad,
  p_precio_unitario,
  p_precio_neto
) AS resultado;
```

```sql
SELECT public.fve_ventadetelimina(
  p_id_usuario,
  p_documento_id,
  p_periodo,
  p_r_cod,
  p_r_serie,
  p_r_numero,
  p_elemento,
  p_item
) AS resultado;
```

Estas funciones refuerzan la idea de que los recalculos viven en PostgreSQL, no en Node.

### Actualizacion de cabecera: `actualizarRegistro()`

Endpoint:

```http
PUT /ad_venta
```

Este endpoint no genera comprobante, solo actualiza un documento existente. Hace dos cosas:

1. Actualiza `mve_ventadet.r_fecemi` para todos los items del documento.
2. Actualiza cabecera `mve_venta`:

```text
r_fecemi
r_id_doc
r_documento_id
r_razon_social
r_direccion
ctrl_mod_us
ctrl_mod
efectivo
forma_pago2
efectivo2
```

Para presupuestos a CPE, estos campos deben quedar ya correctamente seteados al crear el comprobante comercial, evitando una segunda actualizacion.

## Agregar detalle de productos

Frontend:

```js
confirmaGrabarDetalle()
```

Endpoint:

```http
POST /ad_ventadet
```

Payload armado desde el estado `producto`:

```json
{
  "id_anfitrion": "usuario propietario",
  "documento_id": "ruc empresa",
  "periodo": "2026-08",
  "r_cod": "NV",
  "r_serie": "0001",
  "r_numero": "0000003",
  "elemento": 1,
  "r_fecemi": "2026-08-12",
  "id_producto": "PROD001",
  "descripcion": "Producto",
  "cantidad": 1,
  "precio_unitario": 100,
  "precio_neto": 118,
  "porc_igv": 18,
  "cont_und": "NIU"
}
```

Backend:

```text
src/controllers/ventadet.controllers.js -> crearVentaDet()
```

PostgreSQL:

```sql
SELECT public.fve_ventadetinserta(
  p_id_usuario,
  p_documento_id,
  p_periodo,
  p_r_cod,
  p_r_serie,
  p_r_numero,
  p_elemento,
  p_r_fecemi,
  p_id_producto,
  p_descripcion,
  p_cantidad,
  p_precio_unitario,
  p_precio_neto,
  p_porc_igv,
  p_cont_und
) AS resultado;
```

Rol esperado de la funcion PSQL:

- Insertar fila en `mve_ventadet`.
- Calcular bases/IGV del item.
- Recalcular totales del documento en `mve_venta`.

## Modificar cabecera del documento

Frontend:

```js
confirmaModificaComprobante()
```

Endpoint:

```http
PUT /ad_venta
```

Payload:

```json
{
  "id_anfitrion": "usuario propietario",
  "documento_id": "ruc empresa",
  "periodo": "2026-08",
  "id_invitado": "usuario operativo",
  "r_cod": "NV",
  "r_serie": "0001",
  "r_numero": "0000003",
  "elemento": 1,
  "fecha": "2026-08-12",
  "r_id_doc": "6",
  "r_documento_id": "20600000000",
  "r_razon_social": "CLIENTE SAC",
  "r_direccion": "Direccion",
  "efectivo": 100,
  "forma_pago2": "YAPE",
  "efectivo2": 0
}
```

Backend:

```text
src/controllers/venta.controllers.js -> actualizarRegistro()
```

Tablas actualizadas:

```text
mve_ventadet.r_fecemi
mve_venta.r_fecemi
mve_venta.r_id_doc
mve_venta.r_documento_id
mve_venta.r_razon_social
mve_venta.r_direccion
mve_venta.ctrl_mod_us
mve_venta.ctrl_mod
mve_venta.efectivo
mve_venta.forma_pago2
mve_venta.efectivo2
```

## Emitir comprobante comercial desde NV

Este es el punto mas importante para presupuestos.

En `AdminVentaForm.js`, el modal de emision arma `datosEmitir` con:

```text
r_cod_emitir      -> 01, 03, 07, 08, NV
r_serie_emitir    -> serie autorizada del usuario
r_id_doc
r_documento_id
r_razon_social
r_direccion
r_moneda
r_forma_pago_id
dias_credito
efectivo
vuelto
forma_pago2
efectivo2
r_idmotivo_ref
```

Al presionar `GRABAR`:

```js
handleSaveComprobante()
  -> confirmaGrabarComprobante()
```

Endpoint:

```http
POST /ad_ventacomp
```

Payload:

```json
{
  "id_anfitrion": "usuario propietario",
  "documento_id": "ruc empresa",
  "periodo": "2026-08",
  "id_invitado": "usuario operativo",
  "r_cod": "NV",
  "r_serie": "0001",
  "r_numero": "0000003",
  "r_cod_emitir": "01",
  "r_serie_emitir": "F001",
  "r_id_doc": "6",
  "r_documento_id": "20600000000",
  "r_razon_social": "CLIENTE SAC",
  "r_direccion": "Direccion",
  "efectivo": 118,
  "efectivo2": 0,
  "forma_pago2": "YAPE",
  "vuelto": 0,
  "r_moneda": "PEN",
  "r_forma_pago_id": "Contado",
  "dias_credito": 0,
  "r_cod_ref": null,
  "r_serie_ref": null,
  "r_numero_ref": null,
  "r_idmotivo_ref": null
}
```

Backend:

```text
src/controllers/venta.controllers.js -> generarComprobante()
```

Si `r_cod_emitir` no es `07` ni `08`, llama:

```sql
SELECT r_cod, r_serie, r_numero, elemento, r_fecemi, r_monto_total
FROM fve_crear_comprobante(
  p_id_usuario,
  p_documento_id,
  p_periodo,
  p_id_invitado,
  p_fecha,
  p_origen_r_cod,
  p_origen_r_serie,
  p_origen_r_numero,
  p_r_cod_emitir,
  p_r_serie_emitir,
  p_r_id_doc,
  p_r_documento_id,
  p_r_razon_social,
  p_r_direccion,
  p_efectivo,
  p_vuelto,
  p_forma_pago2,
  p_efectivo2,
  p_r_moneda,
  p_r_forma_pago_id,
  p_dias_credito
)
```

Si `r_cod_emitir` es `07` o `08`, llama:

```sql
SELECT r_cod, r_serie, r_numero, elemento, r_fecemi, r_monto_total
FROM fve_crear_comprobante_ref(...)
```

Despues de una emision exitosa, el frontend navega al comprobante generado:

```text
/ad_venta/:id_anfitrion/:id_invitado/:periodo/:documento_id/:nuevo_comprobante/view
```

Donde `nuevo_comprobante` ya es:

```text
01-F001-0000001-1
```

o:

```text
03-B001-0000001-1
```

## Envio SUNAT posterior

Una vez existe el documento comercial real (`01`, `03`, etc.) en `mve_venta + mve_ventadet`, el envio SUNAT usa el flujo existente:

```text
AdminSunatIcon
  -> POST /ad_ventacpe
  -> generarCPEexpertcont()
  -> generaJsonPrevioCPEexpertcont()
  -> https://expertcont-api-sunat.up.railway.app/cpesunat
```

El JSON SUNAT se arma desde:

```text
mve_venta
mve_ventadet
mad_usuario_contabilidad
```

Por eso, para presupuestos, la tarea previa debe ser crear correctamente `mve_ventadet` desde los trabajos presupuestados.

## Implicancia para presupuestos

La funcion PSQL futura no debe enviar directamente a SUNAT.

Debe hacer lo equivalente a una emision comercial:

```text
fve_presupuesto_generar_comprobante(...)
```

Diseno mas compatible con el backend actual:

```text
1. Generar cabecera comercial usando la misma convencion de fve_crear_comprobante.
2. Insertar cada trabajo como item usando la misma convencion de fve_ventadetinserta.
3. Devolver la misma respuesta que fve_crear_comprobante.
```

Si `fve_crear_comprobante` se puede invocar de forma segura desde la nueva funcion, conviene reutilizarla para crear la cabecera y luego reemplazar/insertar detalle desde `mve_ventaserv`. Si no, la nueva funcion debe replicar su contrato y efectos visibles:

```text
mve_venta con r_cod/r_serie/r_numero/elemento nuevo
mve_ventadet con items facturables
mve_venta.r_monto_total y bases tributarias recalculadas
respuesta: r_cod, r_serie, r_numero, elemento, r_fecemi, r_monto_total
```

Responsabilidad propuesta:

1. Recibir clave del presupuesto `NV` origen.
2. Validar que exista y este registrado.
3. Validar que tenga trabajos en `mve_ventaserv`.
4. Generar correlativo para `01` o `03` usando la serie seleccionada/autorizada.
5. Insertar nueva cabecera en `mve_venta` para el CPE comercial.
6. Copiar datos comerciales desde el presupuesto:
   - cliente
   - direccion
   - moneda
   - forma de pago
   - glosa
   - fechas
   - totales o recalcular desde items
7. Insertar en `mve_ventadet` una linea por cada trabajo de `mve_ventaserv`.
8. No insertar recursos internos de `mve_ventaservdet` como lineas facturables.
9. Guardar referencia al presupuesto origen.
10. Recalcular totales del nuevo comprobante.
11. Retornar:

```text
r_cod
r_serie
r_numero
elemento
r_fecemi
r_monto_total
```

Con eso el frontend puede abrir el documento comercial generado y usar `AdminSunatIcon` sin cambios.

## Boceto PSQL mas preciso

Nombre sugerido:

```sql
fve_presupuesto_generar_comprobante(
  p_id_usuario varchar,
  p_documento_id varchar,
  p_periodo varchar,
  p_id_invitado varchar,
  p_fecha date,
  p_origen_r_cod varchar,
  p_origen_r_serie varchar,
  p_origen_r_numero varchar,
  p_origen_elemento integer,
  p_r_cod_emitir varchar,
  p_r_serie_emitir varchar,
  p_r_id_doc varchar,
  p_r_documento_id varchar,
  p_r_razon_social varchar,
  p_r_direccion varchar,
  p_efectivo numeric,
  p_vuelto numeric,
  p_forma_pago2 varchar,
  p_efectivo2 numeric,
  p_r_moneda varchar,
  p_r_forma_pago_id varchar,
  p_dias_credito integer
)
RETURNS TABLE (
  r_cod varchar,
  r_serie varchar,
  r_numero varchar,
  elemento integer,
  r_fecemi date,
  r_monto_total numeric
)
```

Flujo interno recomendado:

```text
BEGIN
  1. SELECT presupuesto origen FROM mve_venta
     WHERE clave = NV origen
       AND registrado = 1.

  2. Validar que no este ya facturado o vinculado.

  3. SELECT trabajos FROM mve_ventaserv
     WHERE clave = NV origen
       AND registrado = 1
     ORDER BY servicio.

  4. Validar que existan trabajos.

  5. Crear cabecera comercial destino:
     opcion A: llamar fve_crear_comprobante(...)
     opcion B: insertar mve_venta usando fct_genera_venta(...)

  6. Por cada trabajo, insertar item facturable:
     preferido: llamar fve_ventadetinserta(...)
     parametros derivados del trabajo.

  7. Guardar relacion presupuesto -> CPE.

  8. Retornar clave y total del comprobante destino.
END
```

Parametros de `fve_ventadetinserta` desde trabajo:

```text
p_id_usuario      <- presupuesto.id_usuario
p_documento_id    <- presupuesto.documento_id
p_periodo         <- periodo destino
p_r_cod           <- CPE.r_cod
p_r_serie         <- CPE.r_serie
p_r_numero        <- CPE.r_numero
p_elemento        <- CPE.elemento
p_r_fecemi        <- fecha destino
p_id_producto     <- codigo generico de servicio
p_descripcion     <- mve_ventaserv.descripcion
p_cantidad        <- mve_ventaserv.cantidad
p_precio_unitario <- total/precio por unidad del trabajo
p_precio_neto     <- mve_ventaserv.r_monto_total
p_porc_igv        <- 18 o porcentaje consolidado
p_cont_und        <- unidad de servicio
```

Punto pendiente antes de escribir SQL final:

```text
Confirmar el cuerpo real de fve_ventadetinserta para saber si precio_neto espera importe con IGV, sin IGV, o total comercial.
```

Por el frontend actual, `precio_neto` se calcula como `cantidad * precio_unitario` y luego PostgreSQL calcula bases/IGV. Para trabajos, si `r_monto_total` ya representa total con IGV, hay que mapearlo igual que lo espera `fve_ventadetinserta`.

## Evidencia de datos reales de venta

Ejemplo revisado:

```text
Factura: 01-F001-0000070-1
Cantidad: 30
Precio unitario: 4.33
Precio neto: 129.80
Monto base: 3.666667
IGV: 0.66
Porc IGV: 18
```

Cabecera:

```text
r_base002     = 110.00
r_igv002      = 19.80
r_monto_total = 129.80
```

Detalle:

```text
cantidad        = 30.00
precio_unitario = 4.33
precio_neto     = 129.80
monto_base      = 3.666667
igv             = 0.66
tipo_igv_codigo = 10
```

Lectura importante:

```text
precio_neto es el total de la linea con IGV.
monto_base es base unitaria sin IGV.
igv es IGV unitario.
```

Validacion:

```text
monto_base * cantidad = 3.666667 * 30 = 110.00 aprox.
igv * cantidad        = 0.66 * 30      = 19.80
precio_neto           = 129.80
```

`precio_unitario` parece ser el precio unitario comercial con IGV, redondeado para presentacion. No necesariamente sirve para reconstruir el total exacto porque:

```text
4.33 * 30 = 129.90
```

pero el total real de la linea es:

```text
precio_neto = 129.80
```

Conclusion para presupuestos:

```text
Para generar mve_ventadet desde mve_ventaserv, el valor critico debe ser precio_neto = total comercial del trabajo.
precio_unitario puede ser total/cantidad redondeado, pero no debe ser la fuente unica de verdad.
```

Mapeo recomendado para un trabajo afecto a IGV:

```text
cantidad        <- trabajo.cantidad, minimo 1
precio_neto     <- trabajo.r_monto_total
precio_unitario <- trabajo.r_monto_total / cantidad
porc_igv        <- 18
cont_und        <- unidad de servicio
```

Si se inserta directamente en `mve_ventadet` sin usar `fve_ventadetinserta`, entonces calcular:

```text
base_total   = precio_neto / 1.18
igv_total    = precio_neto - base_total
monto_base   = base_total / cantidad
igv          = igv_total / cantidad
r_base002    = SUM(monto_base * cantidad)
r_igv002     = SUM(igv * cantidad)
r_monto_total = SUM(precio_neto)
```

Pero la opcion preferida sigue siendo reutilizar `fve_ventadetinserta`, porque esa funcion ya aplica la regla oficial de calculo y redondeo.

## Mapeo base: trabajos a detalle facturable

Origen:

```text
mve_ventaserv
```

Destino:

```text
mve_ventadet
```

Mapeo inicial sugerido:

```text
item              -> correlativo
id_producto       -> codigo generico de servicio o codigo definido por negocio
descripcion       -> mve_ventaserv.descripcion
cantidad          -> mve_ventaserv.cantidad
precio_unitario   -> base / cantidad, si aplica
precio_neto       -> total comercial del servicio
monto_base        -> base gravada/exonerada consolidada del servicio
igv               -> igv consolidado del servicio
porc_igv          -> 18 o valor del servicio
cont_und          -> unidad de servicio
tipo_igv_codigo   -> tipo IGV del servicio, default 10
```

Si un trabajo tiene mezcla de afecto/exonerado/gratuito, la funcion debe respetar los campos tributarios consolidados del trabajo o dividir lineas segun corresponda.

## Campos de referencia al presupuesto

El documento CPE generado debe conservar referencia al presupuesto `NV`.

La estructura real de `mve_venta` confirma que ya existen campos para vincular pedidos facturados:

```text
fact_cod    -- Solo para pedidos facturados
fact_serie  -- Solo para pedidos facturados
fact_num    -- Solo para pedidos facturados
```

Decision recomendada:

```text
En el presupuesto NV origen, guardar la clave del CPE generado:
fact_cod    = CPE.r_cod
fact_serie  = CPE.r_serie
fact_num    = CPE.r_numero
```

No usar `r_cod_ref`, `r_serie_ref`, `r_numero_ref` para este caso porque esos campos pertenecen al mecanismo de notas de credito/debito y documentos relacionados SUNAT.

Regla recomendada:

```text
El presupuesto origen no se borra ni cambia su PK.
El presupuesto origen queda marcado con fact_cod/fact_serie/fact_num.
El CPE nuevo vive como documento comercial normal en mve_venta + mve_ventadet.
```

## Estructura relevante de mve_venta

Clave primaria:

```text
id_usuario
documento_id
periodo
r_cod
r_serie
r_numero
elemento
```

La tabla esta particionada por rango de `periodo`.

Campos relevantes para CPE comercial:

```text
r_fecemi
r_fecvcto
glosa
debe
haber
debe_me
haber_me
ctrl_crea
ctrl_crea_us
ctrl_mod
ctrl_mod_us
r_id_doc
r_documento_id
r_razon_social
r_direccion
r_vfirmado
r_base001
r_base002
r_base003
r_base004
r_base_desc
r_base_ivap
r_igv002
r_igv_desc
r_igv_ivap
r_monto_isc
r_monto_icbp
r_monto_otros
r_monto_total
r_moneda
r_tc
efectivo
vuelto
forma_pago2
efectivo2
r_base_gratuita
cdr_descripcion
cdr_pendiente
registrado
r_forma_pago_id
dias_credito
r_total_gratuito
cdr_codigo
cdr_nivel
```

Campos relevantes para presupuesto:

```text
contacto_nombre
contacto_celular
estado -- P = Pendiente Presupuesto, C = Cerrado Presupuesto
fact_cod
fact_serie
fact_num
```

Para el nuevo CPE generado desde presupuesto:

```text
r_cod      = '01' o '03'
r_serie    = serie autorizada
r_numero   = correlativo nuevo
elemento   = 1
registrado = 1
r_vfirmado = null hasta envio SUNAT
cdr_*      = null hasta envio SUNAT
```

Para el presupuesto origen:

```text
r_cod      = 'NV'
r_serie    = '0001'
elemento   = 1
estado     = se conserva
fact_cod   = CPE.r_cod
fact_serie = CPE.r_serie
fact_num   = CPE.r_numero
```

## Estructura relevante de mve_ventadet

Clave primaria:

```text
id_usuario
documento_id
periodo
r_cod
r_serie
r_numero
elemento
item
```

La tabla esta particionada por rango de `periodo`.

Campos obligatorios:

```text
id_usuario
documento_id
periodo
r_cod
r_serie
r_numero
elemento
item
id_producto
```

Campos comerciales/tributarios:

```text
r_fecemi
id_almacen
descripcion
cont_und
cantidad
peso_neto
precio_unitario
monto_base
igv
precio_neto
porc_igv
no_kardex
registrado
estado
moneda
tipo_igv_codigo
```

Campos extra actualmente disponibles para presupuestos/procesos:

```text
pp_descripcion2
pp_largo
pp_ancho
pp_utilidad
pp_horas
pp_dias
```

Codigos `tipo_igv_codigo`:

```text
10 = IGV
20 = Exonerado
30 = Inafecto
21 = Gratuito
```

Implicancia para presupuesto:

- `mve_ventadet` ya tiene campos `pp_*`, utiles para conservar algo de informacion productiva del trabajo si se necesita en la factura/PDF.
- Para SUNAT, los campos criticos siguen siendo descripcion, cantidad, unidad, precio/base/igv/tipo IGV.
- `id_producto` es NOT NULL, por lo que la generacion desde servicios debe asignar un codigo. Para este flujo se usara el comodin interno `'0000'` como producto varios/servicio generico. Este valor es codigo local de `mve_ventadet`, no codigo SUNAT.

Mapeo final sugerido desde `mve_ventaserv`:

```text
id_usuario       <- presupuesto.id_usuario
documento_id     <- presupuesto.documento_id
periodo          <- periodo destino
r_cod            <- CPE.r_cod
r_serie          <- CPE.r_serie
r_numero         <- CPE.r_numero
elemento         <- CPE.elemento
item             <- correlativo por trabajo
id_producto      <- '0000'
r_fecemi         <- CPE.r_fecemi
descripcion      <- trabajo.descripcion
cont_und         <- unidad de servicio
cantidad         <- trabajo.cantidad, minimo 1
precio_unitario  <- trabajo.r_monto_total / cantidad, redondeado
precio_neto      <- trabajo.r_monto_total
porc_igv         <- 18 o valor consolidado
tipo_igv_codigo  <- trabajo.tipo_igv_codigo o '10'
registrado       <- 1
moneda           <- presupuesto.r_moneda
pp_descripcion2  <- trabajo.especificacion
pp_utilidad      <- trabajo.utilidad
```

Si se usa `fve_ventadetinserta`, solo se envian:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento,
r_fecemi, id_producto, descripcion, cantidad, precio_unitario,
precio_neto, porc_igv, cont_und
```

y luego, si se desea, se podria actualizar los campos `pp_*` del item insertado.

Nota sobre codigo SUNAT:

```text
id_producto = '0000' es solo comodin interno.
codigo_sunat en el JSON CPE puede seguir como '-' mientras el rubro/obligacion no exija codificacion SUNAT especifica.
```

Si se inserta directo, se debe poblar explicitamente:

```text
item
monto_base
igv
tipo_igv_codigo
registrado
```

Por compatibilidad, se mantiene como opcion preferida usar `fve_ventadetinserta` para que PostgreSQL aplique la regla vigente de calculo/redondeo.

## Endpoint backend sugerido

Crear un endpoint que solo genere el comprobante comercial desde presupuesto:

```http
POST /ad_presupuesto/comprobante
```

Payload sugerido:

```json
{
  "id_anfitrion": "usuario propietario",
  "documento_id": "ruc empresa",
  "periodo": "2026-08",
  "id_invitado": "usuario operativo",
  "origen": {
    "r_cod": "NV",
    "r_serie": "0001",
    "r_numero": "0000003",
    "elemento": 1
  },
  "destino": {
    "r_cod_emitir": "01",
    "r_serie_emitir": "F001"
  },
  "cliente": {
    "r_id_doc": "6",
    "r_documento_id": "20600000000",
    "r_razon_social": "CLIENTE SAC",
    "r_direccion": "Direccion"
  },
  "pago": {
    "r_moneda": "PEN",
    "r_forma_pago_id": "Contado",
    "dias_credito": 0,
    "efectivo": 118,
    "vuelto": 0,
    "forma_pago2": "YAPE",
    "efectivo2": 0
  }
}
```

Backend llamaria:

```sql
SELECT *
FROM fve_presupuesto_generar_comprobante($1::jsonb)
```

o con parametros planos si se prefiere mantener el estilo actual.

## Decision de diseno

No modificar `AdminSunatIcon` para presupuestos.

Primero generar un documento comercial normal desde el presupuesto. Luego usar el flujo actual de ventas para SUNAT.
