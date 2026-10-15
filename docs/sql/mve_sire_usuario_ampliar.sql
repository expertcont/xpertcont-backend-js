-- Ejecutar en Railway antes de desplegar el backend actualizado.
-- Permite anfitriones identificados por correos de hasta 60 caracteres.
BEGIN;
ALTER TABLE IF EXISTS public.mve_sire_propuesta
  ALTER COLUMN id_usuario TYPE VARCHAR(60);
ALTER TABLE IF EXISTS public.mve_sire_aceptacion
  ALTER COLUMN id_usuario TYPE VARCHAR(60);
ALTER TABLE IF EXISTS public.mve_sire_reemplazo
  ALTER COLUMN id_usuario TYPE VARCHAR(60);
COMMIT;
