-- SIRE Ventas y Compras: comprobantes y datos generales de cada propuesta/descarga.
-- Recreacion desde cero, autorizada para tablas vacias. ELIMINA las tablas SIRE indicadas.
-- No se crean tablas de productos/detalle, ni item, elemento o IDs incrementales para comprobantes.
-- Aceptacion conserva su ID de control BIGSERIAL; reemplazo conserva su UUID.
-- Facturas y notas se guardan con su propio tipo, serie y numero.
-- Compras agrega r_documento_id (proveedor) para permitir numeros coincidentes entre proveedores.
-- Los importes tributarios, referencias, originales y ajustes quedan en el comprobante.
-- Ticket, archivo original, fechas, cantidad y totales generales se guardan una sola vez en *_datos.
-- No modifica mve_venta, mve_ventadet ni mct_contabilidadticket.
-- El ticket agrupa una descarga y puede repetirse en varios comprobantes.
-- El backend anterior requiere adaptacion a esta estructura antes de operar.
-- Detener escrituras mientras se ejecuta. No hay migracion ni respaldo de datos.
BEGIN;
-- Primero los controles que referencian datos generales de las propuestas.
DROP TABLE IF EXISTS public.mve_sire_aceptacion;
DROP TABLE IF EXISTS public.mve_sire_reemplazo;
DROP TABLE IF EXISTS public.mco_sire_propuesta_det;
DROP TABLE IF EXISTS public.mve_sire_propuesta_det;
DROP TABLE IF EXISTS public.mco_sire_propuesta;
DROP TABLE IF EXISTS public.mve_sire_propuesta;
DROP TABLE IF EXISTS public.mco_sire_propuesta_datos;
DROP TABLE IF EXISTS public.mve_sire_propuesta_datos;

-- DATOS GENERALES: una fila por empresa, periodo y ticket; sin IDs incrementales.
CREATE TABLE public.mco_sire_propuesta_datos (
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  ticket VARCHAR(50) NOT NULL,
  id_libro VARCHAR(6) NOT NULL DEFAULT '080000' CHECK (id_libro='080000'),
  rubro VARCHAR(15) CHECK (rubro IN ('COMERCIAL','TRANSPORTE','CONTABLE')),
  estado VARCHAR(30) NOT NULL DEFAULT 'GENERADO'
    CHECK (estado IN ('GENERADO','DESCARGADO','PARSEADO','COMPARADO','ANULADO','ERROR')),
  estado_normalizacion VARCHAR(30) NOT NULL DEFAULT 'LEGADO'
    CHECK (estado_normalizacion IN ('LEGADO','NORMALIZADO','PENDIENTE_CONCILIACION')),
  normalizacion_version INTEGER NOT NULL DEFAULT 0 CHECK (normalizacion_version >= 0),
  nombre_archivo VARCHAR(300),
  archivo BYTEA,
  huella_archivo VARCHAR(64),
  fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  fecha_descarga TIMESTAMPTZ,
  cantidad_registros INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_registros >= 0),
  totales_originales JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(totales_originales)='object'),
  observacion TEXT,
  ctrl_crea TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ctrl_crea_us VARCHAR(50),
  ctrl_mod TIMESTAMPTZ,
  ctrl_mod_us VARCHAR(50),
  CONSTRAINT mco_sire_propuesta_datos_prkey PRIMARY KEY (id_usuario, documento_id, periodo, ticket),
  CONSTRAINT mco_sire_propuesta_datos_ticket_chk CHECK (length(btrim(ticket)) > 0),
  CONSTRAINT mco_sire_propuesta_datos_archivo_chk CHECK ((archivo IS NULL) = (nombre_archivo IS NULL))
) PARTITION BY RANGE (periodo);
CREATE TABLE public.mco_sire_propuesta_datos_default PARTITION OF public.mco_sire_propuesta_datos DEFAULT;
COMMENT ON TABLE public.mco_sire_propuesta_datos IS 'Informacion general de cada descarga SIRE: ticket, archivo original, fechas, cantidad y totales por moneda. El control de aceptacion y reemplazo sigue en mct_contabilidadticket.';

