ALTER TABLE public.mve_transventa
  ADD COLUMN IF NOT EXISTS cdr_codigo varchar(20),
  ADD COLUMN IF NOT EXISTS cdr_nivel varchar(20),
  ADD COLUMN IF NOT EXISTS cdr_pendiente varchar(1);

COMMENT ON COLUMN public.mve_transventa.cdr_codigo IS
  'Codigo CDR devuelto por SUNAT para envios individuales de transporte.';

COMMENT ON COLUMN public.mve_transventa.cdr_nivel IS
  'Nivel normalizado de respuesta SUNAT: ACEPTADO, RECHAZADO, PENDIENTE o ERROR.';

COMMENT ON COLUMN public.mve_transventa.cdr_pendiente IS
  'Marca de CDR pendiente devuelta por SUNAT para envios individuales de transporte.';
