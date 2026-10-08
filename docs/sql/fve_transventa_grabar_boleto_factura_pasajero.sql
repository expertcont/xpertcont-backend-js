CREATE OR REPLACE FUNCTION public.fve_transventa_grabar_boleto (
  p_data jsonb
)
RETURNS jsonb LANGUAGE 'plpgsql'
VOLATILE
CALLED ON NULL INPUT
SECURITY INVOKER
PARALLEL UNSAFE
COST 100
AS
$body$
DECLARE
    v_id_usuario          varchar(50);
    v_documento_id        varchar(20);
    v_periodo             varchar(7);

    v_r_cod               char(2);
    v_r_serie             char(4);
    v_r_numero            varchar(10);
    v_elemento            integer;
    v_r_fecemi            date;

    v_exito_correlativo   boolean;

    v_cliente_id_doc          varchar;
    v_cliente_documento_id    varchar(20);
    v_cliente                 varchar;
    v_cliente_telefono        varchar;
    v_cliente_direccion_fact  varchar;
    v_ref_pasajero_dni        varchar(20);
    v_ref_pasajero_nombres    varchar(200);
    v_asiento                 varchar;

    v_id_punto_venta          varchar(10);
    v_id_punto_venta_dest     varchar(10);
    v_id_ruta                 varchar(20);
    v_nombre_ruta             varchar(100);
    v_precio_pasaje           numeric(14,2);

    v_total                   numeric(14,2);
    v_descripcion             varchar;
    v_ctrl_crea_us            varchar(50);

    v_resultado               jsonb;
