-- Sincroniza acciones de permisos para Entregas de encomienda.
-- Registrar constancias no debe ser permiso; es salida/reporte posterior.

INSERT INTO public.mad_menu_accion (
  id_accion, id_item, nombre, descripcion, orden,
  requiere_admin, requiere_supervisor, activo
)
SELECT
  'transporte.entregas.marcar_llegada',
  'transporte.entregas',
  'Marcar llegada',
  'Registrar llegada con hora servidor',
  10,
  FALSE,
  FALSE,
  TRUE
WHERE EXISTS (
  SELECT 1
    FROM public.mad_menu_item
   WHERE id_item = 'transporte.entregas'
)
ON CONFLICT (id_accion) DO UPDATE
SET id_item = EXCLUDED.id_item,
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    orden = EXCLUDED.orden,
    requiere_admin = EXCLUDED.requiere_admin,
    requiere_supervisor = EXCLUDED.requiere_supervisor,
    activo = TRUE;

DELETE FROM public.mad_menu_permiso_accion
 WHERE id_accion = 'transporte.entregas.constancia';

UPDATE public.mad_menu_accion
   SET activo = FALSE
 WHERE id_accion = 'transporte.entregas.constancia';