CREATE TABLE public.mve_sire_propuesta_datos (
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  ticket VARCHAR(50) NOT NULL,
  id_libro VARCHAR(6) NOT NULL DEFAULT '140000' CHECK (id_libro='140000'),
  rubro VARCHAR(15) CHECK (rubro IN ('COMERCIAL','TRANSPORTE','CONTABLE')),
  estado VARCHAR(30) NOT NULL DEFAULT 'GENERADO'
    CHECK (estado IN ('GENERADO','DESCARGADO','PARSEADO','COMPARADO','ANULADO','ERROR','REEMPLAZADO')),
  estado_normalizacion VARCHAR(30) NOT NULL DEFAULT 'LEGADO'
    CHECK (estado_normalizacion IN ('LEGADO','NORMALIZADO','PENDIENTE_CONCILIACION')),
  normalizacion_version INTEGER NOT NULL DEFAULT 0 CHECK (normalizacion_version >= 0),
  nombre_archivo VARCHAR(300),
  archivo BYTEA,
  huella_archivo VARCHAR(64),
  fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  fecha_descarga TIMESTAMPTZ,
  cantidad_registros INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_registros >= 0),
  totales_originales JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(totales_originales)='object'),
  observacion TEXT,
  ctrl_crea TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ctrl_crea_us VARCHAR(50),
  ctrl_mod TIMESTAMPTZ,
  ctrl_mod_us VARCHAR(50),
  CONSTRAINT mve_sire_propuesta_datos_prkey PRIMARY KEY (id_usuario, documento_id, periodo, ticket),
  CONSTRAINT mve_sire_propuesta_datos_ticket_chk CHECK (length(btrim(ticket)) > 0),
  CONSTRAINT mve_sire_propuesta_datos_archivo_chk CHECK ((archivo IS NULL) = (nombre_archivo IS NULL))
) PARTITION BY RANGE (periodo);
CREATE TABLE public.mve_sire_propuesta_datos_default PARTITION OF public.mve_sire_propuesta_datos DEFAULT;
COMMENT ON TABLE public.mve_sire_propuesta_datos IS 'Informacion general de cada descarga SIRE: ticket, archivo original, fechas, cantidad y totales por moneda. El control de aceptacion y reemplazo sigue en mct_contabilidadticket.';

