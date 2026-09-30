-- Catalogo de menus/comandos para el modulo Transporte.
-- Compatible con el esquema historico mad_menucomando:
--   id_menu = prefijo de permiso usado por /seguridadmenu y /seguridad/:id_menu
--   id_comando = nodo o accion concreta.
--
-- Convencion propuesta:
--   11       Transporte
--   11-XX    Pantallas/submenus de transporte
--   11-XX-YY Acciones dentro de una pantalla
--
-- Nota: la tabla historica solo guarda comandos, pero estos registros permiten
-- representar tambien menus y pantallas sin romper los permisos existentes.

ALTER TABLE public.mad_menucomando
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'COMANDO',
  ADD COLUMN IF NOT EXISTS id_padre VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ruta VARCHAR(150),
  ADD COLUMN IF NOT EXISTS orden INTEGER,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.mad_menucomando.tipo IS
  'MENU, PANTALLA, ACCION o COMANDO. COMANDO queda como valor compatible historico.';
COMMENT ON COLUMN public.mad_menucomando.id_padre IS
  'id_comando padre para renderizar arboles de menu.';
COMMENT ON COLUMN public.mad_menucomando.ruta IS
  'Ruta frontend base cuando el registro representa una pantalla.';
COMMENT ON COLUMN public.mad_menucomando.orden IS
  'Orden visual dentro del mismo padre.';
COMMENT ON COLUMN public.mad_menucomando.activo IS
  'Permite ocultar opciones sin eliminar permisos historicos.';

INSERT INTO public.mad_menucomando
  (id_menu, id_comando, nombre, descripcion, rubro, tipo, id_padre, ruta, orden, activo)
