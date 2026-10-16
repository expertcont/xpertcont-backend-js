-- SIRE Compras general (RCE 080000). No modifica asientos ni el SIRE de Transporte.
BEGIN;
ALTER TABLE public.mct_contabilidadticket
  ADD COLUMN IF NOT EXISTS sire_tpropuesta_fecha_generacion TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS public.mco_sire_propuesta (
  id_propuesta BIGSERIAL PRIMARY KEY,
  id_usuario VARCHAR(60) NOT NULL,
  documento_id VARCHAR(11) NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  ticket VARCHAR(50) NOT NULL,
  nombre_archivo VARCHAR(300) NOT NULL,
  fecha_descarga TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  archivo BYTEA NOT NULL,
  detalle JSONB NOT NULL CHECK (jsonb_typeof(detalle) = 'array'),
  UNIQUE (id_usuario, documento_id, periodo, ticket)
);
COMMIT;
