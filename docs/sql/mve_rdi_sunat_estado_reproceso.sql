ALTER TABLE public.mve_rdi_sunat
ADD COLUMN IF NOT EXISTS estado_reproceso varchar(30);

COMMENT ON COLUMN public.mve_rdi_sunat.estado_reproceso IS
'Estado interno posterior al resultado SUNAT. Ejemplo: REPROCESADO indica que un RDI rechazado fue liberado para generar un nuevo RDI, conservando el estado tributario original.';

UPDATE public.mve_rdi_sunat
   SET estado = 'RECHAZADO',
       estado_reproceso = 'REPROCESADO',
       respuesta_desc = LEFT(
         COALESCE(respuesta_desc, '')
         || CASE WHEN COALESCE(respuesta_desc, '') = '' THEN '' ELSE ' | ' END
         || 'Migrado: rechazo original marcado como reprocesado.',
         500
       ),
       ctrl_actualiza = CURRENT_TIMESTAMP
 WHERE estado = 'CORREGIDO'
   AND COALESCE(estado_reproceso, '') = '';
