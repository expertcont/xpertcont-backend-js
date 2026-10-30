# Arranque de API y login SUNAT con Playwright

La API inicia con `node app.js`, sin `xvfb-run`. Chromium y la pantalla virtual no se abren al cargar rutas: solo cuando el login de consulta CPE los solicita.

La instalacion de Xvfb mediante apt y de Chromium mediante Playwright se conserva en nixpacks.toml. No se cambian las credenciales ni la navegacion mapeada del menu SOL.

## Pantalla bajo demanda

En Linux sin DISPLAY, el login inicia Xvfb directamente con `-displayfd 3`; el servidor elige un display libre y confirma su numero. Se esperan hasta 10 segundos. Su salida de error se captura y se publica si falla. No se utiliza xvfb-run ni se depende de su manejo de xauth.

DISPLAY se pasa solo al proceso de Chromium. Cada login crea su propia pantalla y la cierra al finalizar o al fallar. La terminacion solicita SIGTERM y, si no sale en 2 segundos, SIGKILL. No modifica DISPLAY global ni cierra una pantalla preexistente.

Chromium tiene 30 segundos para abrir. El recorrido SOL y sus esperas de navegacion existentes se conservan. Estos limites de arranque no son un tiempo limite global para todo el login.

PLAYWRIGHT_HEADLESS=1 permite ejecutar sin interfaz y sin Xvfb. En Linux, sin esa variable o con valor 0, se usa una pantalla existente o se crea Xvfb. Ese ajuste no garantiza que SUNAT acepte headless.

## Verificacion del despliegue

1. Confirmar que el Start Command efectivo en Railway sea `node app.js` o `npm start`, sin el antiguo wrapper. Una configuracion manual del servicio puede prevalecer sobre el archivo.
2. Esperar los logs `[Inicio API] Node iniciado`, `Dependencias y rutas cargadas` y `Escuchando en 0.0.0.0:...`. Confirmar que una consulta habitual responde.
3. Dentro del contenedor se puede ejecutar `npm run check:playwright`. Abre una pagina vacia y cierra ambos procesos; no usa credenciales ni se conecta a SUNAT. Es una prueba opcional, no se ejecuta al iniciar la API.
4. Probar una descarga que active el login portal. Buscar `xvfb_iniciando`, `xvfb_listo`, `playwright_iniciando` y los eventos existentes del recorrido SOL hasta `playwright_login_completo`.
5. Ante error buscar `xvfb_fallo` o `playwright_lanzador_fallo`. Un error de infraestructura del login conserva su estado tecnico y no se convierte automaticamente en falta de permisos HTTP 403.

Las pruebas locales simulan procesos y pagina SOL. No sustituyen la prueba de Xvfb/Chromium reales en Linux ni confirman que el portal entregue el token en Railway.

## Retorno del formulario SOL

El HTML publico de loginMenuSol, inspeccionado sin credenciales el 29/10/2026, tiene body.onload=url2Fields(). Esa funcion copia originalUrl y state desde la query a campos ocultos. Esperar solo a que #txtRuc sea visible no garantiza que onload haya ocurrido.

Antes de enviar el login se completan esos dos campos desde la query y se valida que el retorno sea AutenticaMenuInternet.htm en e-menu.sunat.gob.pe. El evento playwright_retorno_login expone solo indicadores booleanos y cuantos campos se completaron; no expone sus valores.

Si despues del login se llega a la raiz de api-seguridad con code/state, el intento termina en la primera vuelta de sondeo con PORTAL_RETORNO_PERDIDO, en lugar de esperar 120 vueltas buscando un token. El code de autorizacion no se trata como access_token ni se imprime en URLs de diagnostico.
