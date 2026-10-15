-- Ejecutar despues de mve_sire_aceptacion.sql. No envia informacion a SUNAT.
CREATE TABLE IF NOT EXISTS public.mve_sire_reemplazo (
  id_reemplazo UUID PRIMARY KEY,
  id_usuario VARCHAR(60) NOT NULL,
  documento_id VARCHAR(11) NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  id_libro VARCHAR(10) NOT NULL DEFAULT '140000' CHECK (id_libro = '140000'),
  origen VARCHAR(30) NOT NULL DEFAULT 'TRANSPORTE' CHECK (origen = 'TRANSPORTE'),
  nombre_archivo TEXT NOT NULL,
  hash_archivo CHAR(64) NOT NULL,
  archivo_zip BYTEA NOT NULL,
  cantidad_registros INTEGER NOT NULL CHECK (cantidad_registros >= 0),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('PREPARADO','ENVIANDO','ENVIADO','TERMINADO','RECHAZADO','INCIERTO')),
  ticket_reemplazo VARCHAR(50),
  url_carga TEXT,
  codigo_estado_sunat VARCHAR(10),
  descripcion TEXT,
  respuesta_sunat JSONB,
  solicitado_por TEXT,
  fecha_preparacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  fecha_solicitud TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS mve_sire_reemplazo_contexto_idx
  ON public.mve_sire_reemplazo (id_usuario, documento_id, periodo, id_libro, fecha_preparacion DESC);