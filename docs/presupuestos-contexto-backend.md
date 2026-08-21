# Contexto backend - Presupuestos y generacion comercial

Este documento es la guia backend vigente para el modulo de presupuestos de XpertCont.

## Regla documental vigente

- Un presupuesto se guarda como documento `NV` en `mve_venta`.
- La clave del presupuesto es `id_usuario`, `documento_id`, `periodo`, `r_cod`, `r_serie`, `r_numero`, `elemento`.
- Para presupuestos se usa `r_cod = 'NV'`, `r_serie = '0001'`, `elemento = 1`.
- `estado = 'P'` significa pendiente.
- `estado = 'C'` significa cerrado.
- El presupuesto no se convierte en factura cambiando su PK.
- Al generar factura/boleta desde presupuesto se crea un nuevo documento comercial en `mve_venta + mve_ventadet`.
- El presupuesto origen queda marcado con `fact_cod`, `fact_serie`, `fact_num`.

## Tablas

### Estructura real resumida

Las cuatro tablas relevantes estan particionadas por rango de `periodo`.

`mve_venta` es cabecera para presupuestos, facturas y boletas. PK:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento
```

Columnas reales relevantes:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento,
r_fecemi, r_fecvcto, glosa,
debe, haber, debe_me, haber_me,
ctrl_crea, ctrl_crea_us, ctrl_mod, ctrl_mod_us,
r_id_doc, r_documento_id, r_razon_social, r_direccion,
r_vfirmado,
r_cod_ref, r_serie_ref, r_numero_ref, r_fecemi_ref, r_fecvcto_ref,
r_base001, r_base002, r_base003, r_base004,
r_base_desc, r_base_ivap, r_igv002, r_igv_desc, r_igv_ivap,
r_monto_isc, r_monto_icbp, r_monto_otros, r_monto_total,
r_moneda, r_tc, r_idmotivo_ref,
efectivo, vuelto, forma_pago2, efectivo2,
r_base_gratuita,
gre_vfirmado, gre_cod, gre_serie, gre_numero,
cdr_descripcion, id_almacen, cdr_pendiente, registrado,
r_forma_pago_id,
fact_cod, fact_serie, fact_num,
dias_credito, r_total_gratuito,
cdr_codigo, cdr_nivel,
contacto_nombre, contacto_celular,
estado
```

`mve_ventadet` es detalle facturable para factura/boleta comercial. PK:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, item
```

Columnas reales relevantes:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, item,
id_producto, r_fecemi, fecha_descarga, id_almacen,
descripcion, cont_und, cantidad, peso_neto,
precio_unitario, monto_base, igv, precio_neto, porc_igv,
no_kardex, registrado, estado, moneda, tipo_igv_codigo,
pp_descripcion2, pp_largo, pp_ancho, pp_utilidad, pp_horas, pp_dias
```

`mve_ventaserv` es detalle de trabajos/servicios del presupuesto. PK:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, servicio
```

Columnas reales relevantes:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, servicio,
r_fecemi, r_fecvcto, origen,
id_producto, descripcion, especificacion, cont_und,
cantidad, precio_unitario, monto_base, igv, precio_neto, porc_igv,
ctrl_crea, ctrl_crea_us, ctrl_mod, ctrl_mod_us,
r_base001, r_base002, r_base003, r_base004, r_igv002,
r_monto_total, r_moneda, r_tc,
r_base_gratuita, r_total_gratuito,
registrado, utilidad
```

`mve_ventaservdet` es costeo interno por trabajo. PK:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, servicio, item
```

Columnas reales relevantes:

```text
id_usuario, documento_id, periodo, r_cod, r_serie, r_numero, elemento, servicio, item,
r_fecemi, id_producto, descripcion, cont_und,
cantidad, peso_neto, precio_unitario, monto_base, igv, precio_neto, porc_igv,
no_kardex, registrado, estado, moneda, tipo_igv_codigo,
largo, ancho, utilidad, horas, dias
```

### Factura o boleta comercial

```text
mve_venta
  -> mve_ventadet
```

`mve_venta` contiene la cabecera comercial y SUNAT. Campos clave:

- `r_cod`: `01` factura, `03` boleta, `NV` nota/presupuesto interno.
- `r_serie`, `r_numero`, `elemento`.
- Cliente: `r_id_doc`, `r_documento_id`, `r_razon_social`, `r_direccion`.
- Totales: `r_base002`, `r_igv002`, `r_monto_total`, `debe`, `efectivo`, `efectivo2`.
- SUNAT: `r_vfirmado`, `cdr_codigo`, `cdr_descripcion`, `cdr_nivel`, `cdr_pendiente`.

`mve_ventadet` contiene items facturables. Campos clave:

- `item`, `id_producto`, `descripcion`, `cont_und`.
- `cantidad`, `precio_unitario`, `precio_neto`.
- `monto_base`, `igv`, `porc_igv`, `tipo_igv_codigo`.
- Campos productivos opcionales: `pp_descripcion2`, `pp_largo`, `pp_ancho`, `pp_utilidad`, `pp_horas`, `pp_dias`.

Regla confirmada por JSON real de factura:

- `precio_neto` es el total de la linea con IGV.
- `monto_base` es base unitaria sin IGV.
- `igv` es IGV unitario.
- Ejemplo real: cantidad `30`, precio unitario `4.33`, precio neto `129.80`, monto base unitario `3.666667`, IGV unitario `0.66`.

### Presupuesto de servicios

```text
mve_venta
  -> mve_ventaserv
      -> mve_ventaservdet
