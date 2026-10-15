# Aceptacion de propuesta RVIE - transporte

Contrato basado en el manual oficial SUNAT SIRE Ventas v32 (actualizado 12/10/2026):
https://cpe.sunat.gob.pe/sites/default/files/2026-10/Manual%20de%20servicios%20Web%20Api%20-%20SIRE_Ventas%20v32.pdf

Servicios 5.8 y 5.16; anexo III.

## Despliegue

Ejecutar docs/sql/mve_sire_aceptacion.sql antes de desplegar.
Requiere la tabla mve_sire_propuesta existente y las credenciales SIRE de la contabilidad.
Los endpoints siguen las convenciones de contexto del modulo actual.
No ejecutar solicitudes de prueba con credenciales reales: POST /aceptar modifica SUNAT.

## Enviar aceptacion

POST /transporte/sire/propuesta/aceptar

JSON:
```json
{
  "id_anfitrion": "USUARIO",
  "documento_id": "20123456789",
  "periodo": "2026-09",
  "id_libro": "014",
  "id_propuesta": "123",
  "ticket_propuesta": "TICKET_DE_DESCARGA_REVISADO",
  "confirmar": true,
  "id_invitado": "OPERADOR"
}
```

La propuesta debe ser la ultima importada en el contexto y estar PARSEADO o COMPARADO.
La aceptacion procesa toda la propuesta SUNAT del RUC y periodo, no solo los comprobantes locales de transporte.
El cliente llama al servicio oficial POST .../rvie/propuesta/web/propuesta/AAAAMM/aceptapropuesta sin body.
Devuelve HTTP 202 y ticket_aceptacion cuando SUNAT recibe la solicitud.
Ese ticket es diferente del ticket_propuesta; no se sobrescribe mct_contabilidadticket.sire_tpropuesta.

## Consultar

GET /transporte/sire/propuesta/aceptacion/:periodo/:id_anfitrion/:documento_id?id_libro=014
Recupera el envio guardado sin consultar SUNAT. SIN_ENVIO si no existe.

POST /transporte/sire/propuesta/aceptacion/estado
JSON con id_anfitrion, documento_id, periodo e id_libro.
Consulta exclusivamente el ticket_aceptacion almacenado, con codLibro=140000 y codOrigenEnvio=2.
Valida numTicket, perTributario y proceso de aceptacion (2 o 39) de la respuesta.

Estados locales:
- ENVIANDO: intento persistido antes de llamar a SUNAT.
- ENVIADO: ticket recibido; pendiente del resultado.
- TERMINADO: SUNAT confirma codigo 06.
- RECHAZADO: solicitud rechazada o proceso con errores (03).
- INCIERTO: timeout, error 5xx, respuesta sin ticket o fallo al guardar la respuesta.

04 (procesado sin errores) permanece pendiente; 06 confirma terminado.
Las consultas de aceptacion no descargan ni reemplazan el detalle local de la propuesta.

## Duplicados y errores

Se mantiene un candado PostgreSQL durante envio/consulta.
Repetir una aceptacion ENVIADO/TERMINADO devuelve el envio existente sin otro POST.
ENVIANDO/INCIERTO bloquea el reenvio automatico: consultar el ticket conocido o verificar en SUNAT.
Si no hay ticket conocido, no se asocia automaticamente otro ticket de la lista: primero debe verificarse el intento.
Un rechazo definitivo permite un nuevo intento confirmado.
Respuesta 4xx de SUNAT conserva su codigo HTTP y errores de validacion.
Los errores de resultado incierto incluyen estado y el ticket conocido, si lo hay.

## Alcance

Esta implementacion acepta y consulta la propuesta RVIE. No genera el libro final,
no implementa el reemplazo. El frontend de transporte ya conecta el boton de aceptacion,
recupera el ticket guardado y permite consultar el resultado.
La generacion final del registro es otra etapa del SIRE.

## Pruebas

Pruebas con fetch y persistencia simulados; no invocan SUNAT ni la base real.
`node --test tests/sire-aceptacion.test.js`

## Flujo en pantalla

Propuesta SUNAT > Aceptar propuesta > revisar empresa, RUC, periodo y cantidad > Enviar aceptacion a SUNAT.
El boton realiza el POST de aceptacion y una consulta inmediata del ticket. Si sigue en proceso,
usar Consultar aceptacion. Al volver a la pestana se recupera el envio guardado.
Un resultado incierto bloquea repetir el envio hasta verificarlo.
Para usarlo, desplegar tambien xpertcont-frontend-react.
