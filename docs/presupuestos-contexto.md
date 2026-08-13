# Contexto backend - Modulo de Presupuestos / Servicios

> Nota: este documento queda como contexto historico inicial. Para reglas vigentes del modulo usar `docs/presupuestos-spec.md`.

## Objetivo

Se creo un modulo backend separado para presupuestos porque `venta.controllers.js` ya esta muy grande.

El modulo de presupuestos da soporte a documentos comerciales tipo pedido/presupuesto (`NP`) que pueden tener uno o varios servicios, y cada servicio puede tener su propio detalle de costeo.

La estructura general es:

```text
mve_venta
  -> mve_ventaserv
      -> mve_ventaservdet
```

## Regla principal

Node.js no debe calcular impuestos ni totales tributarios.

Toda la logica tributaria vive en PostgreSQL. El backend solo debe:

- Validar parametros minimos.
- Invocar funciones PostgreSQL.
- Consultar tablas para listar datos.
- Devolver respuestas al frontend.

Las fuentes oficiales de importes son:

- `mve_ventaserv`: resumen tributario oficial por servicio.
- `mve_venta`: resumen tributario oficial del documento completo.

Nunca se deben recalcular totales desde React ni desde Node.js leyendo el detalle.

## Convencion de usuarios

En los payloads del backend se recibe `id_anfitrion` para identificar al usuario propietario de la cuenta o empresa.

En PostgreSQL y en las tablas historicas ese mismo dato se mantiene como `id_usuario`.

Tambien existe `id_invitado`, que representa al usuario operativo dentro de la cuenta del anfitrion.

Resumen:

```text
API/backend: id_anfitrion
BD/tablas:   id_usuario
Operador:    id_invitado
```

## Flujo de negocio

```text
Crear pedido base
  -> mve_venta

Crear servicio
  -> mve_ventaserv

Agregar item de costeo
  -> fve_ventaservdet_inserta()
      -> inserta en mve_ventaservdet
      -> ejecuta fve_ventaservdet_rtotales()
          -> actualiza mve_ventaserv
          -> ejecuta fve_ventaserv_rtotales()
              -> actualiza mve_venta
```

## Funciones PostgreSQL relevantes

### fve_crear_pedido

Ya esta consumida por el endpoint existente de ventas:

```text
POST /ad_venta
```

Controller existente:

```text
venta.controllers.js -> generarRegistro()
```

Firma:

```sql
fve_crear_pedido(
  p_id_usuario varchar,
  p_documento_id varchar,
  p_periodo varchar,
  p_id_invitado varchar,
  p_fecha date
)
RETURNS TABLE (
  r_numero varchar,
  r_fecemi date,
  r_monto_total numeric
)
```

Esta funcion crea u obtiene el documento base `NP` en `mve_venta`. No se duplico en el modulo de presupuesto.

### fve_crear_servicio

Crea un servicio vacio asociado al documento.

Firma:

```sql
fve_crear_servicio(
  p_id_usuario varchar,
  p_documento_id varchar,
  p_periodo varchar,
  p_r_cod varchar,
  p_r_serie varchar,
  p_r_numero varchar,
  p_elemento integer,
  p_id_invitado varchar,
  p_fecha date
)
RETURNS TABLE (
  servicio integer,
  descripcion varchar,
  precio_neto numeric
)
```

Responsabilidades:

- Obtener el siguiente correlativo `servicio`.
- Insertar en `mve_ventaserv`.
- Inicializar importes en cero.
- Crear el servicio con `origen = 'R'`.

### fve_ventaservdet_inserta

Inserta un item de costeo dentro de un servicio.

Firma:

