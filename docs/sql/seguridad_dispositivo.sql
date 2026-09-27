-- ============================================================================
--  Control de equipos autorizados
--  Primer paso de seguridad: solo los equipos registrados pueden entrar.
--
--  Que NO se puede usar y por que:
--   - MAC / IP publica: el navegador no puede leer la MAC (restriccion de la
--     plataforma web) y la IP es del router, no del equipo.
--   - User agent / fingerprint: se falsifica en un segundo.
--   - localStorage: se copia desde DevTools.
--  Que SI se usa aqui:
--   Un par de claves ECDSA P-256 generado por el navegador con WebCrypto, en
--   modo NO EXPORTABLE. La clave privada nunca sale del equipo y no se puede
--   copiar: si alguien copia localStorage a otra PC, no puede firmar el reto y
--   el acceso se rechaza. La "huella" es el SHA-256 de la clave publica y es
--   el identificador de la maquina que se registra.
--
--  Como se registra un equipo (ver docs/seguridad-acceso.md):
--   1. El usuario entra con su Gmail, la app genera su clave y muestra un
--      codigo de emparejamiento (ej. 4F2A-9C81-B733).
--   2. Un administrador inserta ese codigo (huella) con una etiqueta del equipo:
--        INSERT INTO mad_seguridad_dispositivo (id_usuario, huella, etiqueta)
--        VALUES ('correo@empresa.com', '4f2a9c81b733', 'PC Recepcion - Ana');
--   3. El usuario recarga y ya puede ingresar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mad_seguridad_dispositivo (
    id_dispositivo  SERIAL PRIMARY KEY,
    id_usuario      varchar(150) NOT NULL,          -- correo con acceso (anfitrion)
    huella          varchar(64)  NOT NULL,          -- SHA-256 de la llave publica, hex
    etiqueta        varchar(120),                   -- nombre legible del equipo
    plataforma      varchar(80),
    navegador       varchar(180),
    llave_publica   text,                           -- SPKI en base64url
    equipo_activo   boolean NOT NULL DEFAULT true,  -- false = revocado
    creado_en       timestamptz NOT NULL DEFAULT now(),
    ultimo_uso      timestamptz,
    CONSTRAINT mad_seguridad_dispositivo_unico UNIQUE (id_usuario, huella)
);

CREATE INDEX IF NOT EXISTS idx_seguridad_dispositivo_usuario
    ON mad_seguridad_dispositivo (id_usuario);

-- Evita multiples equipos por defecto: si en el futuro se decide que cada
-- usuario tenga un unico equipo, basta con:
--   ALTER TABLE mad_seguridad_dispositivo
--     ADD CONSTRAINT mad_seguridad_dispositivo_un_equipo UNIQUE (id_usuario);
