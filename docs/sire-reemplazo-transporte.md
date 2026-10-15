# Reemplazo RVIE de Transporte

Cambios locales: backend y pantalla conectados. No aplicar SQL ni enviar a SUNAT como parte de las pruebas.

## Flujo en pantalla

Reporte SIRE > Propuesta SUNAT > Reemplazar propuesta.

1. Generar el TXT desde las ventas de Transporte del RUC y periodo.
2. Revisar cantidad y total y descargar el ZIP exacto preparado.
3. Confirmar que el archivo cubre todas las ventas del RUC y periodo.
4. Enviar a SUNAT y guardar el ticket propio de reemplazo.
5. Consultar resultado. Si concluye, actualizar la propuesta local.

Para empresas con operaciones de otros modulos, usar Cargar archivo RVIE con el archivo
completo previamente elaborado. El archivo generado automaticamente solo contiene Transporte.
La presentacion afecta al RUC y periodo completos, no a una seleccion de filas.

## Generacion automatica

POST /transporte/sire/propuesta/reemplazo/generar
JSON: id_anfitrion, documento_id, periodo, id_libro=014, id_invitado opcional.
Devuelve 201, id_reemplazo, hash_archivo, nombre_archivo, cantidad_registros y resumen.
No llama a SUNAT.

Lee unicamente mve_transventa para el usuario/RUC/periodo y operaciones B/E.
Agrupa elementos de un mismo comprobante con datos compatibles. Usa centimos enteros
para sumar importes, pone anulados en cero y notas de credito en negativo.
Conserva datos del cliente y referencias del comprobante modificado. Bloquea notas
sin referencia, totales descuadrados y lineas incompatibles. Genera 33 campos sin cabecera.
El emisor CPE actual de Transporte opera en PEN; la generacion automatica exige PEN.
Para otras monedas se admite un archivo RVIE elaborado y revisado externamente.
El nombre indica si contiene registros; se permite una declaracion sin movimiento
solo mediante la revision y confirmacion explicita del usuario.
Antes del envio se regenera la huella de Transporte: si las ventas cambiaron desde
la preparacion, se exige preparar y revisar nuevamente.

## Archivo externo y revision

POST /transporte/sire/propuesta/reemplazo/preparar
multipart/form-data: archivo (TXT UTF-8 o ZIP con un solo TXT), id_anfitrion,
documento_id, periodo, id_libro, id_invitado opcional.
Limite 20 MiB de carga y TXT descomprimido. Extension TXT indistinta entre mayusculas
y minusculas; el nombre se normaliza a .txt dentro del ZIP.
Valida RUC/periodo, nombre oficial, 33 a 40 campos, fechas, importes,
moneda, referencias de notas y duplicados. SUNAT aplica la validacion tributaria definitiva.

GET /transporte/sire/propuesta/reemplazo/archivo/:periodo/:id_anfitrion/:documento_id
Query: id_libro=014, id_reemplazo y hash_archivo.
Descarga la copia exacta guardada. Un identificador/huella anterior a la ultima preparacion
se rechaza. Los intentos previos conservan su archivo en la base para auditoria.

## Envio y consulta

POST /transporte/sire/propuesta/reemplazar
JSON: id_anfitrion, documento_id, periodo, id_libro, id_reemplazo, hash_archivo,
confirmar=true, confirmar_alcance=true e id_invitado opcional.
Persiste ENVIANDO antes del POST TUS, y Location antes del primer PATCH.
Carga bloques de hasta 5 MiB, verificando cada Upload-Offset y la URL oficial.
Metadatos: codLibro=140000, codProceso=3, codOrigenEnvio=2, codTipoCorrelativo=01.
Devuelve 202 y ticket_reemplazo. Repetir un envio confirmado devuelve 200 reutilizado
sin otro envio. Aceptacion y reemplazo comparten candado por usuario/RUC/periodo/libro.

GET /transporte/sire/propuesta/reemplazo/:periodo/:id_anfitrion/:documento_id?id_libro=014
Recupera el ultimo estado local, sin archivo binario ni credenciales.

POST /transporte/sire/propuesta/reemplazo/estado
JSON: id_anfitrion, documento_id, periodo, id_libro.
Consulta exclusivamente el ticket guardado, validando numero, periodo y proceso 3.
04 o 06 -> TERMINADO; 03 del proceso o detalle -> RECHAZADO; otros -> ENVIADO.
No registra preliminar ni genera el libro final.

## Actualizacion local tras reemplazo confirmado

La propuesta previa se marca REEMPLAZADO; se conservan su cabecera y detalle.
Se limpia su ticket de descarga vigente y se solicita uno nuevo. Se guarda por separado
como ticket_actualizacion. El ticket de reemplazo y el de aceptacion no se sobrescriben.
La descarga nueva solo se importa al comprobar ticket, periodo y proceso de descarga 10.
Mientras falta importarla, se bloquea la comparacion para no usar el detalle anterior.
Las importaciones toman el mismo candado y rechazan tickets de propuestas anteriores:
una peticion antigua no puede volver a activar una propuesta reemplazada.

estado_actualizacion: PENDIENTE, ERROR o ACTUALIZADO.
Un fallo de descarga mantiene el reemplazo TERMINADO. Actualizar propuesta reanuda la
descarga con su ticket guardado. Si SUNAT rechaza explicitamente esa descarga (03), se limpia solo el ticket de descarga para solicitar uno nuevo al volver a actualizar. Un timeout conserva el mismo ticket. Nunca vuelve a enviar el reemplazo.
La pantalla limpia la comparacion anterior y recupera la propuesta vigente.

## Intentos inciertos y conciliacion

Timeout, 5xx, falta de ticket, offset invalido o fallo al guardar una respuesta exitosa
bloquean el reenvio. Si el ticket es conocido se conserva en la respuesta y en pantalla,
incluso si su persistencia fallo. No se infiere que una carga no llego por no encontrarla.

POST /transporte/sire/propuesta/reemplazo/conciliar
JSON: contexto, id_reemplazo, hash_archivo, ticket_reemplazo, confirmar=true,
id_invitado opcional.
Solo admite ENVIANDO/INCIERTO. Consulta SUNAT y exige coincidencia de numero,
periodo, proceso 3, nombre exacto de archivo y fecha posterior al inicio del intento
(con tolerancia de 60 segundos). No acepta otro ticket si ya hay uno guardado.
Registra operador y fecha de conciliacion. Solo un rechazo verificado permite corregir
y preparar otro intento. Sin evidencia suficiente el intento sigue bloqueado.

## Migracion preparada para otro momento

scripts/migrar-sire-transporte.js verifica por defecto; --aplicar ejecuta en una
unica transaccion las migraciones de fecha de ticket, propuesta, aceptacion, reemplazo
y mve_sire_reemplazo_flujo.sql. Requiere configurar explicitamente la base destino.
No se ejecuto la migracion ni se realizo un despliegue durante esta entrega.

## Pruebas locales

Backend: node --test tests/sire-aceptacion.test.js tests/sire-reemplazo.test.js
Frontend: npm test -- --watchAll=false --runInBand --runTestsByPath src/components/Admin/transporte/sunat/TrSirePresentacion.test.jsx src/components/Admin/transporte/sunat/TrSireReemplazo.test.jsx

SUNAT y persistencia simulados, con TXT/ZIP reales y verificacion HTTP local.

Contrato consultado: https://cpe.sunat.gob.pe/sites/default/files/2026-10/Manual%20de%20servicios%20Web%20Api%20-%20SIRE_Ventas%20v32.pdf