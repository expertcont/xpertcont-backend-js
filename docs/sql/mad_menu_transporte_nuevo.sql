-- Catalogo nuevo para renderizar menus y permisos por rubro/modulo.
-- No reemplaza de inmediato a mad_menucomando; puede convivir mientras se migra.
--
-- rubro es el separador funcional: TRANSPORTE, CONT, COMERCIAL, STOCK, PROY, etc.
-- Cada rubro puede definir su propia distribucion de menus, grupos, pantallas
-- y acciones sin forzar la estructura de otros modulos.

CREATE TABLE IF NOT EXISTS public.mad_menu_item (
  id_item VARCHAR(50) PRIMARY KEY,
  id_padre VARCHAR(50),
  rubro VARCHAR(20) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'PANTALLA',
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(200),
  ruta VARCHAR(180),
  icono VARCHAR(50),
  orden INTEGER NOT NULL DEFAULT 0,
  requiere_admin BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_supervisor BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT mad_menu_item_tipo_chk CHECK (tipo IN ('MENU', 'GRUPO', 'PANTALLA', 'REPORTE'))
);

CREATE INDEX IF NOT EXISTS idx_mad_menu_item_padre
  ON public.mad_menu_item (id_padre, orden);

CREATE INDEX IF NOT EXISTS idx_mad_menu_item_rubro
  ON public.mad_menu_item (rubro, activo, orden);

COMMENT ON COLUMN public.mad_menu_item.rubro IS
  'Separador funcional del catalogo de navegacion. Ejemplos: TRANSPORTE, CONT, COMERCIAL, STOCK, PROY.';
COMMENT ON COLUMN public.mad_menu_item.id_item IS
  'Identificador estable del item dentro del catalogo. Convencion sugerida: rubro.codigo, ejemplo transporte.encomiendas.';