VALUES
  ('11', '11', 'Transporte', 'Modulo operativo de transporte', 'TRANS', 'MENU', NULL, NULL, 1100, TRUE),

  -- Pantallas operativas visibles en el menu Transporte.
  ('11', '11-01', 'Encomiendas', 'Control de encomiendas', 'TRANS', 'PANTALLA', '11', '/ad_transportesencomienda', 1110, TRUE),
  ('11', '11-02', 'GREM', 'Guias de remision electronica de encomiendas', 'TRANS', 'PANTALLA', '11', '/ad_transportegrem', 1120, TRUE),
  ('11', '11-03', 'Entregas', 'Entrega y llegada de encomiendas', 'TRANS', 'PANTALLA', '11', '/ad_transporteentregas', 1130, TRUE),
  ('11', '11-04', 'Caja', 'Caja y movimientos de transporte', 'TRANS', 'PANTALLA', '11', '/ad_transportecaja', 1140, TRUE),
  ('11', '11-05', 'Boletos', 'Control de boletos de transporte', 'TRANS', 'PANTALLA', '11', '/ad_transportesboletos', 1150, TRUE),
  ('11', '11-06', 'RDI SUNAT', 'Resumen diario SUNAT de transporte', 'TRANS', 'PANTALLA', '11', '/ad_transporterdiencomienda', 1160, TRUE),

  -- Mantenimientos administrativos relacionados a transporte.
  ('11', '11-20', 'Puntos venta', 'Agencias o puntos de venta', 'TRANS', 'PANTALLA', '11', '/ad_transportepuntos', 1200, TRUE),
  ('11', '11-21', 'Rutas', 'Rutas de transporte', 'TRANS', 'PANTALLA', '11', '/ad_transporterutas', 1210, TRUE),
  ('11', '11-22', 'Placas', 'Unidades vehiculares', 'TRANS', 'PANTALLA', '11', '/ad_transporteplacas', 1220, TRUE),
  ('11', '11-23', 'Licencias', 'Conductores y licencias', 'TRANS', 'PANTALLA', '11', '/ad_transportelicencias', 1230, TRUE),
  ('11', '11-24', 'Zonas', 'Zonas de recojo y entrega', 'TRANS', 'PANTALLA', '11', '/ad_transportezonas', 1240, TRUE),
  ('11', '11-25', 'Usuarios turnos', 'Usuarios, puntos de venta y turnos', 'TRANS', 'PANTALLA', '11', '/ad_puntoventausuario', 1250, TRUE),
  ('11', '11-26', 'Dashboard', 'Indicadores de transporte', 'TRANS', 'PANTALLA', '11', '/ad_transportedashboard', 1260, TRUE),

  -- Acciones de encomiendas.
  ('11', '11-01-01', 'Nueva encomienda', 'Registrar encomienda', 'TRANS', 'ACCION', '11-01', NULL, 1111, TRUE),
  ('11', '11-01-02', 'Editar encomienda', 'Modificar encomienda no protegida por SUNAT', 'TRANS', 'ACCION', '11-01', NULL, 1112, TRUE),
  ('11', '11-01-03', 'Anular operacion', 'Anulacion administrativa sin envio SUNAT', 'TRANS', 'ACCION', '11-01', NULL, 1113, TRUE),
  ('11', '11-01-04', 'Enviar SUNAT', 'Enviar comprobante de encomienda a SUNAT', 'TRANS', 'ACCION', '11-01', NULL, 1114, TRUE),
  ('11', '11-01-05', 'Baja SUNAT', 'Registrar comunicacion de baja tributaria', 'TRANS', 'ACCION', '11-01', NULL, 1115, TRUE),
  ('11', '11-01-06', 'Clonar encomienda', 'Crear encomienda desde una existente', 'TRANS', 'ACCION', '11-01', NULL, 1116, TRUE),
  ('11', '11-01-07', 'Imprimir ticket', 'Generar ticket o constancia de encomienda', 'TRANS', 'ACCION', '11-01', NULL, 1117, TRUE),

  -- Acciones de entregas.
  ('11', '11-03-01', 'Marcar llegada', 'Registrar llegada real con hora servidor', 'TRANS', 'ACCION', '11-03', NULL, 1131, TRUE),
  ('11', '11-03-02', 'Registrar entrega', 'Registrar entrega al destinatario', 'TRANS', 'ACCION', '11-03', NULL, 1132, TRUE),

  -- Acciones SUNAT/RDI.
  ('11', '11-06-01', 'Generar RDI', 'Generar y enviar resumen diario SUNAT', 'TRANS', 'ACCION', '11-06', NULL, 1161, TRUE),
  ('11', '11-06-02', 'Consultar ticket RDI', 'Consultar estado de ticket SUNAT', 'TRANS', 'ACCION', '11-06', NULL, 1162, TRUE),
  ('11', '11-06-03', 'Corregir RDI rechazado', 'Liberar documentos de RDI rechazado para reproceso', 'TRANS', 'ACCION', '11-06', NULL, 1163, TRUE),
  ('11', '11-06-04', 'Ver bajas SUNAT', 'Seguimiento de comunicaciones de baja', 'TRANS', 'ACCION', '11-06', NULL, 1164, TRUE),

  -- Acciones genericas para mantenimientos.
  ('11', '11-20-01', 'Nuevo punto venta', 'Registrar punto de venta', 'TRANS', 'ACCION', '11-20', NULL, 1201, TRUE),
  ('11', '11-20-02', 'Editar punto venta', 'Modificar punto de venta', 'TRANS', 'ACCION', '11-20', NULL, 1202, TRUE),
  ('11', '11-20-03', 'Eliminar punto venta', 'Eliminar o desactivar punto de venta', 'TRANS', 'ACCION', '11-20', NULL, 1203, TRUE),
  ('11', '11-21-01', 'Nueva ruta', 'Registrar ruta', 'TRANS', 'ACCION', '11-21', NULL, 1211, TRUE),
  ('11', '11-21-02', 'Editar ruta', 'Modificar ruta', 'TRANS', 'ACCION', '11-21', NULL, 1212, TRUE),
  ('11', '11-21-03', 'Eliminar ruta', 'Eliminar o desactivar ruta', 'TRANS', 'ACCION', '11-21', NULL, 1213, TRUE),
  ('11', '11-22-01', 'Nueva placa', 'Registrar placa', 'TRANS', 'ACCION', '11-22', NULL, 1221, TRUE),
  ('11', '11-22-02', 'Editar placa', 'Modificar placa', 'TRANS', 'ACCION', '11-22', NULL, 1222, TRUE),
  ('11', '11-22-03', 'Eliminar placa', 'Eliminar o desactivar placa', 'TRANS', 'ACCION', '11-22', NULL, 1223, TRUE),
  ('11', '11-23-01', 'Nueva licencia', 'Registrar licencia', 'TRANS', 'ACCION', '11-23', NULL, 1231, TRUE),
  ('11', '11-23-02', 'Editar licencia', 'Modificar licencia', 'TRANS', 'ACCION', '11-23', NULL, 1232, TRUE),
  ('11', '11-23-03', 'Eliminar licencia', 'Eliminar o desactivar licencia', 'TRANS', 'ACCION', '11-23', NULL, 1233, TRUE),
  ('11', '11-24-01', 'Nueva zona', 'Registrar zona', 'TRANS', 'ACCION', '11-24', NULL, 1241, TRUE),
  ('11', '11-24-02', 'Editar zona', 'Modificar zona', 'TRANS', 'ACCION', '11-24', NULL, 1242, TRUE),
  ('11', '11-24-03', 'Eliminar zona', 'Eliminar o desactivar zona', 'TRANS', 'ACCION', '11-24', NULL, 1243, TRUE),
  ('11', '11-25-01', 'Asignar turno', 'Asignar punto de venta y turno a usuario', 'TRANS', 'ACCION', '11-25', NULL, 1251, TRUE),
  ('11', '11-25-02', 'Editar turno', 'Modificar asignacion de usuario', 'TRANS', 'ACCION', '11-25', NULL, 1252, TRUE),
  ('11', '11-25-03', 'Eliminar turno', 'Eliminar asignacion de usuario', 'TRANS', 'ACCION', '11-25', NULL, 1253, TRUE)
ON CONFLICT (id_menu, id_comando) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    rubro = EXCLUDED.rubro,
    tipo = EXCLUDED.tipo,
    id_padre = EXCLUDED.id_padre,
    ruta = EXCLUDED.ruta,
    orden = EXCLUDED.orden,
    activo = EXCLUDED.activo;

-- Consulta sugerida para renderizar el arbol del modulo Transporte:
-- SELECT id_menu, id_comando, nombre, descripcion, tipo, id_padre, ruta, orden
--   FROM public.mad_menucomando
--  WHERE id_menu = '11'
--    AND activo IS TRUE
--  ORDER BY orden, id_comando;
