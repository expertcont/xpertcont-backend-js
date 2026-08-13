# Contexto avanzado - Backend Presupuestos / Servicios

> Nota: este documento queda como resumen historico de arranque. Para reglas vigentes del modulo usar `docs/presupuestos-spec.md`.

## Proyecto

Backend Node/Express desplegado en Railway:

```text
https://xpertcont-backend-js-production-50e6.up.railway.app
```

Repo local backend:

```text
D:\Developer\ovivasar\XpertcontProyecto\xpertcont-backend-js
```

Se creo un modulo backend separado para presupuestos/servicios porque `venta.controllers.js` ya esta muy grande.

Archivos nuevos:

```text
src/controllers/presupuesto.controllers.js
src/routes/presupuesto.routes.js
docs/presupuestos-contexto.md
```

Tambien se registro en `app.js`:

```js
const presupuestoRoutes = require('./src/routes/presupuesto.routes');
app.use(presupuestoRoutes);
```

## Arquitectura funcional

La estructura del modulo es:

```text
mve_venta
  -> mve_ventaserv
      -> mve_ventaservdet
```

`mve_venta` sigue siendo el documento comercial principal. Para presupuestos se usa un documento `NP`.

`mve_ventaserv` representa servicios dentro del documento.

`mve_ventaservdet` representa items, materiales, recursos o costeo dentro de cada servicio.

## Regla principal

Node.js y React no calculan impuestos ni totales.

Toda la logica tributaria vive en PostgreSQL.

Fuentes oficiales:

```text
mve_ventaserv -> resumen tributario oficial por servicio
mve_venta     -> resumen tributario oficial del documento completo
```

El frontend/backend deben leer esos campos consolidados, no recalcular desde el detalle.

## Convencion de usuarios

En todos los payloads del backend se usa:

```text
id_anfitrion
```

Ese valor corresponde al propietario de la cuenta o empresa.

En PostgreSQL y en las tablas historicas el mismo dato se llama:

```text
id_usuario
```

No se cambio en la base de datos porque ya pertenece a la estructura historica.

Tambien existe:

```text
id_invitado
```

que es el usuario operativo dentro de la cuenta del anfitrion.

Resumen:

```text
API/backend: id_anfitrion
BD/tablas:   id_usuario
Operador:    id_invitado
```

## Flujo principal

```text
1. Crear/obtener pedido base
   POST /ad_venta
   -> venta.controllers.js / generarRegistro()
   -> fve_crear_pedido()

2. Crear servicio
   POST /ad_presupuestoserv
   -> presupuesto.controllers.js / crearServicioPresupuesto()
   -> fve_crear_servicio()

3. Insertar item de costeo
   POST /ad_presupuestoservdet
   -> presupuesto.controllers.js / insertarDetalleServicio()
   -> fve_ventaservdet_inserta()
      -> inserta mve_ventaservdet
      -> ejecuta fve_ventaservdet_rtotales()
      -> actualiza mve_ventaserv
      -> ejecuta fve_ventaserv_rtotales()
      -> actualiza mve_venta
```

Las funciones `fve_ventaservdet_rtotales()` y `fve_ventaserv_rtotales()` son internas de PostgreSQL. No se expusieron como endpoints.

## Endpoints actuales

### Crear/obtener pedido base

Ya existia en ventas:

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

Respuesta real en Railway:

```json
{
  "success": true,
  "r_numero": "0000001",
  "r_fecemi": "2026-08-05T00:00:00.000Z",
  "r_monto_total": "0.00"
}
```

Nota: si se consume otra vez con los mismos datos, devuelve el mismo pedido abierto, no crea otro.

### Listar servicios

```text
GET /ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
```

Ejemplo:

```text
GET /ad_presupuestoserv/2026-08/aguirre.roberto1711@gmail.com/20455026602/NP/0001/0000001/1
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

Respuesta real en Railway:

```json
{
  "success": true,
  "servicio": 1,
  "descripcion": "NUEVO SERVICIO",
  "precio_neto": "0.00"
}
```

### Actualizar datos/cabecera de servicio

```text
PUT /ad_presupuestoserv
```

Controller:

```text
actualizarServiciosDatos
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
  "servicio": 1,
  "id_producto": "SERV001",
  "descripcion": "SERVICIO DE INSTALACION",
  "especificacion": "Incluye materiales y mano de obra",
  "cont_und": "ZZ",
  "r_fecemi": "2026-08-05",
  "r_fecvcto": "2026-08-05",
  "r_moneda": "PEN",
  "r_tc": 1,
  "ctrl_mod_us": "ovivasar@gmail.com"
}
```

Este endpoint actualiza campos descriptivos/comerciales de `mve_ventaserv`. No recalcula impuestos ni totales.

### Listar detalle de servicio

```text
GET /ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio
```

Ejemplo:

```text
GET /ad_presupuestoservdet/2026-08/aguirre.roberto1711@gmail.com/20455026602/NP/0001/0000001/1/1
```

### Insertar detalle de costeo

```text
POST /ad_presupuestoservdet
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

Invoca:

```sql
fve_ventaservdet_inserta(...)
```

La funcion inserta el detalle y recalcula internamente servicio + documento.

## Funciones PostgreSQL

### fve_crear_pedido

Ya usada por `POST /ad_venta`.

Crea/obtiene documento `NP` base.

### fve_crear_servicio

Crea servicio vacio en `mve_ventaserv`.

Importante: se corrigio ambiguedad en PostgreSQL usando alias:

```sql
SELECT COALESCE(MAX(vs.servicio),0) + 1
FROM mve_ventaserv vs
```

### fve_ventaservdet_inserta

Inserta detalle, calcula monto base, IGV, tipo IGV, `no_kardex` y ejecuta recalculo interno.

### fve_ventaservdet_rtotales

Interna. Consolida detalles hacia `mve_ventaserv`.

### fve_ventaserv_rtotales

Interna. Consolida servicios hacia `mve_venta`.

## Particiones

Las tablas nuevas estaban particionadas y faltaba inicializarlas. Se crearon particiones para:

```text
mve_ventaserv
mve_ventaservdet
```

Rango del proyecto:

```text
2025-01 hasta 2035-12
```

Tambien se recomendo agregar estas tablas al script `fad_crear_particiones_mensuales_admin`.

Indices sugeridos:

```sql
WHEN 'mve_ventaserv' THEN
    EXECUTE format(
        'CREATE UNIQUE INDEX %I ON public.%I
         (periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento, servicio);',
        idx_name, p_tabla
    );

WHEN 'mve_ventaservdet' THEN
    EXECUTE format(
        'CREATE UNIQUE INDEX %I ON public.%I
         (periodo, id_usuario, documento_id, r_cod, r_serie, r_numero, elemento, servicio, item);',
        idx_name, p_tabla
    );
```

## Estado de Git / Deploy

Se hizo commit y push inicial:

```text
5d4489a Agregar modulo de presupuestos
```

Subido a:

```text
origin/master
```

Railway detecto el deploy y ya se probaron endpoints contra produccion.

Luego se agregaron cambios locales no publicados todavia:

```text
PUT /ad_presupuestoserv
actualizarServiciosDatos
actualizacion del docs/presupuestos-contexto.md
```

Antes de seguir en frontend, revisar si estos ultimos cambios ya fueron publicados o necesitan commit/push.

## Datos de prueba consolidados

```json
{
  "baseUrl": "https://xpertcont-backend-js-production-50e6.up.railway.app",
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
