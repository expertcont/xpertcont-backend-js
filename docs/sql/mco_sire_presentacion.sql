-- SIRE Compras (RCE): controles de aceptacion y reemplazo para cualquier rubro.
-- Ejecutar DESPUES de contar con public.mco_sire_propuesta_datos.
-- Script adicional: no recrea tablas ni borra propuestas o ajustes existentes.
-- Estos controles no implementan por si solos el envio de declaraciones a SUNAT.
-- Los UUID de operacion se generan en la aplicacion; no requieren extensiones.
BEGIN;

CREATE TABLE IF NOT EXISTS public.mco_sire_aceptacion (
  id_aceptacion UUID NOT NULL,
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  id_libro VARCHAR(6) NOT NULL DEFAULT '080000',
  ticket_propuesta VARCHAR(50) NOT NULL,
  ticket_aceptacion VARCHAR(50),
  estado VARCHAR(20) NOT NULL,
  cantidad_registros INTEGER NOT NULL DEFAULT 0,
  codigo_estado_sunat VARCHAR(10),
  descripcion TEXT,
  respuesta_sunat JSONB,
  solicitado_por TEXT,
  intentos INTEGER NOT NULL DEFAULT 1,
  fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mco_sire_aceptacion_pkey PRIMARY KEY (id_aceptacion),
  CONSTRAINT mco_sire_aceptacion_contexto_uk
    UNIQUE (id_usuario, documento_id, periodo, id_libro),
  CONSTRAINT mco_sire_aceptacion_propuesta_fk
    FOREIGN KEY (id_usuario, documento_id, periodo, ticket_propuesta)
    REFERENCES public.mco_sire_propuesta_datos (id_usuario, documento_id, periodo, ticket)
    ON DELETE RESTRICT,
  CONSTRAINT mco_sire_aceptacion_libro_check CHECK (id_libro = '080000'),
  CONSTRAINT mco_sire_aceptacion_estado_check
    CHECK (estado IN ('ENVIANDO','ENVIADO','TERMINADO','RECHAZADO','INCIERTO')),
  CONSTRAINT mco_sire_aceptacion_cantidad_check CHECK (cantidad_registros >= 0),
  CONSTRAINT mco_sire_aceptacion_intentos_check CHECK (intentos > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mco_sire_aceptacion_ticket
  ON public.mco_sire_aceptacion (id_usuario, documento_id, periodo, id_libro, ticket_aceptacion)
  WHERE ticket_aceptacion IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mco_sire_reemplazo (
  id_reemplazo UUID NOT NULL,
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  id_libro VARCHAR(6) NOT NULL DEFAULT '080000',
  ticket_propuesta VARCHAR(50),
  nombre_archivo TEXT NOT NULL,
  hash_archivo CHAR(64) NOT NULL,
  archivo_zip BYTEA NOT NULL,
  cantidad_registros INTEGER NOT NULL,
  estado VARCHAR(20) NOT NULL,
  ticket_reemplazo VARCHAR(50),
  url_carga TEXT,
  codigo_estado_sunat VARCHAR(10),
  descripcion TEXT,
  respuesta_sunat JSONB,
  solicitado_por TEXT,
  fecha_preparacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  fecha_solicitud TIMESTAMPTZ,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
  fuente VARCHAR(20) NOT NULL DEFAULT 'PERSONALIZADA',
  ticket_actualizacion VARCHAR(50),
  estado_actualizacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  error_actualizacion TEXT,
  conciliado_por TEXT,
  fecha_conciliacion TIMESTAMPTZ,
  CONSTRAINT mco_sire_reemplazo_pkey PRIMARY KEY (id_reemplazo),
  CONSTRAINT mco_sire_reemplazo_libro_check CHECK (id_libro = '080000'),
  CONSTRAINT mco_sire_reemplazo_periodo_check CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT mco_sire_reemplazo_cantidad_check CHECK (cantidad_registros >= 0),
  CONSTRAINT mco_sire_reemplazo_estado_check
    CHECK (estado IN ('PREPARADO','ENVIANDO','ENVIADO','TERMINADO','RECHAZADO','INCIERTO')),
  CONSTRAINT mco_sire_reemplazo_fuente_check CHECK (fuente IN ('PERSONALIZADA','ARCHIVO')),
  CONSTRAINT mco_sire_reemplazo_propuesta_fk
    FOREIGN KEY (id_usuario, documento_id, periodo, ticket_propuesta)
    REFERENCES public.mco_sire_propuesta_datos (id_usuario, documento_id, periodo, ticket)
    ON DELETE RESTRICT,
  CONSTRAINT mco_sire_reemplazo_actualizacion_fk
    FOREIGN KEY (id_usuario, documento_id, periodo, ticket_actualizacion)
    REFERENCES public.mco_sire_propuesta_datos (id_usuario, documento_id, periodo, ticket)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS mco_sire_reemplazo_contexto_idx
  ON public.mco_sire_reemplazo (id_usuario, documento_id, periodo, id_libro, fecha_preparacion DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mco_sire_reemplazo_ticket
  ON public.mco_sire_reemplazo (id_usuario, documento_id, periodo, id_libro, ticket_reemplazo)
  WHERE ticket_reemplazo IS NOT NULL;

COMMENT ON TABLE public.mco_sire_aceptacion IS
  'Control RCE de aceptacion por usuario, empresa y periodo, compartido entre rubros. No almacena comprobantes.';
COMMENT ON TABLE public.mco_sire_reemplazo IS
  'Control RCE de reemplazo: conserva el ZIP enviado y seguimiento, sin duplicar las filas operativas de compras.';
COMMENT ON COLUMN public.mco_sire_reemplazo.ticket_propuesta IS
  'Descarga de origen; puede ser NULL para una preparacion sin propuesta SUNAT descargada.';
COMMENT ON COLUMN public.mco_sire_reemplazo.ticket_actualizacion IS
  'Descarga posterior al reemplazo. Crear su fila en mco_sire_propuesta_datos antes del COMMIT, aunque el archivo siga pendiente.';
-- mct_contabilidadticket conserva su funcion actual de control de tickets.
-- No volver a ejecutar sire_recrear_cabecera_detalle.sql para agregar estos controles.
COMMIT;
