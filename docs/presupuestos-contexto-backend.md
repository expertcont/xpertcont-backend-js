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

- Ejecutar `docs/sql/fve_presupuesto_generar_comprobante.sql` en PostgreSQL real.
- Confirmar que existe el producto comodin `0000` o definir otro `id_producto` valido.
- Probar `POST /ad_presupuesto/comprobante` con un presupuesto real.
- Validar que `fact_cod/fact_serie/fact_num` quede grabado en el `NV`.
- Validar que el documento generado abra en el flujo normal de ventas.
- Luego conectar el boton frontend `Generar CPE` a este endpoint.
