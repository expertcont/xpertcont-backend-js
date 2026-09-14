CREATE TABLE IF NOT EXISTS public.mve_transmotivo (
    id_usuario VARCHAR(50) NOT NULL,
    documento_id VARCHAR(20) NOT NULL,
    id_motivo VARCHAR(10) NOT NULL,
    tipo_movimiento CHAR(1) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT mve_transmotivo_pkey
        PRIMARY KEY (id_usuario, documento_id, id_motivo),
    CONSTRAINT mve_transmotivo_tipo_check
        CHECK (tipo_movimiento IN ('I', 'S')),
    CONSTRAINT mve_transmotivo_activo_check
        CHECK (activo IN (0, 1))
);

CREATE TABLE IF NOT EXISTS public.mve_transcaja (
    id_usuario VARCHAR(50) NOT NULL,
    documento_id VARCHAR(20) NOT NULL,
    periodo VARCHAR(7) NOT NULL,
    id_movimiento BIGINT NOT NULL,
    fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_punto_venta VARCHAR(20) NOT NULL,
    tipo_movimiento CHAR(1) NOT NULL,
    id_motivo VARCHAR(10) NOT NULL,
    descripcion VARCHAR(200),
    importe NUMERIC(14,2) NOT NULL,
    id_forma_pago VARCHAR(5) NOT NULL,
    nro_operacion VARCHAR(50),
    beneficiario VARCHAR(100),
    documento_beneficiario VARCHAR(20),
    id_invitado VARCHAR(50),
    registrado INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT mve_transcaja_pkey
        PRIMARY KEY (id_usuario, documento_id, periodo, id_movimiento),
    CONSTRAINT mve_transcaja_importe_check
        CHECK (importe > 0),
    CONSTRAINT mve_transcaja_tipo_check
        CHECK (tipo_movimiento IN ('I', 'S')),
    CONSTRAINT mve_transcaja_registrado_check
        CHECK (registrado IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_mve_transcaja_filtros
    ON public.mve_transcaja (id_usuario, documento_id, periodo, id_punto_venta, fecha);

CREATE INDEX IF NOT EXISTS idx_mve_transcaja_motivo
    ON public.mve_transcaja (id_usuario, documento_id, id_motivo);

CREATE INDEX IF NOT EXISTS idx_mve_transmotivo_tipo
    ON public.mve_transmotivo (id_usuario, documento_id, tipo_movimiento, activo);

-- Seed sugerido. Ejecutar cambiando los valores de id_usuario/documento_id por empresa.
-- INSERT INTO public.mve_transmotivo (id_usuario, documento_id, id_motivo, tipo_movimiento, nombre)
-- VALUES
--   (:id_usuario, :documento_id, 'COMB', 'S', 'Combustible'),
--   (:id_usuario, :documento_id, 'CHO',  'S', 'Pago a chofer'),
--   (:id_usuario, :documento_id, 'EST',  'S', 'Estiba / carga'),
--   (:id_usuario, :documento_id, 'MOV',  'S', 'Movilidad'),
--   (:id_usuario, :documento_id, 'MANT', 'S', 'Mantenimiento'),
--   (:id_usuario, :documento_id, 'ALI',  'S', 'Alimentacion'),
--   (:id_usuario, :documento_id, 'DEV',  'S', 'Devolucion'),
--   (:id_usuario, :documento_id, 'OFI',  'S', 'Gastos de oficina'),
--   (:id_usuario, :documento_id, 'OTRS', 'S', 'Otros'),
--   (:id_usuario, :documento_id, 'AJUI', 'I', 'Ajuste de ingreso'),
--   (:id_usuario, :documento_id, 'OTRI', 'I', 'Otros ingresos')
-- ON CONFLICT (id_usuario, documento_id, id_motivo) DO NOTHING;
