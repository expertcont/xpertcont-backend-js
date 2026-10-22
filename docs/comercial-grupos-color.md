# Grupos Color

Mantenimiento básico de `public.mst_producto_grupo`. Su nombre en el menú y en
la pantalla es **Grupos Color**; internamente utiliza la identidad `id_grupo`.
El módulo agrega rutas propias y reutiliza componentes del catálogo comercial.

## Estructura y responsabilidades

| Archivo | Responsabilidad |
| --- | --- |
| Backend: `src/routes/producto.routes.js` | Registra las rutas nuevas y aplica el middleware de acceso a cada operación de datos. |
| Backend: `src/controllers/productoGrupo.controllers.js` | Adapta las peticiones HTTP, prepara el contexto en el middleware y centraliza la traducción de errores esperados y técnicos. |
| Backend: `src/services/productoGrupo.service.js` | Resuelve el contexto de negocio, comprueba comercial/SKU, normaliza y valida campos y convierte conflictos de persistencia en errores esperados. No depende de Express. |
| Backend: `src/repositories/productoGrupo.repository.js` | Encapsula el SQL parametrizado y el uso del resolvedor multiempresa. No decide reglas de acceso ni genera respuestas HTTP. |
| Frontend: `src/components/Admin/producto/useProductoGruposHabilitado.js` | Consulta los parámetros comerciales existentes para decidir la visibilidad del menú. |
| Frontend: `src/components/NavSideBar.js` | Coloca «Grupos Color» debajo de «Productos» y aporta la condición de rubro y acceso administrativo. |
| Frontend: `src/components/Admin/producto/AdminProductoGrupoList.jsx` | Organiza estado, carga, permisos, búsqueda, operaciones y presentación en secciones comentadas. |
| Backend: `tests/producto-grupo.test.js` | Casos de acceso por rubro/SKU, aislamiento por empresa, validación y respuestas de conflicto. Utiliza dependencias simuladas. |

Las rutas históricas `/ad_grupo`, importaciones y controladores de productos
conservan su implementación. No se modifica el cálculo ni el tratamiento del kardex.

El flujo del backend es `ruta → controlador → servicio → repositorio → PostgreSQL`.
El controlador conserva los nombres exportados y el contrato de las rutas existentes
del nuevo mantenimiento. `ProductoGrupoError` identifica errores esperados; cualquier
otro error se registra en el servidor y se devuelve como `500` con un mensaje genérico.
El middleware global de errores no se modifica.

## Flujo de acceso

1. El menú verifica rubro `COMERCIAL` y acceso administrativo; el hook agrega
   `producto_sku === '1'`, consultando `/ad_productoparametros`.
2. La pantalla consulta su disponibilidad con `/ad_productogrupoconfig`.
3. Cada petición al CRUD vuelve a comprobar rubro y SKU en el servidor.
4. El servicio solicita al repositorio resolver la empresa con `resolverDocumentoId`,
   incluida la matriz cuando corresponde. Ese documento se usa tanto para los
   parámetros como para los grupos.
5. El middleware entrega `{ id_anfitrion, documento }` en `req.grupoContexto`.
   Todas las operaciones filtran por ambos valores.

La visibilidad del menú y los permisos de botones no sustituyen la autenticación.
La pantalla reutiliza los permisos de productos del módulo `01`: crear `01-01`,
editar `01-02` y eliminar `01-03`, con la regla existente para el anfitrión.

## Contrato HTTP

Ruta base del API: `/ad_productogrupo/:id_anfitrion/:documento_id`.

| Método y ruta | Resultado |
| --- | --- |
| `GET /ad_productogrupoconfig/:id_anfitrion/:documento_id` | `{ habilitado: boolean }`. |
| `GET` sobre la base | Lista de grupos ordenada por código. |
| `POST` sobre la base | Crea un grupo y devuelve el registro con estado `201`. |
| `PUT` sobre la base + `/:id_grupo` | Actualiza nombre y descripción; devuelve el registro con estado `200`. |
| `DELETE` sobre la base + `/:id_grupo` | Elimina el grupo y devuelve `204`. |

El formulario envía `id_grupo`, `nombre`, `descripcion` y los identificadores de
auditoría `ctrl_crea_us` / `ctrl_mod_us`. Al editar, el código de la URL identifica
el registro y no se renombra la clave.

Respuestas de error: `400` validación; `403` comercial/SKU no habilitado;
`404` registro inexistente; `409` código duplicado o referencia detectada por
PostgreSQL; `500` fallo técnico. La respuesta `500` oculta el detalle técnico,
que queda registrado en el servidor.

## Reglas de persistencia

- Clave compuesta: `id_usuario`, `documento_id`, `id_grupo`.
- Código obligatorio de hasta 15 caracteres; nombre obligatorio de hasta 100;
  descripción opcional de hasta 300. El nombre se guarda en mayúsculas.
- La creación asigna `origen = 'MANUAL'` y fecha de creación en PostgreSQL.
- La edición registra fecha y usuario de modificación y conserva origen y auditoría de creación.
- El identificador del operador de auditoría procede del cliente actual; no se
  presenta como una identidad verificada por este controlador.
- La eliminación es individual. El manejo de referencias depende de las claves
  foráneas existentes en PostgreSQL; el módulo no agrega borrados en cascada.

## Revisión local

Pruebas de backend, desde `xpertcont-backend-js`:

```powershell
node --test tests/producto-grupo.test.js
```

Revisión de los componentes nuevos, desde `xpertcont-frontend-react`:

```powershell
npx eslint src/components/Admin/producto/AdminProductoGrupoList.jsx src/components/Admin/producto/useProductoGruposHabilitado.js
```

Estas pruebas simuladas no confirman el esquema de una base real. Para una
verificación manual, usar el backend local con la tabla existente y comprobar
creación, edición, eliminación, rechazo de duplicados y bloqueo sin SKU o con
otro rubro. No se requiere una migración adicional para el DDL proporcionado.