```sql
fve_ventaservdet_inserta(
  p_id_usuario varchar,
  p_documento_id varchar,
  p_periodo varchar,
  p_r_cod varchar,
  p_r_serie varchar,
  p_r_numero varchar,
  p_elemento numeric,
  p_servicio numeric,
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

Responsabilidades:

- Calcular `monto_base`.
- Calcular `igv`.
- Determinar `tipo_igv_codigo`.
- Obtener `no_kardex` desde `mst_producto`.
- Insertar en `mve_ventaservdet`.
- Ejecutar internamente `fve_ventaservdet_rtotales()`.

### fve_ventaservdet_rtotales

Funcion interna de PostgreSQL.

No debe exponerse como endpoint normal.

Responsabilidades:

- Consolidar los detalles de un servicio.
- Actualizar los campos tributarios en `mve_ventaserv`.
- Ejecutar internamente `fve_ventaserv_rtotales()`.

### fve_ventaserv_rtotales

Funcion interna de PostgreSQL.

No debe exponerse como endpoint normal.

Responsabilidades:

- Consolidar todos los servicios del documento.
- Actualizar los campos tributarios de `mve_venta`.
- Ajustar `debe`, `efectivo` y `efectivo2` segun el total del documento.

## Archivos backend creados

```text
src/controllers/presupuesto.controllers.js
src/routes/presupuesto.routes.js
```

Tambien se registro la ruta en:

```text
app.js
```

## Endpoints actuales

## Ambiente de pruebas Railway

URL base usada para pruebas:

```text
https://xpertcont-backend-js-production-50e6.up.railway.app
```

Datos iniciales reales para pruebas frontend/backend:

```json
{
  "id_anfitrion": "aguirre.roberto1711@gmail.com",
  "id_usuario": "aguirre.roberto1711@gmail.com",
  "documento_id": "20455026602",
  "periodo": "2026-08",
  "id_invitado": "ovivasar@gmail.com",
  "fecha": "2026-08-05",
  "r_cod": "NP",
  "r_serie": "0001",
  "r_numero": "0000001",
  "elemento": 1,
  "servicio": 1
}
```

### Prueba 1: Crear u obtener pedido base

Endpoint existente de ventas:

```text
POST /ad_venta
```

Payload:

```json
{
  "id_anfitrion": "aguirre.roberto1711@gmail.com",
  "documento_id": "20455026602",
  "periodo": "2026-08",
  "id_invitado": "ovivasar@gmail.com",
  "fecha": "2026-08-05"
}
```

Respuesta obtenida en Railway:

```json
{
  "success": true,
  "r_numero": "0000001",
  "r_fecemi": "2026-08-05T00:00:00.000Z",
  "r_monto_total": "0.00"
}
```

Nota: si se vuelve a consumir el mismo endpoint con los mismos datos, `fve_crear_pedido()` devuelve el pedido existente en vez de crear otro, porque busca el `NP` abierto por `ctrl_crea_us`.

### Prueba 2: Crear servicio

Endpoint:

```text
POST /ad_presupuestoserv
```

Payload:

```json
{
  "id_anfitrion": "aguirre.roberto1711@gmail.com",
  "documento_id": "20455026602",
  "periodo": "2026-08",
  "r_cod": "NP",
  "r_serie": "0001",
  "r_numero": "0000001",
  "elemento": 1,
  "id_invitado": "ovivasar@gmail.com",
  "fecha": "2026-08-05"
}
```

Respuesta obtenida en Railway:

```json
{
  "success": true,
  "servicio": 1,
  "descripcion": "NUEVO SERVICIO",
  "precio_neto": "0.00"
}
```

Se crearon particiones para las tablas nuevas antes de esta prueba:

```text
mve_ventaserv
mve_ventaservdet
```

Rango usado por el proyecto:

```text
2025-01 hasta 2035-12
```

### Listar servicios de un presupuesto

```text
GET /ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
```

Controller:

```text
obtenerServiciosPresupuesto
```

Lee:

```text
mve_ventaserv
```

Devuelve:

```json
{
  "success": true,
  "data": []
}
```

### Crear servicio

```text
POST /ad_presupuestoserv
```

Controller:

```text
crearServicioPresupuesto
```

Invoca:

```sql
fve_crear_servicio(...)
```

Payload esperado:

```json
{
  "id_anfitrion": "USER01",
  "documento_id": "20123456789",
  "periodo": "2026-08",
  "r_cod": "NP",
  "r_serie": "0001",
  "r_numero": "00000001",
  "elemento": 1,
  "id_invitado": "VENDEDOR01",
  "fecha": "2026-08-05"
}
```

### Actualizar cabecera de servicio

```text
PUT /ad_presupuestoserv
```

Controller:

```text
actualizarServiciosDatos
```

Actualiza campos descriptivos y de cabecera del servicio en:

```text
mve_ventaserv
```

No recalcula impuestos ni totales. Los campos tributarios oficiales siguen siendo responsabilidad de PostgreSQL mediante las funciones de costeo.

Payload esperado:

```json
{
  "id_anfitrion": "USER01",
  "documento_id": "20123456789",
  "periodo": "2026-08",
  "r_cod": "NP",
  "r_serie": "0001",
  "r_numero": "00000001",
  "elemento": 1,
  "servicio": 1,
  "id_producto": "SERV001",
  "descripcion": "SERVICIO DE INSTALACION",
  "especificacion": "Incluye materiales y mano de obra",
  "cont_und": "ZZ",
  "r_fecemi": "2026-08-05",
  "r_fecvcto": "2026-08-05",
  "r_moneda": "PEN",
  "r_tc": 1,
  "ctrl_mod_us": "VENDEDOR01"
}
```

### Listar detalle de costeo de un servicio

```text
GET /ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio
```

Controller:

```text
obtenerDetallesServicio
```

Lee:

```text
mve_ventaservdet
```

Devuelve:

```json
{
  "success": true,
  "data": []
}
```

### Insertar detalle de costeo

```text
POST /ad_presupuestoservdet
```

Controller:

```text
insertarDetalleServicio
```

Invoca:

```sql
fve_ventaservdet_inserta(...)
```

Payload esperado:

```json
{
  "id_anfitrion": "USER01",
  "documento_id": "20123456789",
  "periodo": "2026-08",
  "r_cod": "NP",
  "r_serie": "0001",
  "r_numero": "00000001",
  "elemento": 1,
  "servicio": 1,
  "r_fecemi": "2026-08-05",
  "id_producto": "MAT001",
  "descripcion": "MATERIAL O MANO DE OBRA",
  "cantidad": 2,
  "precio_unitario": 59,
  "precio_neto": 118,
  "porc_igv": 18,
  "cont_und": "NIU"
}
```

## Pendientes probables

Para continuar el modulo se deben definir o confirmar:

- Actualizar datos comerciales del servicio rapido.
- Eliminar servicio.
- Actualizar item de costeo.
- Eliminar item de costeo.
- Obtener cabecera del presupuesto con servicios.
- Reporte o impresion de presupuesto.
- Conversion futura de presupuesto a venta.

Si se implementa actualizar/eliminar detalle desde Node con SQL directo, despues del cambio se debe invocar una sola vez la funcion interna correspondiente de totales desde PostgreSQL para mantener coherencia.

## Nota sobre multiempresa

El modulo de productos usa `resolverDocumentoId` porque el maestro de productos puede ser compartido por empresas.

El modulo de ventas/presupuestos usa `documento_id` directo porque el documento comercial pertenece a una empresa concreta. Si en el futuro un endpoint de presupuesto consulta `mst_producto` directamente, ahi si debe revisarse si corresponde usar documento resuelto segun la regla del maestro de productos.
