-- Ejecutar una vez antes de desplegar el CRUD de propuesta personalizada.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mco_sire_personalizada (
 id_compra BIGSERIAL PRIMARY KEY,
 id_usuario VARCHAR(60) NOT NULL,
 documento_id VARCHAR(11) NOT NULL,
 clave TEXT NOT NULL,
 clave_origen TEXT,
 periodo_origen VARCHAR(7) NOT NULL CHECK (periodo_origen ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 periodo_destino VARCHAR(7) NOT NULL CHECK (periodo_destino ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 origen VARCHAR(10) NOT NULL CHECK (origen IN ('SUNAT','MANUAL')),
 ticket_origen VARCHAR(50),
 estado VARCHAR(15) NOT NULL DEFAULT 'DECLARAR' CHECK (estado IN ('DECLARAR','EXCLUIDO','PENDIENTE')),
 motivo VARCHAR(1000) NOT NULL DEFAULT '',
 comprobante JSONB NOT NULL CHECK (jsonb_typeof(comprobante)='object'),
 original JSONB NOT NULL CHECK (jsonb_typeof(original)='object'),
 version INTEGER NOT NULL DEFAULT 1,
 historial JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(historial)='array'),
 fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK (periodo_destino >= periodo_origen),
 CHECK (estado='DECLARAR' OR length(trim(motivo))>0),
 UNIQUE (id_usuario,documento_id,clave),
 UNIQUE (id_usuario,documento_id,clave_origen)
);
CREATE INDEX IF NOT EXISTS mco_sire_personalizada_periodos ON public.mco_sire_personalizada(id_usuario,documento_id,periodo_origen,periodo_destino);
COMMIT;