```

`mve_ventaserv` contiene trabajos o servicios visibles del presupuesto:

- `servicio`: correlativo del trabajo.
- `id_producto`, `descripcion`, `especificacion`, `cont_und`.
- `cantidad`, `precio_unitario`, `precio_neto`, `porc_igv`.
- Consolidados: `r_base002`, `r_igv002`, `r_monto_total`, `r_moneda`.
- `utilidad`: porcentaje/margen usado por el costeo.

`mve_ventaservdet` contiene recursos internos de costeo:

- Materiales, operarios, servicios, viaticos o tercerizaciones.
- Usa campos como `largo`, `ancho`, `horas`, `dias`, `utilidad`.
- No debe convertirse en lineas facturables, salvo que se defina otro modo de facturacion.

## Transformacion presupuesto a factura

La transformacion correcta es:

```text
Presupuesto:
mve_venta NV
  -> mve_ventaserv
      -> mve_ventaservdet

Genera:
mve_venta 01/03
  -> mve_ventadet
```

Mapeo principal:

```text
mve_ventaserv.id_producto      -> mve_ventadet.id_producto
mve_ventaserv.descripcion      -> mve_ventadet.descripcion
mve_ventaserv.especificacion   -> mve_ventadet.pp_descripcion2
mve_ventaserv.cont_und         -> mve_ventadet.cont_und
mve_ventaserv.cantidad         -> mve_ventadet.cantidad
mve_ventaserv.r_monto_total    -> mve_ventadet.precio_neto
mve_ventaserv.r_moneda         -> mve_ventadet.moneda
mve_ventaserv.utilidad         -> mve_ventadet.pp_utilidad
```

Si `id_producto` esta vacio, usar comodin local configurado por parametro, por defecto `0000`.

## Funcion PostgreSQL

Archivo de referencia:

```text
docs/sql/fve_presupuesto_generar_comprobante.sql
```

Funcion:

```text
fve_presupuesto_generar_comprobante(...)
```

Firma vigente:

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
  p_efectivo numeric DEFAULT NULL,
  p_vuelto numeric DEFAULT 0,
  p_forma_pago2 varchar DEFAULT NULL,
  p_efectivo2 numeric DEFAULT 0,
  p_r_moneda varchar DEFAULT 'PEN',
  p_r_forma_pago_id varchar DEFAULT 'Contado',
  p_dias_credito integer DEFAULT 0,
  p_id_producto varchar DEFAULT '0000',
  p_cont_und_default varchar DEFAULT 'ZZ'
)
RETURNS TABLE (r_cod varchar, r_serie varchar, r_numero varchar, elemento integer, r_fecemi date, r_monto_total numeric)
```

Responsabilidad:

1. Validar que el origen sea `NV`.
2. Buscar y bloquear el presupuesto origen.
3. Si ya tiene `fact_cod/fact_serie/fact_num`, devolver el comprobante existente.
4. Validar que tenga trabajos facturables en `mve_ventaserv`.
5. Validar la serie autorizada en `mad_seguridad_serie`.
6. Generar correlativo con `fve_genera01_correl`.
7. Insertar una cabecera nueva en `mve_venta` para `01/03`.
8. Insertar un item en `mve_ventadet` por cada trabajo de `mve_ventaserv`, usando `fve_ventadetinserta`.
9. Actualizar metadata productiva `pp_*` en `mve_ventadet`.
10. Reforzar pagos/totales de cabecera y confirmar correlativo con `fve_genera02_correl`.
11. Marcar el presupuesto origen con `fact_cod/fact_serie/fact_num`.
12. Retornar la clave del comprobante generado.

La funcion no envia a SUNAT.

Importante: no usa `fve_crear_comprobante`, porque esa funcion comercial cambia la PK del documento origen. En presupuestos de servicios el `NV` debe quedar intacto.

### Funciones relacionadas

`fve_crear_comprobante(...)` existe, pero no se usa para presupuestos de servicios. Su comportamiento comercial es:

- Valida serie en `mad_seguridad_serie`.
- Genera correlativo con `fve_genera01_correl`.
- Actualiza `mve_ventadet` cambiando `r_cod`, `r_serie`, `r_numero`.
- Actualiza `mve_venta` cambiando la PK del documento origen.
- Confirma correlativo con `fve_genera02_correl`.

Por eso es correcta para convertir un pedido comercial con productos, pero no para presupuestos de servicios.

`fve_ventadetinserta(...)` se reutiliza para insertar items facturables y recalcular totales:

