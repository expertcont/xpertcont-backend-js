# Contexto general - Modulo Presupuestos / Servicios

## Objetivo

Se esta implementando un modulo de presupuestos de servicios y costeo sobre el backend existente de Xpertcont.

El documento principal sigue siendo `mve_venta`, usando documento tipo `NP`. Sobre ese documento se agrego una estructura nueva para servicios:

```text
mve_venta
  -> mve_ventaserv
      -> mve_ventaservdet
```

## Idea de negocio

Un presupuesto puede tener uno o varios servicios.

Cada servicio puede funcionar de dos maneras:

- Presupuesto rapido: datos comerciales simples del servicio.
- Presupuesto costeado: detalle interno de materiales, mano de obra o recursos.

Ambos caminos deben terminar produciendo totales tributarios oficiales en la misma estructura.

## Regla importante

Ni React ni Node.js deben calcular impuestos ni totales tributarios.

La base de datos PostgreSQL es la responsable de calcular y consolidar importes.

Fuentes oficiales:

```text
mve_ventaserv -> totales oficiales por servicio
mve_venta     -> totales oficiales del documento completo
```

## Convencion de usuarios

En el backend/API se usa el nombre:

```text
id_anfitrion
```

para representar al usuario propietario de la cuenta o empresa.

En PostgreSQL y en las tablas historicas ese mismo valor sigue guardandose como:

```text
id_usuario
```

No se cambio en base de datos porque ya forma parte de la estructura historica.

Tambien existe:

```text
id_invitado
```

que representa a otro usuario del sistema que opera dentro de la cuenta del anfitrion, por ejemplo vendedor, operador o usuario invitado.

Por tanto:

```text
API/backend: id_anfitrion
BD/tablas:   id_usuario
Operador:    id_invitado
```

## Flujo principal

```text
1. Crear/obtener pedido base
   POST /ad_venta
   -> fve_crear_pedido()

2. Crear servicio
   POST /ad_presupuestoserv
   -> fve_crear_servicio()

3. Insertar detalle de costeo
   POST /ad_presupuestoservdet
   -> fve_ventaservdet_inserta()
      -> inserta detalle
      -> recalcula servicio
      -> recalcula documento
```

Las funciones de recalculo son internas de PostgreSQL y no se exponen como endpoints.

## Backend creado

Se creo un modulo separado porque `venta.controllers.js` ya esta muy grande:

```text
src/controllers/presupuesto.controllers.js
src/routes/presupuesto.routes.js
```

Tambien se registro en:

```text
app.js
```

## Endpoints principales

```text
GET  /ad_presupuestoserv/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem
POST /ad_presupuestoserv
PUT  /ad_presupuestoserv

GET  /ad_presupuestoservdet/:periodo/:id_anfitrion/:documento_id/:cod/:serie/:num/:elem/:servicio
POST /ad_presupuestoservdet
```

## Funciones PostgreSQL principales

```text
fve_crear_pedido()
fve_crear_servicio()
fve_ventaservdet_inserta()
fve_ventaservdet_rtotales()
fve_ventaserv_rtotales()
```

`fve_ventaservdet_rtotales()` y `fve_ventaserv_rtotales()` son internas.

## Datos de prueba Railway

URL base:

```text
https://xpertcont-backend-js-production-50e6.up.railway.app
```

Datos consolidados:

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

Pruebas realizadas:

- `POST /ad_venta` devolvio `r_numero = 0000001`.
- `POST /ad_presupuestoserv` creo `servicio = 1`.

## Particiones

Las tablas nuevas son particionadas:

```text
mve_ventaserv
mve_ventaservdet
```

Se inicializaron particiones para el rango:

```text
2025-01 hasta 2035-12
```

## Pendientes

- Probar `PUT /ad_presupuestoserv`.
- Probar `GET /ad_presupuestoserv`.
- Probar `POST /ad_presupuestoservdet`.
- Probar `GET /ad_presupuestoservdet`.
- Publicar si quedaron cambios locales pendientes.
- Definir luego endpoints para actualizar/eliminar items y servicios si el frontend los necesita.
