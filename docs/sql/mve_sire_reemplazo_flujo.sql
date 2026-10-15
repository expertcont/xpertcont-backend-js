-- Aplicar despues de propuesta, aceptacion y reemplazo. Conserva el historial.
ALTER TABLE public.mve_sire_reemplazo
  ADD COLUMN IF NOT EXISTS resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fuente VARCHAR(20) NOT NULL DEFAULT 'ARCHIVO',
  ADD COLUMN IF NOT EXISTS ticket_actualizacion VARCHAR(50),
  ADD COLUMN IF NOT EXISTS estado_actualizacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS id_propuesta_actualizada BIGINT REFERENCES public.mve_sire_propuesta(id_propuesta),
  ADD COLUMN IF NOT EXISTS error_actualizacion TEXT,
  ADD COLUMN IF NOT EXISTS conciliado_por TEXT,
  ADD COLUMN IF NOT EXISTS fecha_conciliacion TIMESTAMPTZ;
ALTER TABLE public.mve_sire_propuesta DROP CONSTRAINT IF EXISTS mve_sire_propuesta_estado_chk;
ALTER TABLE public.mve_sire_propuesta ADD CONSTRAINT mve_sire_propuesta_estado_chk
  CHECK (estado IN ('GENERADO','DESCARGADO','PARSEADO','COMPARADO','ANULADO','ERROR','REEMPLAZADO'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_mve_sire_reemplazo_ticket
  ON public.mve_sire_reemplazo (id_usuario, documento_id, periodo, id_libro, ticket_reemplazo)
  WHERE ticket_reemplazo IS NOT NULL;