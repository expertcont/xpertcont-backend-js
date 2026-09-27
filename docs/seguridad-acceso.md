# Seguridad del acceso a XpertCont

Resumen de como funciona hoy, que se implemento en el primer paso, y que falta
para cerrarlo de verdad. Todo lo descrito es **local**: nada se desplego.

---

## 1. Como funciona hoy (antes de este cambio)

1. `index.js` monta `Auth0Provider` con login social de Google (Gmail).
2. `BienvenidaXpert` pide `GET /usuario/estudios/<correo>` y muestra los estudios
   contables registrados para ese correo.
3. Si el usuario elige un estudio y pulsa INGRESAR, la app abre.

**Problema grave:** el backend (`app.js`) no tiene middleware de autenticacion.
`cors()` esta abierto y los 24 routers se montan sin ningun control. En la
practica:

- `GET /usuario/estudios/<correo>` responde sin token: cualquiera puede listar que
  correos tienen acceso.
- Todos los endpoints de escritura (ventas, asientos, caja, encomiendas) tambien
  son publicos. No hace falta iniciar sesion: basta conocer la URL de Railway y
  llamar con `curl`.

El login de Auth0 es una puerta **visual** en el frontend. Nunca se envia el token
al backend (`getAccessTokenSilently` no se usa en ningun archivo).

Ademas hay un token de apiperu.dev hardcodeado en
`xpertcont-frontend-react/src/components/AsientoRazonSocial.js:83`, visible en el
bundle. **Hay que rotarlo.**

---

## 2. Primer paso implementado: equipo autorizado

### Que se usa y por que

| Opcion | Sirve para autorizar una maquina? | Motivo |
| --- | --- | --- |
| Direccion MAC | No | El navegador no puede leer la MAC. No existe API y la plataforma lo prohibe. |
| IP publica | No | Es la del router/salida, no la del equipo. Ademas cambia. |
| User agent / fingerprint en localStorage | No | Se falsifica o se copia desde DevTools en segundos. |
| `localStorage` como "sesion de maquina" | No | Se copia a otra PC con un click. |
| **Par de claves ECDSA P-256 no exportable** | **Si** | La clave privada vive en IndexedDB del equipo, no se puede leer ni copiar. Si alguien copia el almacenamiento del navegador a otra PC, no puede firmar el reto del servidor y el acceso se rechaza. |

Ese par de claves lo genera WebCrypto en el navegador. La **huella** es el
SHA-256 de la clave publica y es el identificador del equipo.

### Protocolo de verificacion (reto/respuesta)

```
1. El equipo genera su par de claves (solo la primera vez) y calcula su huella.
2. POST /seguridad/dispositivo/consulta   { id_usuario, huella }
   -> { autorizado: true|false, motivo, etiqueta }
3. Si esta autorizado:
   POST /seguridad/dispositivo/reto       { id_usuario, huella }
   -> { nonce }
4. El equipo firma el nonce con su clave privada:
   POST /seguridad/dispositivo/verificar  { id_usuario, huella, nonce, firma }
   -> { autorizado: true, etiqueta }
5. Solo entonces la app deja elegir estudio e INGRESAR.
```

El nonce es de un solo uso y caduca a 2 minutos.

### Puesta en marcha (pasos manuales)

1. Crear la tabla en PostgreSQL:

   ```bash
   psql "$DATABASE_URL" -f docs/sql/seguridad_dispositivo.sql
   ```

2. Desplegar el backend (Railway). Los endpoints nuevos:
   - `POST /seguridad/dispositivo/consulta`
   - `POST /seguridad/dispositivo/reto`
   - `POST /seguridad/dispositivo/verificar`
   - `POST /seguridad/dispositivo/registrar`
   - `GET  /seguridad/dispositivo/:id_usuario`
   - `DELETE /seguridad/dispositivo/:id_usuario/:huella`

3. Abrir la app en la PC autorizada e iniciar sesion con el Gmail. La pantalla
   mostrara el **codigo de emparejamiento** (ej. `4F2A-9C81-B733`).

