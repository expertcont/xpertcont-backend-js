CREATE TABLE IF NOT EXISTS public.mve_sire_propuesta (
  id_propuesta BIGSERIAL PRIMARY KEY,
  id_usuario VARCHAR(20) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  id_libro VARCHAR(10) NOT NULL DEFAULT '140000',
  origen VARCHAR(30) NOT NULL DEFAULT 'TRANSPORTE',
  ticket VARCHAR(50),
  nombre_archivo VARCHAR(300),
  estado VARCHAR(30) NOT NULL DEFAULT 'DESCARGADO',
  cantidad_registros INTEGER NOT NULL DEFAULT 0,
  total_base_gravada NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_exonerado NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_inafecto NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_igv NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_importe NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_descarga TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacion TEXT,
  ctrl_crea TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ctrl_crea_us VARCHAR(20),
  ctrl_mod TIMESTAMP WITHOUT TIME ZONE,
  ctrl_mod_us VARCHAR(20),
  CONSTRAINT mve_sire_propuesta_estado_chk
    CHECK (estado IN ('GENERADO', 'DESCARGADO', 'PARSEADO', 'COMPARADO', 'ANULADO', 'ERROR')),
  CONSTRAINT mve_sire_propuesta_origen_chk
    CHECK (origen IN ('TRANSPORTE', 'COMERCIAL', 'CONTABLE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mve_sire_propuesta_ticket
  ON public.mve_sire_propuesta (id_usuario, documento_id, periodo, id_libro, origen, ticket)
  WHERE ticket IS NOT NULL AND ticket <> '';

CREATE INDEX IF NOT EXISTS ix_mve_sire_propuesta_periodo
  ON public.mve_sire_propuesta (id_usuario, documento_id, periodo, origen, id_libro);

CREATE TABLE IF NOT EXISTS public.mve_sire_propuesta_det (
  id_detalle BIGSERIAL PRIMARY KEY,
  id_propuesta BIGINT NOT NULL REFERENCES public.mve_sire_propuesta(id_propuesta) ON DELETE CASCADE,
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
  ctrl_crea TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ux_mve_sire_propuesta_det_linea UNIQUE (id_propuesta, linea)
);

CREATE INDEX IF NOT EXISTS ix_mve_sire_propuesta_det_comprobante
  ON public.mve_sire_propuesta_det (id_propuesta, tipo_comprobante, serie, numero);

CREATE INDEX IF NOT EXISTS ix_mve_sire_propuesta_det_cliente
  ON public.mve_sire_propuesta_det (id_propuesta, tipo_doc_cliente, nro_doc_cliente);

COMMENT ON TABLE public.mve_sire_propuesta IS
  'Cabecera de propuestas SIRe descargadas desde SUNAT para comparacion administrativa contra registros internos.';

COMMENT ON TABLE public.mve_sire_propuesta_det IS
  'Detalle normalizado de la propuesta SIRe SUNAT por comprobante.';

COMMENT ON COLUMN public.mve_sire_propuesta.origen IS
  'Modulo que origina la comparacion: TRANSPORTE, COMERCIAL o CONTABLE.';

COMMENT ON COLUMN public.mve_sire_propuesta.estado IS
  'Estado administrativo de la propuesta descargada y procesada.';

COMMENT ON COLUMN public.mve_sire_propuesta_det.raw_linea IS
  'Linea original del TXT SIRe, conservada para auditoria y trazabilidad.';
