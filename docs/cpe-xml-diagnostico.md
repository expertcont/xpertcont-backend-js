# Diagnostico de descarga XML individual

Revision: 25 de octubre de 2026. No se realizaron solicitudes autenticadas a SUNAT durante esta revision; la evidencia real proviene de los logs y capturas aportados por el usuario.

## Evidencia observada

| Contexto | Recurso consultacpe declarado | Resultado |
| --- | --- | --- |
| Aplicacion, RUC 20539579356 | Si | Descarga XML HTTP 200 |
| Aplicacion, RUC 20614126435 | No | Descarga HTTP 401 |
| Aplicacion, RUC 20615732967, token nuevo | No | Descarga HTTP 401 |
| Portal SOL, RUC 20614126435 | Si | GET del mismo XML, con sufijo /02, HTTP 200 |

El token del portal aportado declara grantType=authorization_token. El backend solicita grant_type=password con el cliente API guardado para cada empresa. Todavia falta comparar el grantType devuelto en los tokens propios. Una declaracion JWT se puede inspeccionar sin verificar su firma; no constituye por si sola prueba de autorizacion efectiva.

Los nombres principal/secundario de los logs describen campos de BD, no el tipo real de usuario en SUNAT: principal corresponde a sunat_sol/sunat_solpwd y secundario a sire_sol/sire_solpwd.

Actualizacion 29/10/2026: cada solicitud usa una sola pareja, sin reintentos con otra. Las pruebas manuales seleccionan explicitamente principal (sunat_sol/sunat_solpwd) o secundario (sire_sol/sire_solpwd). Si falta algun campo de la pareja elegida, no se llama a SUNAT ni se sustituye por otra. Los rechazos muestran los campos utilizados, HTTP y codigo SUNAT, sin valores de credenciales.

Los botones Token SIRE primario y Token SIRE secundario fuerzan una emision nueva (forzarNuevo=true), releen mad_usuariocontabilidad y devuelven solo el resumen del token y el diagnostico. No leen, escriben ni sustituyen la cache normal. La pantalla limpia resultados anteriores antes del intento y al cambiar de empresa o periodo. Las operaciones habituales siguen reutilizando cache. Esto permite pruebas separadas; no demuestra por si solo la causa de un rechazo de SUNAT para un RUC real.

## Documentacion consultada y limites

- Manual oficial SIRE Compras v28, seccion 5.1: documenta POST clientessol/{clientId}/oauth2/token/ con grant_type=password, scope api-sire, ID/secreto y RUC+usuario/clave SOL. Es consistente con el flujo SIRE implementado, pero no documenta consultacpe ni demuestra acceso general a ese recurso con scope api-cpe.
  https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual%20de%20servicios%20Web%20Api%20-%20SIRE_Compras%20v28.pdf
- Reporte independiente del autor de IntegraFacil: describe el mismo patron y afirma que existe una operacion para habilitar recursos de la aplicacion. No publica el contrato completo; advierte que reemplaza la lista de recursos. Es una pista pendiente de verificacion, no una instruccion oficial ni un procedimiento probado en este proyecto.
  https://integrafacil.dev/error-401-consultacpe-sunat.html

No se encontro documentacion oficial suficiente para afirmar que consultacpe exige exclusivamente una sesion SOL. Tampoco se verifico un endpoint o payload para habilitarlo. No corresponde sustituir el flujo por authorization_token ni alterar los permisos basandose solo en estas pistas.

## Comparacion disponible en logs

El evento [SUNAT CPE diagnostico], etapa=descarga, resultado=solicitando, ahora contiene:

- grantSolicitado frente a grantType declarado en el JWT.
- camposSol utilizados, sin valores de usuario o clave.
- emisorHost y rucTokenCoincide, sin imprimir clientId, issuer completo o userdata.
- emision, validoDesde, expiracion, segundosRestantes y estado temporal del token.
- recursosCpe normalizados con id, indicador y gt; consultacpeDeclarado es null si no se puede interpretar la audiencia.
- referencia y tokenCache para relacionar cada consulta.

No se registra el JWT completo ni datos de sesion SOL. El campo gt se conserva como valor declarado sin interpretar su significado, que no se verifico en la documentacion.

## Siguiente verificacion

Tras desplegar el backend, descargar un XML con el RUC que funciona y otro con un RUC fallido. Comparar los eventos solicitando y sus respuestas HTTP. No bloquear descargas automaticamente por el contenido de la audiencia: mantener la solicitud real como comprobacion.

Si el grantType emitido coincide, los tokens estan vigentes y el RUC coincide, la investigacion debe concentrarse en el registro de recursos de cada cliente API. La siguiente evidencia necesaria es el contrato real de lectura/actualizacion de aplicaciones del portal de credenciales, o confirmacion de SUNAT sobre habilitacion de consultacpe. Antes de cualquier cambio, leer y conservar la lista completa de recursos existentes, incluyendo SIRE y guias.
