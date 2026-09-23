ALTER TABLE public.mve_transventa
  ADD COLUMN IF NOT EXISTS precio_chofer NUMERIC(14,2) DEFAULT 0;