CREATE TABLE IF NOT EXISTS public.mad_menu_accion (
  id_accion VARCHAR(70) PRIMARY KEY,
  id_item VARCHAR(50) NOT NULL REFERENCES public.mad_menu_item(id_item),
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(200),
  orden INTEGER NOT NULL DEFAULT 0,
  requiere_admin BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_supervisor BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mad_menu_accion_item
  ON public.mad_menu_accion (id_item, activo, orden);

CREATE TABLE IF NOT EXISTS public.mad_menu_config (
  id_usuario VARCHAR(60) NOT NULL,
  rubro VARCHAR(20) NOT NULL,
  seguridad_activa BOOLEAN NOT NULL DEFAULT FALSE,
  ctrl_crea_us VARCHAR(60),
  ctrl_crea_fh TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  ctrl_mod_us VARCHAR(60),
  ctrl_mod_fh TIMESTAMP WITHOUT TIME ZONE,
  PRIMARY KEY (id_usuario, rubro)
);

-- Los reportes/dashboard de transporte no participan en permisos por usuario.
DO $$
BEGIN
  IF to_regclass('public.mad_menu_permiso_item') IS NOT NULL THEN
    DELETE FROM public.mad_menu_permiso_item
     WHERE id_item IN ('transporte.dashboard', 'transporte.reportes');
  END IF;
END $$;

DELETE FROM public.mad_menu_item
 WHERE id_item IN ('transporte.dashboard', 'transporte.reportes');

DO $$
BEGIN
  IF to_regclass('public.mad_menu_permiso_accion') IS NOT NULL THEN
    DELETE FROM public.mad_menu_permiso_accion
     WHERE id_accion IN ('transporte.encomiendas.imprimir', 'transporte.boletos.imprimir');
  END IF;
END $$;

DELETE FROM public.mad_menu_accion
 WHERE id_accion IN ('transporte.encomiendas.imprimir', 'transporte.boletos.imprimir');

-- Semilla: Transporte.
INSERT INTO public.mad_menu_item
  (id_item, id_padre, rubro, tipo, nombre, descripcion, ruta, icono, orden, requiere_admin, requiere_supervisor, activo)
VALUES
  ('transporte', NULL, 'TRANSPORTE', 'MENU', 'Transporte', 'Modulo de transporte', NULL, 'AirportShuttle', 1100, FALSE, FALSE, TRUE),

  -- Operacion diaria. Estas pantallas deben estar arriba porque son de uso repetido.
  ('transporte.encomiendas', 'transporte', 'TRANSPORTE', 'PANTALLA', 'Encomiendas', 'Control de encomiendas', '/ad_transportesencomienda', 'Inventory2', 1110, FALSE, FALSE, TRUE),
  ('transporte.grem', 'transporte', 'TRANSPORTE', 'PANTALLA', 'GREM', 'Guias de remision electronica', '/ad_transportegrem', 'LocalShipping', 1120, FALSE, FALSE, TRUE),
  ('transporte.entregas', 'transporte', 'TRANSPORTE', 'PANTALLA', 'Entregas', 'Llegada y entrega de encomiendas', '/ad_transporteentregas', 'AssignmentTurnedIn', 1130, FALSE, FALSE, TRUE),
  ('transporte.caja', 'transporte', 'TRANSPORTE', 'PANTALLA', 'Caja', 'Caja y movimientos de transporte', '/ad_transportecaja', 'AccountBalanceWallet', 1140, FALSE, FALSE, TRUE),
  ('transporte.boletos', 'transporte', 'TRANSPORTE', 'PANTALLA', 'Boletos', 'Control de boletos', '/ad_transportesboletos', 'Person', 1150, FALSE, FALSE, TRUE),

  -- Tributario.
  ('transporte.sunat', 'transporte', 'TRANSPORTE', 'GRUPO', 'SUNAT', 'Opciones tributarias de transporte', NULL, 'Sunat', 1160, FALSE, TRUE, TRUE),
  ('transporte.sunat.rdi', 'transporte.sunat', 'TRANSPORTE', 'PANTALLA', 'RDI SUNAT', 'Resumen diario SUNAT de encomiendas y boletos', '/ad_transporterdiencomienda', 'Summarize', 1161, FALSE, TRUE, TRUE),
  ('transporte.sunat.bajas', 'transporte.sunat', 'TRANSPORTE', 'PANTALLA', 'Bajas SUNAT', 'Comunicaciones de baja tributaria', '/ad_transportebajas', 'CancelPresentation', 1162, FALSE, TRUE, TRUE),

  -- Configuracion administrativa.
  ('transporte.config', 'transporte', 'TRANSPORTE', 'GRUPO', 'Configuracion', 'Mantenimientos de transporte', NULL, 'Settings', 1200, TRUE, FALSE, TRUE),
  ('transporte.puntos', 'transporte.config', 'TRANSPORTE', 'PANTALLA', 'Puntos venta', 'Agencias o puntos de venta', '/ad_puntoventa', 'HolidayVillage', 1210, TRUE, FALSE, TRUE),
  ('transporte.rutas', 'transporte.config', 'TRANSPORTE', 'PANTALLA', 'Rutas', 'Rutas de transporte', '/ad_transporterutas', 'CompareArrows', 1220, TRUE, FALSE, TRUE),
  ('transporte.placas', 'transporte.config', 'TRANSPORTE', 'PANTALLA', 'Placas', 'Unidades vehiculares', '/ad_transporteplacas', 'DirectionsBus', 1230, TRUE, FALSE, TRUE),
  ('transporte.licencias', 'transporte.config', 'TRANSPORTE', 'PANTALLA', 'Licencias', 'Conductores y licencias', '/ad_transportelicencias', 'Badge', 1240, TRUE, FALSE, TRUE),
  ('transporte.zonas', 'transporte.config', 'TRANSPORTE', 'PANTALLA', 'Zonas', 'Zonas de recojo y entrega', '/ad_transportezonas', 'HolidayVillage', 1250, TRUE, FALSE, TRUE),
  ('transporte.usuarios_turnos', 'transporte.config', 'TRANSPORTE', 'PANTALLA', 'Usuarios turnos', 'Usuarios, puntos y turnos', '/ad_puntoventausuario', 'SystemSecurityUpdateGood', 1260, TRUE, FALSE, TRUE)
ON CONFLICT (id_item) DO UPDATE
SET id_padre = EXCLUDED.id_padre,
    rubro = EXCLUDED.rubro,
    tipo = EXCLUDED.tipo,
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    ruta = EXCLUDED.ruta,
    icono = EXCLUDED.icono,
    orden = EXCLUDED.orden,
    requiere_admin = EXCLUDED.requiere_admin,
    requiere_supervisor = EXCLUDED.requiere_supervisor,
    activo = EXCLUDED.activo;

INSERT INTO public.mad_menu_accion
  (id_accion, id_item, nombre, descripcion, orden, requiere_admin, requiere_supervisor, activo)
VALUES
  ('transporte.encomiendas.crear', 'transporte.encomiendas', 'Nueva encomienda', 'Registrar encomienda', 10, FALSE, FALSE, TRUE),
  ('transporte.encomiendas.editar', 'transporte.encomiendas', 'Editar encomienda', 'Modificar encomienda no protegida', 20, FALSE, FALSE, TRUE),
  ('transporte.encomiendas.anular_local', 'transporte.encomiendas', 'Anular operacion', 'Anulacion administrativa sin envio SUNAT', 30, TRUE, FALSE, TRUE),
  ('transporte.encomiendas.enviar_sunat', 'transporte.encomiendas', 'Enviar SUNAT', 'Enviar comprobante a SUNAT', 40, FALSE, TRUE, TRUE),
  ('transporte.encomiendas.baja_sunat', 'transporte.encomiendas', 'Baja SUNAT', 'Registrar comunicacion de baja tributaria', 50, FALSE, TRUE, TRUE),
  ('transporte.encomiendas.eliminar', 'transporte.encomiendas', 'Eliminar operacion', 'Eliminar encomienda no protegida', 70, TRUE, FALSE, TRUE),

  ('transporte.boletos.crear', 'transporte.boletos', 'Nuevo boleto', 'Registrar boleto', 10, FALSE, FALSE, TRUE),
  ('transporte.boletos.editar', 'transporte.boletos', 'Editar boleto', 'Modificar boleto no protegido', 20, FALSE, FALSE, TRUE),
  ('transporte.boletos.anular_local', 'transporte.boletos', 'Anular boleto', 'Anulacion administrativa sin envio SUNAT', 30, TRUE, FALSE, TRUE),
  ('transporte.boletos.eliminar', 'transporte.boletos', 'Eliminar boleto', 'Eliminar boleto no protegido', 50, TRUE, FALSE, TRUE),

  ('transporte.entregas.marcar_llegada', 'transporte.entregas', 'Marcar llegada', 'Registrar llegada con hora servidor', 10, FALSE, FALSE, TRUE),
  ('transporte.entregas.registrar_entrega', 'transporte.entregas', 'Registrar entrega', 'Registrar entrega al destinatario', 20, FALSE, FALSE, TRUE),

  ('transporte.sunat.rdi.generar', 'transporte.sunat.rdi', 'Generar RDI', 'Generar y enviar resumen diario', 10, FALSE, TRUE, TRUE),
  ('transporte.sunat.rdi.consultar', 'transporte.sunat.rdi', 'Consultar ticket', 'Consultar estado de ticket RDI', 20, FALSE, TRUE, TRUE),
  ('transporte.sunat.rdi.corregir_rechazo', 'transporte.sunat.rdi', 'Corregir rechazo', 'Liberar RDI rechazado para reproceso', 30, FALSE, TRUE, TRUE),
  ('transporte.sunat.bajas.generar', 'transporte.sunat.bajas', 'Generar baja', 'Enviar comunicacion de baja SUNAT', 10, FALSE, TRUE, TRUE),
  ('transporte.sunat.bajas.consultar', 'transporte.sunat.bajas', 'Consultar baja', 'Consultar estado de comunicacion de baja', 20, FALSE, TRUE, TRUE),

  ('transporte.caja.crear_movimiento', 'transporte.caja', 'Nuevo movimiento', 'Registrar movimiento de caja', 10, FALSE, FALSE, TRUE),
  ('transporte.caja.anular_movimiento', 'transporte.caja', 'Anular movimiento', 'Anular movimiento de caja', 20, TRUE, FALSE, TRUE),
  ('transporte.caja.cerrar', 'transporte.caja', 'Cerrar caja', 'Generar cierre o reporte de caja', 30, FALSE, TRUE, TRUE)
ON CONFLICT (id_accion) DO UPDATE
SET id_item = EXCLUDED.id_item,
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    orden = EXCLUDED.orden,
    requiere_admin = EXCLUDED.requiere_admin,
    requiere_supervisor = EXCLUDED.requiere_supervisor,
    activo = EXCLUDED.activo;

-- Render del arbol de Transporte:
-- SELECT *
--   FROM public.mad_menu_item
--  WHERE rubro = 'TRANSPORTE' -- Cambiar por el rubro activo: CONT, COMERCIAL, STOCK, PROY, etc.
--    AND activo IS TRUE
--  ORDER BY orden, id_item;

-- Acciones de una pantalla:
-- SELECT *
--   FROM public.mad_menu_accion
--  WHERE id_item = 'transporte.encomiendas'
--    AND activo IS TRUE
--  ORDER BY orden, id_accion;
