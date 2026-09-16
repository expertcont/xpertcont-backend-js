-- GRE Transportista para encomiendas.
-- Estas columnas son independientes del CPE/RDI:
--   r_vfirmado / numero_rdi  => comprobante electronico de la boleta.
--   grem_*                  => guia de remision electronica transportista.

ALTER TABLE public.mve_transventa
ADD COLUMN IF NOT EXISTS grem_cod varchar(2),
ADD COLUMN IF NOT EXISTS grem_serie varchar(4),
ADD COLUMN IF NOT EXISTS grem_numero varchar(20),
ADD COLUMN IF NOT EXISTS grem_vfirmado varchar(100),
ADD COLUMN IF NOT EXISTS grem_cdr_descripcion varchar(250);

CREATE INDEX IF NOT EXISTS mve_transventa_grem_idx
ON public.mve_transventa (
  id_usuario,
  documento_id,
  periodo,
  grem_cod,
  grem_serie,
  grem_numero
);
