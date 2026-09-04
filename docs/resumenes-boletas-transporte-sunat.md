# Resumenes de boletas de transporte a SUNAT

Documento de referencia para la implementacion de resumen diario de boletas de transporte.

Incluye dos tipos de operaciones:

- Encomiendas: boletas gravadas con IGV.
- Boletos de viaje: boletas exoneradas, IGV cero.

La implementacion reemplaza el flujo manual tipo SFS/TRD para este caso. El backend administrativo arma un JSON tributario y el backend API SUNAT genera el XML UBL `SummaryDocuments`, firma, envia por SOAP `sendSummary` y consulta el CDR con ticket.

## Flujo general

```text
React / cliente admin
  -> xpertcont-backend-js
     POST /mve_transventa/cpe/resumen
       -> generaJsonResumenCPEexpertcontTransporte()
       -> https://expertcont-api-sunat.up.railway.app/cpesunatresumen
          -> cpegenerarxmlresumen()
          -> firma XML SummaryDocuments
          -> SOAP sendSummary
          -> retorna ticket

Consulta posterior:

React / cliente admin
  -> xpertcont-backend-js
     POST /mve_transventa/cpe/resumen/ticket
       -> https://expertcont-api-sunat.up.railway.app/cpesunatresumen/ticket
          -> SOAP getStatus
          -> descarga y guarda CDR si SUNAT ya lo genero
```

## Archivos implementados

Backend administrativo:

- `xpertcont-backend-js/src/controllers/ventatrans.controllers.js`
  - `generaJsonResumenCPEexpertcontTransporte`
  - `generarResumenCPEexpertcontTransporte`
  - `consultarResumenCPEexpertcontTransporte`
- `xpertcont-backend-js/src/routes/ventatrans.routes.js`
  - `POST /mve_transventa/cpe/resumen`
  - `POST /mve_transventa/cpe/resumen/ticket`

Backend API SUNAT:

- `xpertcont-backend-api/src/controllers/cpe/cpegeneraxmlresumen.js`
  - Genera XML `SummaryDocuments`.
- `xpertcont-backend-api/src/controllers/cpesunatresumen.controllers.js`
  - Firma, envia `sendSummary`, consulta `getStatus`.
- `xpertcont-backend-api/src/routes/cpesunat.routes.js`
  - `POST /cpesunatresumen`
  - `POST /cpesunatresumen/ticket`

## Endpoint administrativo de envio

```http
POST /mve_transventa/cpe/resumen
Content-Type: application/json
```

Payload minimo:

```json
{
  "periodo": "2026-09",
  "id_anfitrion": 1,
  "documento_id": "20600000000",
  "fecha_documentos": "2026-09-03",
  "correlativo": 1
}
```

Alias aceptados:

```json
{
  "p_periodo": "2026-09",
  "p_id_usuario": 1,
  "p_documento_id": "20600000000",
  "p_fecha_documentos": "2026-09-03",
  "p_correlativo": 1
}
```

Parametros opcionales:

- `id_punto_venta`: filtra por punto de venta origen.
- `tipo_operacion`: `E` para solo encomiendas, `B` para solo boletos.
- `solo_payload`: `true` o `"1"` arma y devuelve el JSON sin enviarlo a SUNAT.

Ejemplo para revisar el JSON antes de enviar:

```json
{
  "periodo": "2026-09",
  "id_anfitrion": 1,
  "documento_id": "20600000000",
  "fecha_documentos": "2026-09-03",
  "correlativo": 1,
  "solo_payload": true
}
```

## Seleccion de boletas

La consulta administrativa toma datos desde `mve_transventa`.

Condiciones principales:

```sql
periodo = $1
id_usuario = $2
documento_id = $3
r_fecemi = $4::date
COALESCE(NULLIF(r_cod_ref, ''), r_cod) = '03'
tipo_operacion IN ('B', 'E')
COALESCE(estado_sunat, '') NOT IN ('A', 'P', 'R')
```

Significado:

- Solo envia boletas (`03`).
- Incluye encomiendas (`E`) y boletos (`B`).
- Excluye aceptadas (`A`), pendientes (`P`) y rechazadas (`R`) para no duplicar resumenes.

## JSON enviado al backend API SUNAT

El backend administrativo arma este contrato:

