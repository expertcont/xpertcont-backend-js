-- Ejecutar antes de desplegar el backend que muestra la fecha del ticket.
-- Sin DEFAULT: la fecha de tickets anteriores no se conoce.
ALTER TABLE public.mct_contabilidadticket
  ADD COLUMN IF NOT EXISTS sire_tpropuesta_fecha_generacion TIMESTAMP WITH TIME ZONE;
