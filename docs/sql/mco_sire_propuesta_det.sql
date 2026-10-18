-- SIRE Compras compartido por Comercial y Transporte.
-- Cabecera existente: public.mco_sire_propuesta.
-- Ejecutar primero docs/sql/mco_sire_propuesta.sql si aun no existe la cabecera.
-- Primera etapa del plan de refactorizacion: estructura RCE y datos de ajuste.
-- No migra datos, no cambia el CRUD actual ni modifica los flujos SUNAT.
-- Se conservan archivo BYTEA, detalle JSONB y las tablas anteriores.
BEGIN;

-- Opcional mientras el CRUD actual no informe el rubro de la descarga.
ALTER TABLE public.mco_sire_propuesta
  ADD COLUMN IF NOT EXISTS rubro VARCHAR(15)
  CHECK (rubro IN ('COMERCIAL', 'TRANSPORTE'));

CREATE TABLE IF NOT EXISTS public.mco_sire_propuesta_det (
  id_detalle BIGSERIAL PRIMARY KEY,
  id_propuesta BIGINT NOT NULL
    REFERENCES public.mco_sire_propuesta(id_propuesta) ON DELETE RESTRICT,
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
  -- RCE: conservar por separado DG, DGNG y DNG (columnas 15 a 21).
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
  -- Campos adicionales del formato RCE, conservados por comprobante.
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

  CONSTRAINT mco_sire_propuesta_det_linea_chk CHECK (linea IS NULL OR linea > 0),
  CONSTRAINT mco_sire_propuesta_det_tipo_chk CHECK (tipo_comprobante ~ '^[0-9]{2}$'),
  CONSTRAINT mco_sire_propuesta_det_numero_chk CHECK (length(btrim(numero)) > 0),
  CONSTRAINT mco_sire_propuesta_det_proveedor_chk CHECK (
    length(btrim(tipo_doc_proveedor)) > 0
    AND length(btrim(documento_proveedor)) > 0
    AND length(btrim(proveedor)) > 0
    AND (tipo_doc_proveedor <> '6' OR documento_proveedor ~ '^[0-9]{11}$')
  ),
  CONSTRAINT mco_sire_propuesta_det_moneda_chk CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT mco_sire_propuesta_det_tc_chk CHECK (tipo_cambio >= 0),
  CONSTRAINT mco_sire_propuesta_det_origen_chk CHECK (origen IN ('SUNAT', 'MANUAL')),
  CONSTRAINT mco_sire_propuesta_det_estado_chk CHECK (
    estado_contador IN ('INCLUIDO', 'EXCLUIDO', 'OBSERVADO', 'PENDIENTE')
  ),
  CONSTRAINT mco_sire_propuesta_det_declaracion_chk CHECK (
    periodo_declaracion IS NULL OR periodo_declaracion ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  CONSTRAINT mco_sire_propuesta_det_motivo_chk CHECK (
    estado_contador = 'INCLUIDO' OR length(btrim(COALESCE(motivo_ajuste, ''))) > 0
  ),
  CONSTRAINT mco_sire_propuesta_det_adicionales_chk CHECK (jsonb_typeof(datos_adicionales) = 'object'),
  CONSTRAINT mco_sire_propuesta_det_original_chk CHECK (
    valores_originales IS NULL OR jsonb_typeof(valores_originales) = 'object'
  ),
  CONSTRAINT mco_sire_propuesta_det_version_chk CHECK (version > 0),
  CONSTRAINT ux_mco_sire_propuesta_det_linea UNIQUE (id_propuesta, linea)
);

-- La empresa y el periodo de origen se obtienen de la cabecera mediante id_propuesta.
CREATE INDEX IF NOT EXISTS ix_mco_sire_propuesta_det_proveedor
  ON public.mco_sire_propuesta_det (id_propuesta, documento_proveedor);

CREATE INDEX IF NOT EXISTS ix_mco_sire_propuesta_det_comprobante
  ON public.mco_sire_propuesta_det (id_propuesta, tipo_comprobante, serie, numero);

CREATE INDEX IF NOT EXISTS ix_mco_sire_propuesta_det_estado
  ON public.mco_sire_propuesta_det (estado_contador, periodo_declaracion, id_propuesta);

COMMENT ON TABLE public.mco_sire_propuesta_det IS
  'Comprobantes de SIRE Compras para Comercial y Transporte, vinculados a la cabecera de la propuesta.';
COMMENT ON COLUMN public.mco_sire_propuesta.rubro IS
  'Rubro de la empresa. NULL mientras no se haya informado; no se deduce durante esta ampliacion.';
COMMENT ON COLUMN public.mco_sire_propuesta_det.linea IS
  'Linea del archivo original; NULL para comprobantes agregados manualmente.';
COMMENT ON COLUMN public.mco_sire_propuesta_det.origen IS
  'SUNAT para descargados y MANUAL para agregados por el contador.';
COMMENT ON COLUMN public.mco_sire_propuesta_det.valores_originales IS
  'Valores originales por comprobante. El futuro CRUD debe preservarlos al editar.';
COMMENT ON COLUMN public.mco_sire_propuesta_det.periodo_declaracion IS
  'Periodo previsto de declaracion o revision; el periodo de origen permanece en la cabecera.';
COMMENT ON COLUMN public.mco_sire_propuesta_det.otros IS
  'Otros tributos y cargos: columna 24 del TXT RCE revisado. ISC e ICBPER se almacenan por separado.';
COMMENT ON COLUMN public.mco_sire_propuesta_det.fecha_modificacion IS
  'Debe actualizarse explicitamente desde el CRUD al modificar el registro.';

-- Compatibilidad con el esquema basico: agregar campos RCE faltantes sin eliminar los anteriores.
ALTER TABLE public.mco_sire_propuesta_det
 ADD COLUMN IF NOT EXISTS car_sunat VARCHAR(100),
 ADD COLUMN IF NOT EXISTS fecha_emision DATE,
 ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE,
 ADD COLUMN IF NOT EXISTS tipo_comprobante VARCHAR(2),
 ADD COLUMN IF NOT EXISTS serie VARCHAR(20),
 ADD COLUMN IF NOT EXISTS ano_dam VARCHAR(4),
 ADD COLUMN IF NOT EXISTS numero VARCHAR(30),
 ADD COLUMN IF NOT EXISTS numero_final VARCHAR(30),
 ADD COLUMN IF NOT EXISTS tipo_doc_proveedor VARCHAR(2),
 ADD COLUMN IF NOT EXISTS documento_proveedor VARCHAR(20),
 ADD COLUMN IF NOT EXISTS proveedor VARCHAR(300),
 ADD COLUMN IF NOT EXISTS base_gravada_dg NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS igv_dg NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS base_gravada_dgng NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS igv_dgng NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS base_gravada_dng NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS igv_dng NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS valor_adquisicion_ng NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS isc NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS icbper NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS otros NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS total NUMERIC(18,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS moneda VARCHAR(3),
 ADD COLUMN IF NOT EXISTS tipo_cambio NUMERIC(14,6) NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS fecha_emision_ref DATE,
 ADD COLUMN IF NOT EXISTS tipo_comprobante_ref VARCHAR(2),
 ADD COLUMN IF NOT EXISTS serie_ref VARCHAR(20),
 ADD COLUMN IF NOT EXISTS codigo_dam_dsi_ref VARCHAR(30),
 ADD COLUMN IF NOT EXISTS numero_ref VARCHAR(30),
 ADD COLUMN IF NOT EXISTS clasificacion_bienes_servicios VARCHAR(10),
 ADD COLUMN IF NOT EXISTS datos_adicionales JSONB NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS raw_linea TEXT,
 ADD COLUMN IF NOT EXISTS valores_originales JSONB,
 ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Campos de versionado de la cabecera. No se eliminan archivo ni detalle JSONB.
ALTER TABLE public.mco_sire_propuesta
 ADD COLUMN IF NOT EXISTS tipo_cabecera VARCHAR(10) NOT NULL DEFAULT 'SUNAT',
 ADD COLUMN IF NOT EXISTS estado_normalizacion VARCHAR(30) NOT NULL DEFAULT 'LEGADO',
 ADD COLUMN IF NOT EXISTS normalizacion_version INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS huella_archivo VARCHAR(64),
 ADD COLUMN IF NOT EXISTS cantidad_registros INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS totales_originales JSONB NOT NULL DEFAULT '{}';

-- Una cabecera de trabajo permite altas manuales antes de descargar SUNAT.
-- Las cabeceras SUNAT siguen requiriendo su archivo y ticket.
ALTER TABLE public.mco_sire_propuesta ALTER COLUMN ticket DROP NOT NULL;
ALTER TABLE public.mco_sire_propuesta ALTER COLUMN nombre_archivo DROP NOT NULL;
ALTER TABLE public.mco_sire_propuesta ALTER COLUMN archivo DROP NOT NULL;
DO $mco$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.mco_sire_propuesta'::regclass AND conname='mco_sire_cabecera_tipo_chk') THEN
  ALTER TABLE public.mco_sire_propuesta ADD CONSTRAINT mco_sire_cabecera_tipo_chk CHECK (
   tipo_cabecera IN ('SUNAT','TRABAJO') AND (tipo_cabecera='TRABAJO' OR (ticket IS NOT NULL AND archivo IS NOT NULL AND nombre_archivo IS NOT NULL))
  );
 END IF;
END $mco$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mco_sire_cabecera_scope
 ON public.mco_sire_propuesta(id_propuesta,id_usuario,documento_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mco_sire_cabecera_trabajo
 ON public.mco_sire_propuesta(id_usuario,documento_id,periodo) WHERE tipo_cabecera='TRABAJO';

ALTER TABLE public.mco_sire_propuesta_det
 ADD COLUMN IF NOT EXISTS id_usuario VARCHAR(60),
 ADD COLUMN IF NOT EXISTS documento_id VARCHAR(11),
 ADD COLUMN IF NOT EXISTS periodo_origen VARCHAR(7),
 ADD COLUMN IF NOT EXISTS clave_documental TEXT,
 ADD COLUMN IF NOT EXISTS clave_origen TEXT,
 ADD COLUMN IF NOT EXISTS operativo BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS id_personalizada_legacy BIGINT,
 ADD COLUMN IF NOT EXISTS historial JSONB NOT NULL DEFAULT '[]';
DO $mco$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.mco_sire_propuesta_det'::regclass AND conname='mco_sire_det_scope_fk') THEN
  ALTER TABLE public.mco_sire_propuesta_det ADD CONSTRAINT mco_sire_det_scope_fk
   FOREIGN KEY (id_propuesta,id_usuario,documento_id)
   REFERENCES public.mco_sire_propuesta(id_propuesta,id_usuario,documento_id) ON DELETE RESTRICT;
 END IF;
END $mco$;
ALTER TABLE public.mco_sire_propuesta_det DROP CONSTRAINT IF EXISTS mco_sire_propuesta_det_tc_chk;
ALTER TABLE public.mco_sire_propuesta_det ADD CONSTRAINT mco_sire_propuesta_det_tc_chk CHECK (tipo_cambio >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mco_sire_det_operativo
 ON public.mco_sire_propuesta_det(id_usuario,documento_id,clave_documental) WHERE operativo;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mco_sire_det_legacy
 ON public.mco_sire_propuesta_det(id_personalizada_legacy) WHERE id_personalizada_legacy IS NOT NULL;
COMMIT;