```sql
fve_ventadetinserta(
  p_id_usuario varchar,
  p_documento_id varchar,
  p_periodo varchar,
  p_r_cod varchar,
  p_r_serie varchar,
  p_r_numero varchar,
  p_elemento numeric,
  p_r_fecemi varchar,
  p_id_producto varchar,
  p_descripcion varchar,
  p_cantidad numeric,
  p_precio_unitario numeric,
  p_precio_neto numeric,
  p_porc_igv numeric,
  p_cont_und varchar
)
RETURNS boolean
```

Detalles importantes de `fve_ventadetinserta`:

- `p_r_fecemi` debe enviarse como `varchar` formato `YYYY-MM-DD`.
- `p_elemento` debe enviarse como `numeric`.
- Calcula `monto_base` unitario e `igv` unitario.
- Inserta en `mve_ventadet`.
- Llama a `fve_ventadet_rtotales(...)`.

Ultimas correcciones aplicadas al SQL:

- Alias explicitos en `mve_venta` para evitar ambiguedad con columnas de `RETURNS TABLE`.
- Casts explicitos al llamar `fve_ventadetinserta`: `elemento::numeric`, `TO_CHAR(r_fecemi, 'YYYY-MM-DD')::varchar`, `id_producto::varchar`, `descripcion::varchar`, `cont_und::varchar`.

## Endpoints Node

Archivos:

```text
src/controllers/presupuesto.controllers.js
src/routes/presupuesto.routes.js
```

Endpoints de presupuesto:

```text
POST   /ad_presupuesto
GET    /ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:dia
GET    /ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
GET    /ad_presupuesto/full/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
PUT    /ad_presupuesto
DELETE /ad_presupuesto/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
```

Endpoints de trabajos:

```text
GET    /ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
POST   /ad_presupuestoserv
POST   /ad_presupuestoserv/clonar
PUT    /ad_presupuestoserv
DELETE /ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio
```

Endpoints de recursos:

```text
GET    /ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio
POST   /ad_presupuestoservdet
PUT    /ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio/:item
DELETE /ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio/:item
```

Endpoint de generacion comercial desde presupuesto:

```text
POST /ad_presupuesto/comprobante
```

Payload recomendado:

```json
{
  "id_anfitrion": "usuario propietario",
  "documento_id": "ruc empresa",
  "periodo": "2026-08",
  "id_invitado": "usuario operativo",
  "fecha": "2026-08-13",
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
    "forma_pago2": null,
    "efectivo2": 0
  }
}
```

Respuesta esperada:

```json
{
  "success": true,
  "r_cod": "01",
  "r_serie": "F001",
  "r_numero": "0000001",
  "elemento": 1,
  "r_fecemi": "2026-08-13",
  "r_monto_total": "118.00"
}
```

## Flujo SUNAT

Despues de crear el documento comercial `01/03`, se usa el flujo existente:

```text
AdminSunatIcon
  -> POST /ad_ventacpe
  -> generarCPEexpertcont()
  -> generaJsonPrevioCPEexpertcont()
  -> API SUNAT externa
```

`/ad_ventacpe` trabaja sobre `mve_venta + mve_ventadet`, por eso la transformacion previa es necesaria.

## Pendientes tecnicos

- Probar `fve_presupuesto_generar_comprobante(...)` contra un presupuesto real en PostgreSQL.
- Confirmar que existe el producto comodin `0000` o definir otro `id_producto` valido.
- Probar `POST /ad_presupuesto/comprobante` con un presupuesto real.
- Validar que `fact_cod/fact_serie/fact_num` quede grabado en el `NV`.
- Validar que el documento generado abra en el flujo normal de ventas.
- Luego conectar el boton frontend `Generar CPE` a este endpoint.

## Handoff inmediato

Estado al cierre de esta etapa:

- Backend Node ya tiene endpoint `POST /ad_presupuesto/comprobante`.
- La funcion PSQL fuente esta en `docs/sql/fve_presupuesto_generar_comprobante.sql`.
- La funcion PSQL fue ajustada para no usar `fve_crear_comprobante`.
- La funcion PSQL inserta una cabecera nueva `01/03` y deja intacto el `NV`.
- Se corrigio la ambiguedad de columnas causada por `RETURNS TABLE`.
- Se corrigio la llamada a `fve_ventadetinserta` usando casts explicitos.
- Backend fue pusheado antes del ultimo ajuste de contexto en commit `0ceb2fd Agregar generacion comercial desde presupuestos`.

Siguiente paso tecnico:

1. Probar la funcion PSQL en PostgreSQL con `BEGIN` y `ROLLBACK`.
2. Si genera correctamente `mve_venta 01/03 + mve_ventadet`, probar el endpoint.
3. Si el endpoint responde bien, implementar UI en frontend.

Siguiente paso UI:

- Crear modal de emision desde presupuesto.
- Elegir `01` factura o `03` boleta.
- Elegir serie autorizada.
- Enviar payload a `POST /ad_presupuesto/comprobante`.
- Navegar al comprobante generado en `/ad_venta/...`.