```json
{
  "empresa": {
    "ruc": "20600000000",
    "razon_social": "EMPRESA DEMO SAC",
    "nombre_comercial": "EMPRESA DEMO SAC",
    "domicilio_fiscal": "AV. EJEMPLO 123",
    "ubigeo": "150101",
    "distrito": "LIMA",
    "provincia": "LIMA",
    "departamento": "LIMA",
    "modo": "1"
  },
  "resumen": {
    "numero": "20260903",
    "correlativo": "1",
    "fecha_documentos": "2026-09-03",
    "fecha_resumen": "2026-09-03"
  },
  "comprobantes": [
    {
      "tipo_documento": "03",
      "serie": "B001",
      "numero": "10",
      "cliente_numero_documento": "00000000",
      "cliente_tipo_documento": "0",
      "status": "1",
      "moneda_id": "PEN",
      "total_a_pagar": 11.8,
      "total_gravada": 10,
      "total_exonerada": 0,
      "total_inafecta": 0,
      "total_gratuita": 0,
      "total_igv": 1.8,
      "tipo_operacion": "E"
    },
    {
      "tipo_documento": "03",
      "serie": "BV01",
      "numero": "25",
      "cliente_numero_documento": "00000000",
      "cliente_tipo_documento": "0",
      "status": "1",
      "moneda_id": "PEN",
      "total_a_pagar": 35,
      "total_gravada": 0,
      "total_exonerada": 35,
      "total_inafecta": 0,
      "total_gratuita": 0,
      "total_igv": 0,
      "tipo_operacion": "B"
    }
  ]
}
```

## Mapeo tributario desde transporte

Cada fila de `mve_transventa` se convierte a una linea `comprobantes[]`.

| Origen `mve_transventa` | Destino JSON resumen | Nota |
| --- | --- | --- |
| `r_cod_ref || r_cod` | `tipo_documento` | Debe resolver a `03` |
| `r_serie_ref || r_serie` | `serie` | Serie de boleta |
| `r_numero_ref || r_numero` | `numero` | Numero de boleta |
| `cliente_documento_id` | `cliente_numero_documento` | Si falta, se usa `-` |
| `cliente_id_doc` | `cliente_tipo_documento` | Si falta, se usa `0` |
| `r_monto_total || precio_neto` | `total_a_pagar` | Total de la boleta |
| `r_gravado` | `total_gravada` | Encomienda con IGV |
| `r_exonerado` | `total_exonerada` | Boleto de viaje exonerado |
| `r_igv` | `total_igv` | Cero para boleto exonerado |

## Equivalente conceptual del TRD/SFS

En SFS, el `.TRD` obliga a declarar importes y codigos tributarios. En esta implementacion esos datos viven en dos niveles:

1. JSON administrativo:
   - `total_gravada`
   - `total_exonerada`
   - `total_inafecta`
   - `total_gratuita`
   - `total_igv`

2. XML UBL generado:
   - `sac:BillingPayment` con `InstructionID`.
   - `cac:TaxTotal` con `TaxScheme`.

## XML para encomienda gravada

Una encomienda con base gravada `10.00` e IGV `1.80` genera:

```xml
<sac:BillingPayment>
  <cbc:PaidAmount currencyID="PEN">10.00</cbc:PaidAmount>
  <cbc:InstructionID>01</cbc:InstructionID>
</sac:BillingPayment>

<cac:TaxTotal>
  <cbc:TaxAmount currencyID="PEN">1.80</cbc:TaxAmount>
  <cac:TaxSubtotal>
    <cbc:TaxAmount currencyID="PEN">1.80</cbc:TaxAmount>
    <cac:TaxCategory>
      <cac:TaxScheme>
        <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT"
          schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
        <cbc:Name>IGV</cbc:Name>
        <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:TaxSubtotal>
</cac:TaxTotal>
```

Interpretacion:

- `InstructionID 01`: operacion gravada.
- `TaxScheme 1000`: IGV.
- `TaxTypeCode VAT`: impuesto al valor agregado.

## XML para boleto exonerado

Un boleto de viaje exonerado por `35.00` con IGV `0.00` genera:

```xml
<sac:BillingPayment>
  <cbc:PaidAmount currencyID="PEN">35.00</cbc:PaidAmount>
  <cbc:InstructionID>02</cbc:InstructionID>
</sac:BillingPayment>

<cac:TaxTotal>
  <cbc:TaxAmount currencyID="PEN">0.00</cbc:TaxAmount>
  <cac:TaxSubtotal>
    <cbc:TaxAmount currencyID="PEN">0.00</cbc:TaxAmount>
    <cac:TaxCategory>
      <cac:TaxScheme>
        <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT"
          schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
        <cbc:Name>IGV</cbc:Name>
        <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:TaxSubtotal>
</cac:TaxTotal>
```

Interpretacion:

- `InstructionID 02`: operacion exonerada.
- Se mantiene `TaxScheme 1000 / IGV / VAT` con monto `0.00`, siguiendo el patron de resumen diario usado por Greenter/SFS.
- No se usa `TaxExemptionReasonCode` por item, porque `SummaryDocumentsLine` no es una factura con detalle de productos; es una linea resumida por comprobante.

