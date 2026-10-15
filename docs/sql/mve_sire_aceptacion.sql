-- Ejecutar antes de desplegar el backend de aceptacion RVIE.
-- El ticket de aceptacion se conserva separado del ticket de descarga de propuesta.
CREATE TABLE IF NOT EXISTS public.mve_sire_aceptacion (
  id_aceptacion BIGSERIAL PRIMARY KEY,
  id_usuario VARCHAR(60) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  id_libro VARCHAR(10) NOT NULL DEFAULT '140000' CHECK (id_libro = '140000'),
  origen VARCHAR(30) NOT NULL DEFAULT 'TRANSPORTE' CHECK (origen = 'TRANSPORTE'),
  id_propuesta BIGINT NOT NULL REFERENCES public.mve_sire_propuesta(id_propuesta),
  ticket_propuesta VARCHAR(50) NOT NULL,
  ticket_aceptacion VARCHAR(50),
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('ENVIANDO','ENVIADO','TERMINADO','RECHAZADO','INCIERTO')),
  cantidad_registros INTEGER NOT NULL DEFAULT 0,
  codigo_estado_sunat VARCHAR(10),
  descripcion TEXT,
  respuesta_sunat JSONB,
  solicitado_por TEXT,
  intentos INTEGER NOT NULL DEFAULT 1,
  fecha_solicitud TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id_usuario, documento_id, periodo, id_libro, origen)
);
