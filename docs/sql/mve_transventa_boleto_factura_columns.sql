ALTER TABLE public.mve_transventa
  ADD COLUMN IF NOT EXISTS ref_pasajero_dni varchar(20),
  ADD COLUMN IF NOT EXISTS ref_pasajero_nombres varchar(200);

COMMENT ON COLUMN public.mve_transventa.ref_pasajero_dni IS
  'DNI del pasajero cuando el boleto se factura a RUC.';

COMMENT ON COLUMN public.mve_transventa.ref_pasajero_nombres IS
  'Nombres del pasajero cuando el boleto se factura a RUC.';