## Codigos `InstructionID`

| Codigo | Significado |
| --- | --- |
| `01` | Gravada |
| `02` | Exonerada |
| `03` | Inafecta |
| `04` | Exportacion |
| `05` | Gratuita |

Actualmente la implementacion genera:

- `01` cuando existe `total_gravada`.
- `02` cuando existe `total_exonerada`.
- `03` cuando existe `total_inafecta`.
- `05` cuando existe `total_gratuita`.

Para transporte hoy se esperan principalmente:

- Encomienda: `01` + IGV mayor a cero.
- Boleto: `02` + IGV cero.

## Respuesta esperada del envio

SUNAT no devuelve CDR inmediato para resumenes. Devuelve un ticket.

Ejemplo:

```json
{
  "success": true,
  "estado": true,
  "nivel": "TICKET",
  "ticket": "202600000000123",
  "nombre_archivo": "20600000000-RC-20260903-1",
  "total_documentos": 2,
  "respuesta_sunat_descripcion": "Resumen enviado a SUNAT. Consultar CDR con el ticket.",
  "ruta_xml": "http://host:8080/descargas/20600000000/20600000000-RC-20260903-1.xml",
  "codigo_hash": "..."
}
```

En produccion (`modo = 1`), las operaciones incluidas se marcan como pendientes:

```text
estado_sunat = 'P'
```

## Endpoint administrativo de consulta de ticket

```http
POST /mve_transventa/cpe/resumen/ticket
Content-Type: application/json
```

Payload recomendado:

```json
{
  "id_anfitrion": 1,
  "documento_id": "20600000000",
  "ticket": "202600000000123",
  "nombre_archivo": "20600000000-RC-20260903-1"
}
```

Tambien acepta:

```json
{
  "empresa": {
    "ruc": "20600000000",
    "modo": "1"
  },
  "ticket": "202600000000123",
  "nombre_archivo": "20600000000-RC-20260903-1"
}
```

Respuesta cuando SUNAT aun procesa:

```json
{
  "success": true,
  "estado": false,
  "nivel": "PENDIENTE",
  "codigo": "98",
  "ticket": "202600000000123",
  "respuesta_sunat_descripcion": "SUNAT aun esta procesando el resumen.",
  "mensaje": "Ticket en proceso"
}
```

Respuesta cuando ya existe CDR:

```json
{
  "success": true,
  "estado": true,
  "nivel": "ACEPTADO",
  "codigo": "0",
  "ticket": "202600000000123",
  "nombre_archivo": "20600000000-RC-20260903-1",
  "ruta_cdr": "http://host:8080/descargas/20600000000/R-20600000000-RC-20260903-1.xml",
  "respuesta_sunat_descripcion": "La Constancia de Recepcion ha sido generada"
}
```

## Nombre de archivo SUNAT

Formato:

```text
{RUC}-RC-{YYYYMMDD}-{CORRELATIVO}
```

Ejemplo:

```text
20600000000-RC-20260903-1
```

El XML firmado se guarda como:

```text
20600000000-RC-20260903-1.xml
```

El ZIP enviado a SUNAT contiene ese XML:

```text
20600000000-RC-20260903-1.zip
```

## Consideraciones importantes

- Un resumen diario no usa `InvoiceLine`; usa `sac:SummaryDocumentsLine`.
- La linea del resumen representa una boleta completa, no cada producto o servicio.
- En boletas exoneradas, la exoneracion se expresa en `BillingPayment InstructionID 02`.
- El bloque `TaxTotal` se envia siempre con `1000 / IGV / VAT`; para boletos exonerados el monto es `0.00`.
- El envio retorna ticket; el CDR se obtiene despues con `getStatus`.
- El endpoint administrativo permite `solo_payload` para revisar el JSON antes de consumir correlativo/ticket.

## Validaciones realizadas

Se valido localmente:

```text
node --check src/controllers/cpe/cpegeneraxmlresumen.js
node --check src/controllers/cpesunatresumen.controllers.js
node --check src/routes/cpesunat.routes.js
node --check src/controllers/ventatrans.controllers.js
node --check src/routes/ventatrans.routes.js
```

Tambien se probo el generador XML con un payload mixto:

- 1 encomienda gravada con IGV.
- 1 boleto exonerado con IGV cero.

Resultado esperado:

- Dos bloques `sac:SummaryDocumentsLine`.
- Dos bloques `cac:TaxTotal`.
- `InstructionID 01` para encomienda.
- `InstructionID 02` para boleto.
- `TaxAmount 0.00` para IGV del boleto exonerado.
- `TaxTypeCode VAT` en ambas lineas.