BEGIN
    v_id_usuario := COALESCE(NULLIF(p_data->>'id_usuario', ''), NULLIF(p_data->>'id_anfitrion', ''));
    v_documento_id := NULLIF(p_data->>'documento_id', '');
    v_periodo := NULLIF(p_data->>'periodo', '');
    v_r_fecemi := NULLIF(p_data->>'r_fecemi', '')::date;
    v_id_punto_venta := NULLIF(p_data->>'id_punto_venta', '');
    v_ctrl_crea_us := COALESCE(NULLIF(p_data->>'ctrl_crea_us', ''), NULLIF(p_data->>'id_invitado', ''), v_id_usuario);

    IF v_id_usuario IS NULL THEN
        RAISE EXCEPTION 'id_usuario/id_anfitrion es requerido';
    END IF;

    IF v_documento_id IS NULL THEN
        RAISE EXCEPTION 'documento_id es requerido';
    END IF;

    IF v_periodo IS NULL THEN
        RAISE EXCEPTION 'periodo es requerido';
    END IF;

    IF v_r_fecemi IS NULL THEN
        RAISE EXCEPTION 'r_fecemi es requerido';
    END IF;

    IF v_id_punto_venta IS NULL THEN
        RAISE EXCEPTION 'id_punto_venta (agencia actual) es requerido';
    END IF;

    v_cliente_documento_id := COALESCE(NULLIF(p_data->>'cliente_documento_id', ''), NULLIF(p_data->>'cliente_documento', ''));
    v_cliente := NULLIF(trim(p_data->>'cliente'), '');
    v_cliente_telefono := NULLIF(trim(p_data->>'cliente_telefono'), '');
    v_cliente_direccion_fact := NULLIF(trim(p_data->>'cliente_direccion_fact'), '');
    v_ref_pasajero_dni := NULLIF(trim(p_data->>'ref_pasajero_dni'), '');
    v_ref_pasajero_nombres := NULLIF(trim(p_data->>'ref_pasajero_nombres'), '');
    v_asiento := NULLIF(trim(p_data->>'asiento'), '');

    IF v_cliente_documento_id IS NULL THEN
        RAISE EXCEPTION 'DNI/RUC del pasajero es requerido';
    END IF;

    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Nombre/Razón Social del pasajero es requerido';
    END IF;

    IF v_cliente_documento_id ~ '^[0-9]{11}$' THEN
        v_cliente_id_doc := '6';
        v_r_cod := '01';

        IF v_cliente_direccion_fact IS NULL THEN
            RAISE EXCEPTION 'Dirección de facturación es requerida para factura';
        END IF;

        IF v_ref_pasajero_dni IS NULL OR v_ref_pasajero_nombres IS NULL THEN
            RAISE EXCEPTION 'DNI y nombres del pasajero son requeridos para boleto facturado a RUC';
        END IF;
    ELSE
        v_cliente_id_doc := COALESCE(NULLIF(p_data->>'cliente_id_doc', ''), NULLIF(p_data->>'id_documento', ''), '1');
        v_r_cod := '03';
        v_cliente_direccion_fact := NULL;
        v_ref_pasajero_dni := NULL;
        v_ref_pasajero_nombres := NULL;
    END IF;

    SELECT
        r.id_ruta,
        r.id_punto_venta_dest,
        r.nombre,
        r.precio_pasaje
    INTO
        v_id_ruta,
        v_id_punto_venta_dest,
        v_nombre_ruta,
        v_precio_pasaje
    FROM public.mve_transruta r
    WHERE r.id_usuario = v_id_usuario
      AND r.documento_id = v_documento_id
      AND r.id_punto_venta = v_id_punto_venta
      AND r.precio_pasaje > 0
      AND r.activo = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe una ruta activa configurada para el punto de venta %', v_id_punto_venta;
    END IF;

    IF v_precio_pasaje <= 0 THEN
        RAISE EXCEPTION 'La ruta % no tiene precio de pasaje configurado', v_id_ruta;
    END IF;

    v_total := v_precio_pasaje;
    v_descripcion := COALESCE(NULLIF(trim(p_data->>'descripcion'), ''), NULLIF(trim(v_nombre_ruta), ''), 'SERVICIO DE TRANSPORTE DE PASAJERO');

    SELECT
        CASE
            WHEN v_r_cod = '01' THEN 'F' || right(lpad(trim(pv.serie_bol), 4, '0'), 3)
            ELSE 'B' || right(lpad(trim(pv.serie_bol), 4, '0'), 3)
        END
    INTO v_r_serie
    FROM public.mad_punto_venta pv
    WHERE pv.id_usuario = v_id_usuario
      AND pv.documento_id = v_documento_id
      AND pv.id_punto_venta = v_id_punto_venta;

    IF NOT FOUND OR v_r_serie IS NULL THEN
        RAISE EXCEPTION 'No existe serie configurada para el punto de venta %', v_id_punto_venta;
    END IF;

    SELECT public.fve_genera01_correl(v_id_usuario, v_documento_id, v_r_cod, v_r_serie)
    INTO v_r_numero;

    IF v_r_numero IS NULL THEN
        RAISE EXCEPTION 'No se pudo generar correlativo para %-%', v_r_cod, v_r_serie;
    END IF;

    v_elemento := COALESCE(NULLIF(p_data->>'elemento', '')::integer, 1);

    INSERT INTO public.mve_transventa
    (
        id_usuario,
        documento_id,
        periodo,
        r_cod,
        r_serie,
        r_numero,
        elemento,
        r_fecemi,
        tipo_operacion,
        cliente_id_doc,
        cliente_documento_id,
        cliente,
        cliente_telefono,
        cliente_direccion_fact,
        ref_pasajero_dni,
        ref_pasajero_nombres,
        id_ruta,
        descripcion,
        id_punto_venta,
        id_punto_venta_dest,
        asiento,
        precio_neto,
        r_gravado,
        r_exonerado,
        r_igv,
        r_monto_total,
        precio_chofer,
        porc_igv,
        ctrl_crea,
        ctrl_crea_us
    )
    VALUES
    (
        v_id_usuario,
        v_documento_id,
        v_periodo,
        v_r_cod,
        v_r_serie,
        v_r_numero,
        v_elemento,
        v_r_fecemi,
        'B',
        v_cliente_id_doc,
        v_cliente_documento_id,
        v_cliente,
        v_cliente_telefono,
        v_cliente_direccion_fact,
        v_ref_pasajero_dni,
        v_ref_pasajero_nombres,
        v_id_ruta,
        v_descripcion,
        v_id_punto_venta,
        v_id_punto_venta_dest,
        v_asiento,
        v_total,
        0,
        v_total,
        0,
        v_total,
        0,
        0,
        CURRENT_TIMESTAMP,
        v_ctrl_crea_us
    )
    RETURNING to_jsonb(mve_transventa.*)
    INTO v_resultado;

    SELECT public.fve_genera02_correl(v_id_usuario, v_documento_id, v_r_cod, v_r_serie)
    INTO v_exito_correlativo;

    IF COALESCE(v_exito_correlativo, false) = false THEN
        RAISE EXCEPTION 'No se pudo confirmar correlativo %-%', v_r_serie, v_r_numero;
    END IF;

    RETURN v_resultado;
END;
$body$;
