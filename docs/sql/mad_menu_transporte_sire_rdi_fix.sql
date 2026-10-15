-- Renombrar las dos opciones existentes sin modificar comandos ni permisos asignados.
BEGIN;
UPDATE public.mad_menu_item
SET nombre = 'REPORTE SIRE',
    ruta = '/ad_transportesire',
    requiere_admin = FALSE,
    requiere_supervisor = FALSE
WHERE id_item = 'transporte.sunat.rdi';

UPDATE public.mad_menu_item
SET nombre = 'HISTORIAL RDI y CDR',
    ruta = '/ad_transporterdiencomienda',
    requiere_admin = FALSE,
    requiere_supervisor = FALSE
WHERE id_item = 'transporte.sunat.bajas';
COMMIT;

SELECT id_item, nombre, ruta, activo
FROM public.mad_menu_item
WHERE id_item IN ('transporte.sunat.rdi', 'transporte.sunat.bajas');
