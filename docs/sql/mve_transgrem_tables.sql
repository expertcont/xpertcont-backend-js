-- GRE Transportista para encomiendas.
-- Cabecera y detalle de guias de remision electronica transportista.
--
-- mve_transgrem:
--   Cabecera de la GRE Transportista emitida.
--
-- mve_transgremdet:
--   Encomiendas incluidas en la GRE.

CREATE TABLE IF NOT EXISTS public.mve_transgrem (
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,

  -- Identificacion GRE Transportista
  cod VARCHAR(2) NOT NULL,
  serie VARCHAR(5) NOT NULL,
  numero VARCHAR(22) NOT NULL,

  -- Emision
  fecha_emision DATE,
  hora_emision TIME(5) WITHOUT TIME ZONE,

  -- Traslado
  fecha_traslado DATE,
  guia_motivo_id VARCHAR(2),
  guia_modalidad_id VARCHAR(2),

  -- Partida
  partida_ubigeo VARCHAR(20),
  partida_direccion VARCHAR(200),

  -- Llegada
  llegada_ubigeo VARCHAR(20),
  llegada_direccion VARCHAR(200),

  -- Carga
  peso_total NUMERIC(14,2),

  -- Conductor
  conductor_dni VARCHAR(20),
  conductor_nombres VARCHAR(50),
  conductor_apellidos VARCHAR(100),
  conductor_licencia VARCHAR(20),

  -- Vehiculo
  vehiculo_placa VARCHAR(20),

  -- Destinatario
  destinatario_tipo VARCHAR(2),
  destinatario_ruc_dni VARCHAR(20),
  destinatario_razon_social VARCHAR(200),

  -- Control SUNAT
  vfirmado VARCHAR(100),
  glosa VARCHAR(400),

  -- Auditoria
  ctrl_crea TIMESTAMP(5) WITHOUT TIME ZONE,
  ctrl_crea_us VARCHAR(50),
  ctrl_mod TIMESTAMP(5) WITHOUT TIME ZONE,
  ctrl_mod_us VARCHAR(50),

  -- Documento de referencia
  ref_cod VARCHAR(2),
  ref_serie VARCHAR(5),
  ref_numero VARCHAR(22),

  libre VARCHAR(2),

  CONSTRAINT mve_transgrem_prkey
    PRIMARY KEY (
      id_usuario,
      documento_id,
      periodo,
      cod,
      serie,
      numero
    )
);

CREATE INDEX IF NOT EXISTS mve_transgrem_fecha_idx
ON public.mve_transgrem (
  id_usuario,
  documento_id,
  periodo,
  fecha_traslado
);

CREATE INDEX IF NOT EXISTS mve_transgrem_ref_idx
ON public.mve_transgrem (
  id_usuario,
  documento_id,
  periodo,
  ref_cod,
  ref_serie,
  ref_numero
);

CREATE TABLE IF NOT EXISTS public.mve_transgremdet (
  id_usuario VARCHAR(50) NOT NULL,
  documento_id VARCHAR(20) NOT NULL,
  periodo VARCHAR(10) NOT NULL,

  -- GRE Transportista
  cod VARCHAR(2) NOT NULL,
  serie VARCHAR(5) NOT NULL,
  numero VARCHAR(22) NOT NULL,
  item INTEGER NOT NULL,

  -- Datos declarados
  cantidad NUMERIC(14,2),
  descripcion VARCHAR(300),
  id_producto VARCHAR(20),
  cont_und VARCHAR(20),

  -- Referencia a la encomienda en mve_transventa
  r_periodo VARCHAR(10) NOT NULL,
  r_cod VARCHAR(2) NOT NULL,
  r_serie VARCHAR(5) NOT NULL,
  r_numero VARCHAR(22) NOT NULL,

  -- Auditoria
  ctrl_crea TIMESTAMP(5) WITHOUT TIME ZONE,
  ctrl_crea_us VARCHAR(50),
  ctrl_mod TIMESTAMP(5) WITHOUT TIME ZONE,
  ctrl_mod_us VARCHAR(50),

  CONSTRAINT mve_transgremdet_prkey
    PRIMARY KEY (
      id_usuario,
      documento_id,
      periodo,
      cod,
      serie,
      numero,
      item
    )
);