4. Autorizar ese equipo. Opcion A, desde SQL (no requiere panel):

   ```sql
   INSERT INTO mad_seguridad_dispositivo (id_usuario, huella, etiqueta, plataforma, navegador, llave_publica)
   SELECT 'correo@empresa.com', 'huella_completa_en_hex', 'PC Recepcion - Ana', NULL, NULL, NULL
   ON CONFLICT (id_usuario, huella) DO UPDATE SET equipo_activo = true;
   ```

   O bien copiar los valores que muestra la app. Si `llave_publica` queda en
   `NULL` la verificacion de firma fallara: en ese caso usar la opcion B.

   Opcion B, desde la propia maquina (deja la llave publica correcta):

   ```bash
   curl -X POST https://<backend>/seguridad/dispositivo/registrar \
     -H "Content-Type: application/json" \
     -d '{"id_usuario":"correo@empresa.com","huella":"<huella_hex>","etiqueta":"PC Recepcion - Ana"}'
   ```

   La app envia `llave_publica` automaticamente si se llama a
   `registrarEsteEquipo(back_host, correo, identidad)` desde la consola del
   navegador con la sesion iniciada.

5. Recargar la app: el equipo queda autorizado.

### Comportamiento durante la puesta en marcha

Si la tabla no existe todavia, `consultarEquipo` marca `disponible: false` y la
app entra en estado `sin-control`: **no bloquea a nadie**. Se eligio esto a
proposito para que desplegar el frontend antes que la tabla no dejara el sistema
inaccesible. Cuando la tabla exista, el control aplica automaticamente.

### Limites que hay que tener claros

- Esto controla **el ingreso a la app**. No protege la API: mientras los demas
  endpoints no validen el token, un atacante puede llamar el backend
  directamente. Ese es el paso 2.
- Un fingerprint de navegador no distingue una PC de oficina de un celular
  personal: ante el mismo Gmail y el mismo segundo factor, se ven igual. Lo que
  frena de verdad al celular es la **red** (paso 3).
- Si se borra el almacenamiento del sitio en el navegador, se genera una clave
  nueva y hay que volver a autorizar el equipo.

---

## 3. Pasos pendientes, en orden de impacto

### Paso 2 - Cerrar la API (lo mas importante)

Middleware de Express que valide el JWT de Auth0 en **cada** request y aplique
el chequeo de acceso en base de datos. Dependencias a agregar:
`jsonwebtoken` + `jwks-rsa`.

- `Authorization: Bearer <access_token>` obligatorio; `401` si falta o expira.
- Verificar `iss` (`https://<dominio>/`) y `aud` (el API de Auth0, hoy no existe:
  hay que crearlo en el dashboard).
- El frontend debe pasar a enviar el token: `getAccessTokenSilently()` + un
  interceptor de axios/fetch.
- El chequeo de "este correo tiene acceso" se aplica en el backend, no en el
  cliente.

### Paso 2b - Rotar el token filtrado

Token de apiperu.dev en `AsientoRazonSocial.js:83` → variable de entorno y
rotarlo en apiperu. Sacar tambien `domain` y `clientId` de `index.js` a
variables de entorno.

### Paso 3 - Restriccion de red (frena el celular personal)

Cloudflare Access o Tailscale delante de `expertcont.pe` y del backend. Con esto
la app no responde fuera de la oficina, y ningun otro control de "una sola
maquina" es tan simple ni tan fuerte. Es configuracion, no codigo.

### Paso 4 - Endurecer Auth0 (solo dashboard)

- Dominios permitidos: solo correos de la empresa.
- MFA obligatorio (o al menos para administradores).
- Refresh token rotation con deteccion de reuso.
- Timeout por inactividad y absoluto.
- Desactivar el grant de contrasena.
- Alertas de login anomalo.

### Paso 5 - Endurecer el codigo existente

Al revisar el backend aparecieron consultas concatenadas a mano, por ejemplo
`... WHERE id_usuario like '" + id_usuario + "%' ...` en
`seguridad.controllers.js` y otros controladores. Es SQL injection. Lo nuevo que
escribi (`dispositivo.controllers.js`) usa parametros `$1, $2`; conviene migrar
los demás.

---

## Archivos de este paso

| Archivo | Que hace |
| --- | --- |
| `xpertcont-backend-js/docs/sql/seguridad_dispositivo.sql` | Tabla `mad_seguridad_dispositivo` |
| `xpertcont-backend-js/src/controllers/dispositivo.controllers.js` | Consulta, reto, verificacion, alta, listado y baja |
| `xpertcont-backend-js/src/routes/dispositivo.routes.js` | Rutas `/seguridad/dispositivo/*` |
| `xpertcont-backend-js/app.js` | Monta el router nuevo |
| `xpertcont-frontend-react/src/security/dispositivo.js` | Par de claves WebCrypto, huella y firma |
| `xpertcont-frontend-react/src/components/EquipoAutorizadoPanel.jsx` | Aviso de equipo no autorizado + codigo |
| `xpertcont-frontend-react/src/components/BienvenidaXpert.js` | Gate: sin equipo autorizado no hay selector ni INGRESAR |