-- COMPRAS: comprobantes RCE, con DG, DGNG y DNG separados.
CREATE TABLE public.mco_sire_propuesta (
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  r_documento_id VARCHAR(20) NOT NULL,
  r_cod VARCHAR(2) NOT NULL,
  r_serie VARCHAR(5) NOT NULL,
  r_numero VARCHAR(22) NOT NULL,
  ticket VARCHAR(50),
  periodo_origen VARCHAR(7) NOT NULL,
  historial JSONB NOT NULL DEFAULT '[]',
  linea INTEGER,
  car_sunat VARCHAR(100),
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE,
  tipo_comprobante VARCHAR(2) NOT NULL,
  serie VARCHAR(20) NOT NULL DEFAULT '',
  ano_dam VARCHAR(4),
  numero VARCHAR(30) NOT NULL,
  numero_final VARCHAR(30),
  tipo_doc_proveedor VARCHAR(2) NOT NULL DEFAULT '6',
  documento_proveedor VARCHAR(20) NOT NULL,
  proveedor VARCHAR(300) NOT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio NUMERIC(14,6) NOT NULL DEFAULT 1,
  base_gravada_dg NUMERIC(18,2) NOT NULL DEFAULT 0,
  igv_dg NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_gravada_dgng NUMERIC(18,2) NOT NULL DEFAULT 0,
  igv_dgng NUMERIC(18,2) NOT NULL DEFAULT 0,
  base_gravada_dng NUMERIC(18,2) NOT NULL DEFAULT 0,
  igv_dng NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_adquisicion_ng NUMERIC(18,2) NOT NULL DEFAULT 0,
  isc NUMERIC(18,2) NOT NULL DEFAULT 0,
  icbper NUMERIC(18,2) NOT NULL DEFAULT 0,
  otros NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL,
  fecha_emision_ref DATE,
  tipo_comprobante_ref VARCHAR(2),
  serie_ref VARCHAR(20),
  codigo_dam_dsi_ref VARCHAR(30),
  numero_ref VARCHAR(30),
  clasificacion_bienes_servicios VARCHAR(10),
  datos_adicionales JSONB NOT NULL DEFAULT '{}',
  origen VARCHAR(10) NOT NULL DEFAULT 'SUNAT',
  estado_contador VARCHAR(12) NOT NULL DEFAULT 'INCLUIDO',
  periodo_declaracion VARCHAR(7),
  motivo_ajuste TEXT,
  fecha_ajuste TIMESTAMPTZ,
  usuario_ajuste VARCHAR(60),
  raw_linea TEXT,
  valores_originales JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT mco_sire_propuesta_prkey PRIMARY KEY (id_usuario, documento_id, periodo, r_documento_id, r_cod, r_serie, r_numero),
  CONSTRAINT mco_sire_propuesta_linea_chk CHECK (linea IS NULL OR linea > 0),
  CONSTRAINT mco_sire_propuesta_tipo_chk CHECK (tipo_comprobante ~ '^[0-9]{2}$'),
  CONSTRAINT mco_sire_propuesta_numero_chk CHECK (length(btrim(numero)) > 0),
  CONSTRAINT mco_sire_propuesta_proveedor_chk CHECK (
    length(btrim(tipo_doc_proveedor)) > 0
    AND length(btrim(documento_proveedor)) > 0
    AND documento_proveedor = r_documento_id
    AND length(btrim(proveedor)) > 0
    AND (tipo_doc_proveedor <> '6' OR documento_proveedor ~ '^[0-9]{11}$')
  ),
  CONSTRAINT mco_sire_propuesta_moneda_chk CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT mco_sire_propuesta_tc_chk CHECK (tipo_cambio >= 0),
  CONSTRAINT mco_sire_propuesta_origen_chk CHECK (origen IN ('SUNAT', 'MANUAL')),
  CONSTRAINT mco_sire_propuesta_estado_chk CHECK (
    estado_contador IN ('INCLUIDO', 'EXCLUIDO', 'OBSERVADO', 'PENDIENTE')
  ),
  CONSTRAINT mco_sire_propuesta_declaracion_chk CHECK (
    periodo_declaracion IS NULL OR periodo_declaracion ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  CONSTRAINT mco_sire_propuesta_motivo_chk CHECK (
    estado_contador = 'INCLUIDO' OR length(btrim(COALESCE(motivo_ajuste, ''))) > 0
  ),
  CONSTRAINT mco_sire_propuesta_adicionales_chk CHECK (jsonb_typeof(datos_adicionales) = 'object'),
  CONSTRAINT mco_sire_propuesta_original_chk CHECK (
    valores_originales IS NULL OR jsonb_typeof(valores_originales) = 'object'
  ),
  CONSTRAINT mco_sire_propuesta_version_chk CHECK (version > 0),
  CONSTRAINT mco_sire_propuesta_datos_fk FOREIGN KEY (id_usuario, documento_id, periodo, ticket)
    REFERENCES public.mco_sire_propuesta_datos (id_usuario, documento_id, periodo, ticket) ON DELETE RESTRICT,
  CONSTRAINT mco_sire_propuesta_ticket_origen_chk CHECK (origen='MANUAL' OR ticket IS NOT NULL)
) PARTITION BY RANGE (periodo);
CREATE TABLE public.mco_sire_propuesta_default PARTITION OF public.mco_sire_propuesta DEFAULT;

-- VENTAS: comprobantes RVIE.
CREATE TABLE public.mve_sire_propuesta (
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  r_cod VARCHAR(2) NOT NULL,
  r_serie VARCHAR(5) NOT NULL,
  r_numero VARCHAR(22) NOT NULL,
  ticket VARCHAR(50) NOT NULL,
  ctrl_crea TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ctrl_crea_us VARCHAR(20),
  ctrl_mod TIMESTAMP WITHOUT TIME ZONE,
  ctrl_mod_us VARCHAR(20),
  linea INTEGER NOT NULL,
  fecha_emision DATE,
  fecha_vencimiento DATE,
  tipo_comprobante VARCHAR(2),
  serie VARCHAR(20),
  numero VARCHAR(30),
  numero_final VARCHAR(30),
  tipo_doc_cliente VARCHAR(2),
  nro_doc_cliente VARCHAR(20),
  cliente VARCHAR(250),
  base_exportacion NUMERIC(14,2) NOT NULL DEFAULT 0,
  base_gravada NUMERIC(14,2) NOT NULL DEFAULT 0,
  descuento_base_gravada NUMERIC(14,2) NOT NULL DEFAULT 0,
  igv NUMERIC(14,2) NOT NULL DEFAULT 0,
  descuento_igv NUMERIC(14,2) NOT NULL DEFAULT 0,
  exonerado NUMERIC(14,2) NOT NULL DEFAULT 0,
  inafecto NUMERIC(14,2) NOT NULL DEFAULT 0,
  isc NUMERIC(14,2) NOT NULL DEFAULT 0,
  ivap NUMERIC(14,2) NOT NULL DEFAULT 0,
  icbp NUMERIC(14,2) NOT NULL DEFAULT 0,
  otros NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(5) DEFAULT 'PEN',
  tipo_cambio NUMERIC(10,4),
  fecha_emision_ref DATE,
  tipo_comprobante_ref VARCHAR(2),
  serie_ref VARCHAR(20),
  numero_ref VARCHAR(30),
  estado_sunat VARCHAR(30),
  car_sunat VARCHAR(50),
  raw_linea TEXT,
  CONSTRAINT mve_sire_propuesta_prkey PRIMARY KEY (id_usuario, documento_id, periodo, r_cod, r_serie, r_numero),
  CONSTRAINT mve_sire_propuesta_datos_fk FOREIGN KEY (id_usuario, documento_id, periodo, ticket)
    REFERENCES public.mve_sire_propuesta_datos (id_usuario, documento_id, periodo, ticket) ON DELETE RESTRICT
) PARTITION BY RANGE (periodo);
CREATE TABLE public.mve_sire_propuesta_default PARTITION OF public.mve_sire_propuesta DEFAULT;

CREATE INDEX ix_mco_sire_propuesta_ticket
 ON public.mco_sire_propuesta (id_usuario, documento_id, periodo, ticket);
CREATE INDEX ix_mco_sire_propuesta_estado
 ON public.mco_sire_propuesta (id_usuario, documento_id, periodo_declaracion, estado_contador);
CREATE INDEX ix_mve_sire_propuesta_ticket
 ON public.mve_sire_propuesta (id_usuario, documento_id, periodo, ticket);
CREATE INDEX ix_mve_sire_propuesta_cliente
 ON public.mve_sire_propuesta (id_usuario, documento_id, periodo, tipo_doc_cliente, nro_doc_cliente);
COMMENT ON TABLE public.mco_sire_propuesta IS 'SIRE Compras: una fila por comprobante, con importes tributarios RCE, originales y ajustes del contador.';
COMMENT ON TABLE public.mve_sire_propuesta IS 'SIRE Ventas: una fila por comprobante SUNAT, con importes tributarios RVIE y referencias.';
COMMENT ON COLUMN public.mco_sire_propuesta.r_documento_id IS 'Documento del proveedor; distingue comprobantes con igual tipo, serie y numero de proveedores diferentes.';
COMMENT ON COLUMN public.mco_sire_propuesta.valores_originales IS 'Valores originales SUNAT de este comprobante, preservados al editar.';
COMMENT ON COLUMN public.mco_sire_propuesta.raw_linea IS 'Linea original del TXT RCE de este comprobante.';
COMMENT ON COLUMN public.mve_sire_propuesta.raw_linea IS 'Linea original del TXT RVIE de este comprobante.';
COMMENT ON COLUMN public.mco_sire_propuesta.periodo_declaracion IS 'Periodo previsto de declaracion; no modifica el periodo original de la clave.';
-- Cada FK incluye usuario, empresa, periodo y ticket. Las compras manuales pueden tener ticket NULL.
-- Una nueva descarga genera otra fila en *_datos: no reemplazar archivo/ticket antiguos.
-- El backend debe conciliar explicitamente los comprobantes y preservar los ajustes del contador.
-- Comparacion: facturas contra campos principales del sistema; notas contra los campos
-- de referencia del movimiento interno. En SIRE cada nota conserva su identidad propia.

-- ACEPTACION RVIE: mismo control de estados y contexto, sin id_propuesta antiguo.
CREATE TABLE public.mve_sire_aceptacion (
  id_aceptacion BIGSERIAL,
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  id_libro VARCHAR(6) NOT NULL DEFAULT '140000',
  origen VARCHAR(30) NOT NULL DEFAULT 'TRANSPORTE',
  ticket_propuesta VARCHAR(50) NOT NULL,
  ticket_aceptacion VARCHAR(50),
  estado VARCHAR(20) NOT NULL,
  cantidad_registros INTEGER NOT NULL DEFAULT 0,
  codigo_estado_sunat VARCHAR(10),
  descripcion TEXT,
  respuesta_sunat JSONB,
  solicitado_por TEXT,
  intentos INTEGER NOT NULL DEFAULT 1,
  fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mve_sire_aceptacion_pkey PRIMARY KEY (id_aceptacion),
  CONSTRAINT mve_sire_aceptacion_contexto_uk UNIQUE (id_usuario, documento_id, periodo, id_libro, origen),
  CONSTRAINT mve_sire_aceptacion_propuesta_fk
    FOREIGN KEY (id_usuario, documento_id, periodo, ticket_propuesta)
    REFERENCES public.mve_sire_propuesta_datos (id_usuario, documento_id, periodo, ticket)
    ON DELETE RESTRICT,
  CONSTRAINT mve_sire_aceptacion_estado_check CHECK (estado IN ('ENVIANDO','ENVIADO','TERMINADO','RECHAZADO','INCIERTO')),
  CONSTRAINT mve_sire_aceptacion_id_libro_check CHECK (id_libro='140000'),
  CONSTRAINT mve_sire_aceptacion_origen_check CHECK (origen='TRANSPORTE')
);

-- REEMPLAZO RVIE: conserva UUID, ZIP, respuestas SUNAT y seguimiento de actualizacion.
CREATE TABLE public.mve_sire_reemplazo (
  id_reemplazo UUID NOT NULL,
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  id_libro VARCHAR(6) NOT NULL DEFAULT '140000',
  origen VARCHAR(30) NOT NULL DEFAULT 'TRANSPORTE',
  nombre_archivo TEXT NOT NULL,
  hash_archivo CHAR(64) NOT NULL,
  archivo_zip BYTEA NOT NULL,
  cantidad_registros INTEGER NOT NULL,
  estado VARCHAR(20) NOT NULL,
  ticket_reemplazo VARCHAR(50),
  url_carga TEXT,
  codigo_estado_sunat VARCHAR(10),
  descripcion TEXT,
  respuesta_sunat JSONB,
  solicitado_por TEXT,
  fecha_preparacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  fecha_solicitud TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
  fuente VARCHAR(20) NOT NULL DEFAULT 'ARCHIVO',
  ticket_actualizacion VARCHAR(50),
  estado_actualizacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  error_actualizacion TEXT,
  conciliado_por TEXT,
  fecha_conciliacion TIMESTAMPTZ,
  CONSTRAINT mve_sire_reemplazo_pkey PRIMARY KEY (id_reemplazo),
  CONSTRAINT mve_sire_reemplazo_cantidad_registros_check CHECK (cantidad_registros >= 0),
  CONSTRAINT mve_sire_reemplazo_estado_check CHECK (estado IN ('PREPARADO','ENVIANDO','ENVIADO','TERMINADO','RECHAZADO','INCIERTO')),
  CONSTRAINT mve_sire_reemplazo_id_libro_check CHECK (id_libro='140000'),
  CONSTRAINT mve_sire_reemplazo_origen_check CHECK (origen='TRANSPORTE'),
  CONSTRAINT mve_sire_reemplazo_actualizacion_fk
    FOREIGN KEY (id_usuario, documento_id, periodo, ticket_actualizacion)
    REFERENCES public.mve_sire_propuesta_datos (id_usuario, documento_id, periodo, ticket)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX mve_sire_reemplazo_contexto_idx
  ON public.mve_sire_reemplazo (id_usuario, documento_id, periodo, id_libro, fecha_preparacion DESC);
CREATE UNIQUE INDEX ux_mve_sire_reemplazo_ticket
  ON public.mve_sire_reemplazo (id_usuario, documento_id, periodo, id_libro, ticket_reemplazo)
  WHERE ticket_reemplazo IS NOT NULL;
COMMENT ON COLUMN public.mve_sire_aceptacion.ticket_propuesta IS 'Ticket de descarga de la propuesta aceptada; FK a sus datos generales, separado del ticket de aceptacion.';
COMMENT ON COLUMN public.mve_sire_reemplazo.ticket_actualizacion IS 'Ticket de descarga posterior al reemplazo; NULL hasta solicitarla. Registrar *_propuesta_datos al obtener el ticket, antes del COMMIT, aunque el archivo siga pendiente.';
-- id_aceptacion e id_reemplazo identifican operaciones de control; no son IDs de comprobante.

COMMIT;
