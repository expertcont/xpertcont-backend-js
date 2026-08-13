-- Genera una factura o boleta comercial desde un presupuesto NV.
--
-- No envia a SUNAT. El comprobante generado queda como documento comercial
-- normal en mve_venta + mve_ventadet y luego puede usar AdminSunatIcon.
--
-- Modelo origen:
--   mve_venta NV
--     -> mve_ventaserv
--         -> mve_ventaservdet
--
-- Modelo destino:
--   mve_venta 01/03
--     -> mve_ventadet
--
-- Regla confirmada con factura comercial real:
-- - mve_ventadet.precio_neto es el total de linea con IGV.
-- - mve_ventadet.monto_base es base unitaria sin IGV.
-- - mve_ventadet.igv es IGV unitario.
--
-- Esta funcion NO usa fve_crear_comprobante porque esa funcion convierte el
-- documento origen cambiando su PK. Para presupuestos de servicios el NV debe
-- quedar intacto.
--
-- Requiere validar en BD real:
-- - Que el comodin local id_producto = '0000' exista o sea aceptado por fve_ventadetinserta.

CREATE OR REPLACE FUNCTION public.fve_presupuesto_generar_comprobante(
  p_id_usuario       varchar,
  p_documento_id     varchar,
  p_periodo          varchar,
  p_id_invitado      varchar,
  p_fecha            date,
  p_origen_r_cod     varchar,
  p_origen_r_serie   varchar,
  p_origen_r_numero  varchar,
  p_origen_elemento  integer,
  p_r_cod_emitir     varchar,
  p_r_serie_emitir   varchar,
  p_r_id_doc         varchar,
  p_r_documento_id   varchar,
  p_r_razon_social   varchar,
  p_r_direccion      varchar,
  p_efectivo         numeric DEFAULT NULL,
  p_vuelto           numeric DEFAULT 0,
  p_forma_pago2      varchar DEFAULT NULL,
  p_efectivo2        numeric DEFAULT 0,
  p_r_moneda         varchar DEFAULT 'PEN',
  p_r_forma_pago_id  varchar DEFAULT 'Contado',
  p_dias_credito     integer DEFAULT 0,
  p_id_producto      varchar DEFAULT '0000',
  p_cont_und_default varchar DEFAULT 'ZZ'
)
RETURNS TABLE (
  r_cod         varchar,
  r_serie       varchar,
  r_numero      varchar,
  elemento      integer,
  r_fecemi      date,
  r_monto_total numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_presupuesto      public.mve_venta%ROWTYPE;
  v_comprobante      record;
  v_servicio         record;
  v_id_almacen       varchar;
  v_r_numero         varchar;
  v_fecha            date;
  v_cantidad         numeric;
  v_total            numeric;
  v_precio_unitario  numeric;
  v_porc_igv         numeric;
  v_insertado        boolean;
  v_correlativo_ok   boolean;
  v_item_insertado   integer;
  v_servicios_count  integer;
BEGIN
  IF COALESCE(NULLIF(p_origen_r_cod, ''), '') <> 'NV' THEN
    RAISE EXCEPTION 'Solo se puede generar comprobante desde presupuesto NV. Recibido: %', p_origen_r_cod;
  END IF;

  IF COALESCE(p_origen_elemento, 0) <> 1 THEN
    RAISE EXCEPTION 'El presupuesto NV debe usar elemento = 1. Recibido: %', p_origen_elemento;
  END IF;

  IF COALESCE(NULLIF(p_r_cod_emitir, ''), '') NOT IN ('01', '03') THEN
    RAISE EXCEPTION 'Codigo destino no soportado para presupuesto: %. Use 01 o 03.', p_r_cod_emitir;
  END IF;

  IF COALESCE(NULLIF(p_r_serie_emitir, ''), '') = '' THEN
    RAISE EXCEPTION 'Debe indicar serie destino para el comprobante comercial';
  END IF;

  SELECT *
    INTO v_presupuesto
    FROM public.mve_venta mv
   WHERE mv.id_usuario = p_id_usuario
     AND mv.documento_id = p_documento_id
     AND mv.periodo = p_periodo
     AND mv.r_cod = p_origen_r_cod
     AND mv.r_serie = p_origen_r_serie
     AND mv.r_numero = p_origen_r_numero
     AND mv.elemento = p_origen_elemento
     AND COALESCE(mv.registrado, 1) = 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presupuesto origen no encontrado: %- %- %- %',
      p_origen_r_cod, p_origen_r_serie, p_origen_r_numero, p_origen_elemento;
  END IF;

  -- Idempotencia: si el presupuesto ya fue facturado y el comprobante existe,
  -- devolvemos el comprobante generado previamente.
  IF v_presupuesto.fact_cod IS NOT NULL
     AND v_presupuesto.fact_serie IS NOT NULL
     AND v_presupuesto.fact_num IS NOT NULL THEN
    RETURN QUERY
      SELECT mv.r_cod, mv.r_serie, mv.r_numero, mv.elemento, mv.r_fecemi, mv.r_monto_total
        FROM public.mve_venta mv
       WHERE mv.id_usuario = p_id_usuario
         AND mv.documento_id = p_documento_id
         AND mv.periodo = p_periodo
         AND mv.r_cod = v_presupuesto.fact_cod
         AND mv.r_serie = v_presupuesto.fact_serie
         AND mv.r_numero = v_presupuesto.fact_num
         AND COALESCE(mv.registrado, 1) = 1
       ORDER BY mv.elemento
       LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'El presupuesto ya tiene referencia fact_*, pero el comprobante destino no existe';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_servicios_count
    FROM public.mve_ventaserv ms
   WHERE ms.id_usuario = p_id_usuario
     AND ms.documento_id = p_documento_id
     AND ms.periodo = p_periodo
     AND ms.r_cod = p_origen_r_cod
     AND ms.r_serie = p_origen_r_serie
     AND ms.r_numero = p_origen_r_numero
     AND ms.elemento = p_origen_elemento
     AND COALESCE(ms.registrado, 1) = 1
     AND COALESCE(ms.r_monto_total, ms.precio_neto, 0) > 0;

  IF v_servicios_count = 0 THEN
    RAISE EXCEPTION 'El presupuesto no tiene trabajos facturables';
  END IF;

  v_fecha := COALESCE(p_fecha, v_presupuesto.r_fecemi, CURRENT_DATE);

  -- Validar serie autorizada y resolver almacen igual que el flujo comercial.
  SELECT mss.id_almacen
    INTO v_id_almacen
    FROM public.mad_seguridad_serie mss
   WHERE mss.id_usuario = p_id_usuario
     AND mss.documento_id = p_documento_id
     AND mss.id_invitado = p_id_invitado
     AND mss.r_cod = p_r_cod_emitir
     AND mss.r_serie = p_r_serie_emitir;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serie no autorizada para el usuario: %- %', p_r_cod_emitir, p_r_serie_emitir;
  END IF;

  v_r_numero := public.fve_genera01_correl(
    p_id_usuario,
    p_documento_id,
    p_r_cod_emitir,
    p_r_serie_emitir
  );

  IF COALESCE(NULLIF(v_r_numero, ''), '') = '' THEN
    RAISE EXCEPTION 'No se pudo generar correlativo para %- %', p_r_cod_emitir, p_r_serie_emitir;
  END IF;

  -- Crear una cabecera comercial nueva. No se actualiza la PK del presupuesto.
  INSERT INTO public.mve_venta (
    id_usuario,
    documento_id,
    periodo,
    r_cod,
    r_serie,
    r_numero,
    elemento,
    r_fecemi,
    r_fecvcto,
    glosa,
    debe,
    haber,
    debe_me,
    haber_me,
    ctrl_crea,
    ctrl_crea_us,
    r_id_doc,
    r_documento_id,
    r_razon_social,
    r_direccion,
    r_base001,
    r_base002,
    r_base003,
    r_base004,
    r_igv002,
    r_monto_total,
    r_moneda,
    r_tc,
    efectivo,
    vuelto,
    forma_pago2,
    efectivo2,
    r_base_gratuita,
    id_almacen,
    cdr_pendiente,
    registrado,
    r_forma_pago_id,
    dias_credito,
    r_total_gratuito,
    contacto_nombre,
    contacto_celular
  )
  VALUES (
      p_id_usuario,
      p_documento_id,
      p_periodo,
      p_r_cod_emitir,
      p_r_serie_emitir,
      v_r_numero,
      1,
      v_fecha,
      CASE
        WHEN COALESCE(p_dias_credito, v_presupuesto.dias_credito, 0) > 0
        THEN v_fecha + COALESCE(p_dias_credito, v_presupuesto.dias_credito, 0)
        ELSE NULL
      END,
      v_presupuesto.glosa,
      0,
      0,
      0,
      0,
      CURRENT_TIMESTAMP,
      p_id_invitado,
      COALESCE(NULLIF(p_r_id_doc, ''), v_presupuesto.r_id_doc, '6'),
      COALESCE(NULLIF(p_r_documento_id, ''), v_presupuesto.r_documento_id),
      COALESCE(NULLIF(p_r_razon_social, ''), v_presupuesto.r_razon_social),
      COALESCE(NULLIF(p_r_direccion, ''), v_presupuesto.r_direccion, '-'),
      0,
      0,
      0,
      0,
      0,
      0,
      COALESCE(NULLIF(p_r_moneda, ''), v_presupuesto.r_moneda, 'PEN'),
      COALESCE(v_presupuesto.r_tc, 1),
      COALESCE(p_efectivo, v_presupuesto.r_monto_total, 0),
      COALESCE(p_vuelto, 0),
      CASE WHEN COALESCE(p_efectivo2, 0) = 0 THEN NULL ELSE NULLIF(p_forma_pago2, '') END,
      COALESCE(p_efectivo2, 0),
      0,
      v_id_almacen,
      '0',
      1,
      COALESCE(NULLIF(p_r_forma_pago_id, ''), v_presupuesto.r_forma_pago_id, 'Contado'),
      COALESCE(p_dias_credito, v_presupuesto.dias_credito, 0),
      0,
      v_presupuesto.contacto_nombre,
      v_presupuesto.contacto_celular
  )
  RETURNING mve_venta.r_cod,
            mve_venta.r_serie,
            mve_venta.r_numero,
            mve_venta.elemento,
            mve_venta.r_fecemi,
            mve_venta.r_monto_total
       INTO v_comprobante;

  FOR v_servicio IN
    SELECT *
      FROM public.mve_ventaserv ms
     WHERE ms.id_usuario = p_id_usuario
       AND ms.documento_id = p_documento_id
       AND ms.periodo = p_periodo
       AND ms.r_cod = p_origen_r_cod
       AND ms.r_serie = p_origen_r_serie
       AND ms.r_numero = p_origen_r_numero
       AND ms.elemento = p_origen_elemento
       AND COALESCE(ms.registrado, 1) = 1
       AND COALESCE(ms.r_monto_total, ms.precio_neto, 0) > 0
     ORDER BY ms.servicio
  LOOP
    v_cantidad := GREATEST(COALESCE(NULLIF(v_servicio.cantidad, 0), 1), 1);
    v_total := ROUND(COALESCE(v_servicio.r_monto_total, v_servicio.precio_neto, 0), 2);
    v_precio_unitario := ROUND(v_total / v_cantidad, 2);
    v_porc_igv := COALESCE(v_servicio.porc_igv, 18);

    SELECT public.fve_ventadetinserta(
      p_id_usuario,
      p_documento_id,
      p_periodo,
      v_comprobante.r_cod,
      v_comprobante.r_serie,
      v_comprobante.r_numero,
      v_comprobante.elemento::numeric,
      TO_CHAR(v_comprobante.r_fecemi, 'YYYY-MM-DD')::varchar,
      COALESCE(NULLIF(v_servicio.id_producto, ''), NULLIF(p_id_producto, ''), '0000')::varchar,
      COALESCE(NULLIF(v_servicio.descripcion, ''), 'Servicio presupuestado')::varchar,
      v_cantidad,
      v_precio_unitario,
      v_total,
      v_porc_igv,
      COALESCE(NULLIF(v_servicio.cont_und, ''), NULLIF(p_cont_und_default, ''), 'ZZ')::varchar
    )
    INTO v_insertado;

    IF NOT COALESCE(v_insertado, false) THEN
      RAISE EXCEPTION 'No se pudo insertar item facturable para servicio %', v_servicio.servicio;
    END IF;

    SELECT MAX(d.item)
      INTO v_item_insertado
      FROM public.mve_ventadet d
     WHERE d.id_usuario = p_id_usuario
       AND d.documento_id = p_documento_id
       AND d.periodo = p_periodo
       AND d.r_cod = v_comprobante.r_cod
       AND d.r_serie = v_comprobante.r_serie
       AND d.r_numero = v_comprobante.r_numero
       AND d.elemento = v_comprobante.elemento;

    IF v_item_insertado IS NULL THEN
      RAISE EXCEPTION 'No se encontro el item facturable insertado para servicio %', v_servicio.servicio;
    END IF;

    UPDATE public.mve_ventadet d
       SET pp_descripcion2 = COALESCE(NULLIF(v_servicio.especificacion, ''), d.pp_descripcion2),
           pp_utilidad = COALESCE(v_servicio.utilidad, d.pp_utilidad),
           moneda = COALESCE(v_servicio.r_moneda, d.moneda),
           tipo_igv_codigo = COALESCE(d.tipo_igv_codigo, '10')
     WHERE d.id_usuario = p_id_usuario
       AND d.documento_id = p_documento_id
       AND d.periodo = p_periodo
       AND d.r_cod = v_comprobante.r_cod
       AND d.r_serie = v_comprobante.r_serie
       AND d.r_numero = v_comprobante.r_numero
       AND d.elemento = v_comprobante.elemento
       AND d.item = v_item_insertado;
  END LOOP;

  -- Refuerzo de metadata y pagos despues de que fve_ventadetinserta haya
  -- recalculado totales de cabecera.
  UPDATE public.mve_venta mv
     SET debe = COALESCE(mv.r_monto_total, mv.debe, 0),
         haber = 0,
         debe_me = 0,
         haber_me = 0,
         efectivo = COALESCE(p_efectivo, mv.r_monto_total, mv.efectivo, 0),
         vuelto = COALESCE(p_vuelto, mv.vuelto, 0),
         forma_pago2 = CASE WHEN COALESCE(p_efectivo2, 0) = 0 THEN NULL ELSE NULLIF(p_forma_pago2, '') END,
         efectivo2 = COALESCE(p_efectivo2, mv.efectivo2, 0),
         glosa = COALESCE(NULLIF(mv.glosa, ''), v_presupuesto.glosa),
         contacto_nombre = COALESCE(NULLIF(mv.contacto_nombre, ''), v_presupuesto.contacto_nombre),
         contacto_celular = COALESCE(NULLIF(mv.contacto_celular, ''), v_presupuesto.contacto_celular),
         ctrl_mod = CURRENT_TIMESTAMP,
         ctrl_mod_us = p_id_invitado
   WHERE mv.id_usuario = p_id_usuario
     AND mv.documento_id = p_documento_id
     AND mv.periodo = p_periodo
     AND mv.r_cod = v_comprobante.r_cod
     AND mv.r_serie = v_comprobante.r_serie
     AND mv.r_numero = v_comprobante.r_numero
     AND mv.elemento = v_comprobante.elemento;

  -- Trazabilidad: el NV queda vivo e historico, apuntando al comprobante generado.
  UPDATE public.mve_venta mv
     SET fact_cod = v_comprobante.r_cod,
         fact_serie = v_comprobante.r_serie,
         fact_num = v_comprobante.r_numero,
         ctrl_mod = CURRENT_TIMESTAMP,
         ctrl_mod_us = p_id_invitado
   WHERE mv.id_usuario = p_id_usuario
     AND mv.documento_id = p_documento_id
     AND mv.periodo = p_periodo
     AND mv.r_cod = p_origen_r_cod
     AND mv.r_serie = p_origen_r_serie
     AND mv.r_numero = p_origen_r_numero
     AND mv.elemento = p_origen_elemento;

  v_correlativo_ok := public.fve_genera02_correl(
    p_id_usuario,
    p_documento_id,
    p_r_cod_emitir,
    p_r_serie_emitir
  );

  IF NOT COALESCE(v_correlativo_ok, false) THEN
    RAISE EXCEPTION 'No se pudo confirmar correlativo para %- %', p_r_cod_emitir, p_r_serie_emitir;
  END IF;

  RETURN QUERY
    SELECT mv.r_cod, mv.r_serie, mv.r_numero, mv.elemento, mv.r_fecemi, mv.r_monto_total
      FROM public.mve_venta mv
     WHERE mv.id_usuario = p_id_usuario
       AND mv.documento_id = p_documento_id
       AND mv.periodo = p_periodo
       AND mv.r_cod = v_comprobante.r_cod
       AND mv.r_serie = v_comprobante.r_serie
       AND mv.r_numero = v_comprobante.r_numero
       AND mv.elemento = v_comprobante.elemento;
END;
$$;

COMMENT ON FUNCTION public.fve_presupuesto_generar_comprobante(
  varchar, varchar, varchar, varchar, date,
  varchar, varchar, varchar, integer,
  varchar, varchar,
  varchar, varchar, varchar, varchar,
  numeric, numeric, varchar, numeric,
  varchar, varchar, integer,
  varchar, varchar
) IS 'Genera factura/boleta comercial desde presupuesto NV, convierte mve_ventaserv a mve_ventadet y marca el presupuesto con fact_cod/fact_serie/fact_num.';

-- Ejemplo de llamada:
--
-- SELECT *
-- FROM public.fve_presupuesto_generar_comprobante(
--   'usuario@correo.com',
--   '20123456789',
--   '2026-08',
--   'operador@correo.com',
--   CURRENT_DATE,
--   'NV',
--   '0001',
--   '0000003',
--   1,
--   '01',
--   'F001',
--   '6',
--   '20600000000',
--   'CLIENTE SAC',
--   'Direccion cliente',
--   NULL,
--   0,
--   NULL,
--   0,
--   'PEN',
--   'Contado',
--   0,
--   '0000',
--   'ZZ'
-- );
