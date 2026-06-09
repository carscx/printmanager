


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;




ALTER SCHEMA "public" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'operador',
    'vendedor'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."categoria_gasto_fijo" AS ENUM (
    'impuestos',
    'servicios',
    'amortizacion',
    'sueldo_personal'
);


ALTER TYPE "public"."categoria_gasto_fijo" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'operador');
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."descontar_stock_pedido"("pedido_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.fn_aplicar_stock_preventivo(pedido_id);
$$;


ALTER FUNCTION "public"."descontar_stock_pedido"("pedido_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."display_name_from_auth_meta"("meta" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT COALESCE(
    NULLIF(TRIM(meta ->> 'full_name'), ''),
    NULLIF(TRIM(meta ->> 'name'), ''),
    NULLIF(TRIM(meta ->> 'display_name'), ''),
    NULLIF(TRIM(meta ->> 'given_name'), '')
  );
$$;


ALTER FUNCTION "public"."display_name_from_auth_meta"("meta" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."display_name_from_auth_meta"("meta" "jsonb") IS 'Unifica full_name / name / display_name de user_metadata (Auth).';



CREATE OR REPLACE FUNCTION "public"."fn_aplicar_stock_preventivo"("p_pedido_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r record;
  n bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = p_pedido_id AND COALESCE(p.stock_descontado, false)
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO n
  FROM public.pedido_items pi
  JOIN public.pedido_items_insumos pii ON pii.pedido_item_id = pi.id
  WHERE pi.pedido_id = p_pedido_id;

  IF n = 0 THEN
    RAISE EXCEPTION 'STOCK_SIN_CONSUMOS: generá consumos (pedido_items_insumos) antes de señar/confirmar';
  END IF;

  FOR r IN
    SELECT
      pii.insumo_id,
      sum(pii.cantidad)::numeric AS qty
    FROM public.pedido_items pi
    JOIN public.pedido_items_insumos pii ON pii.pedido_item_id = pi.id
    WHERE pi.pedido_id = p_pedido_id
    GROUP BY pii.insumo_id
  LOOP
    UPDATE public.insumos i
    SET stock_actual = i.stock_actual - r.qty
    WHERE i.id = r.insumo_id;

    INSERT INTO public.stock_movimientos (
      insumo_id, tipo, cantidad, motivo, referencia_pedido_id, notas
    ) VALUES (
      r.insumo_id,
      'salida',
      r.qty,
      'pedido',
      p_pedido_id,
      'Stock preventivo (Épica 1)'
    );
  END LOOP;

  UPDATE public.pedidos
  SET stock_descontado = true
  WHERE id = p_pedido_id;
END;
$$;


ALTER FUNCTION "public"."fn_aplicar_stock_preventivo"("p_pedido_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_aplicar_stock_preventivo"("p_pedido_id" "uuid") IS 'Descuenta stock según pedido_items_insumos; idempotente con stock_descontado.';



CREATE OR REPLACE FUNCTION "public"."fn_costo_directo_unidad_tarifa_anillado"("p_precio_anillado_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_reglas numeric;
  v_tiene boolean;
  v_factor_seguridad constant numeric := 1.10;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.reglas_costo rc
    WHERE rc.precio_anillado_id = p_precio_anillado_id
      AND rc.activo
      AND rc.insumo_id IS NOT NULL
  ) INTO v_tiene;

  IF v_tiene THEN
    SELECT COALESCE(SUM(
      public.fn_costo_unitario_insumo(rc.insumo_id) * rc.cantidad_usada
    ), 0) INTO v_reglas
    FROM public.reglas_costo rc
    WHERE rc.precio_anillado_id = p_precio_anillado_id
      AND rc.activo
      AND rc.insumo_id IS NOT NULL;

    IF v_reglas > 0 THEN
      RETURN round(v_reglas * v_factor_seguridad, 4);
    END IF;
    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_costo_directo_unidad_tarifa_anillado"("p_precio_anillado_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_costo_directo_unidad_tarifa_impresion"("p_precio_impresion_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  pi public.precios_impresion%ROWTYPE;
  v_carillas integer;
  v_hojas integer;
  r record;
  v_qty numeric;
  v_cu numeric;
  v_total numeric := 0;
  v_reglas numeric;
  v_tiene_reglas boolean;
  v_factor_seguridad constant numeric := 1.10;
BEGIN
  SELECT * INTO pi FROM public.precios_impresion WHERE id = p_precio_impresion_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reglas_costo rc
    WHERE rc.precio_impresion_id = p_precio_impresion_id
      AND rc.activo
      AND rc.insumo_id IS NOT NULL
  ) INTO v_tiene_reglas;

  IF v_tiene_reglas THEN
    SELECT COALESCE(SUM(
      public.fn_costo_unitario_insumo(rc.insumo_id) * rc.cantidad_usada
    ), 0) INTO v_reglas
    FROM public.reglas_costo rc
    WHERE rc.precio_impresion_id = p_precio_impresion_id
      AND rc.activo
      AND rc.insumo_id IS NOT NULL;

    IF v_reglas > 0 THEN
      RETURN round(v_reglas * v_factor_seguridad, 4);
    END IF;
    RETURN NULL;
  END IF;

  v_carillas := CASE WHEN pi.doble_faz THEN 2 ELSE 1 END;
  v_hojas := public.fn_hojas_fisicas(v_carillas, pi.doble_faz);

  FOR r IN
    SELECT ri.*
    FROM public.recetas_items ri
    WHERE ri.alcance = 'IMPRESION'
      AND ri.precio_impresion_id = p_precio_impresion_id
      AND ri.es_espiral_auto = false
  LOOP
    v_cu := 0;
    IF r.insumo_id IS NOT NULL THEN
      v_cu := public.fn_costo_unitario_insumo(r.insumo_id);
    END IF;

    v_qty := r.cantidad::numeric;
    IF r.modo_consumo = 'POR_CARA' THEN
      v_qty := v_qty * v_carillas;
    ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
      v_qty := v_qty * v_hojas;
    END IF;
    v_total := v_total + v_qty * v_cu;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN round(v_total, 4);
END;
$$;


ALTER FUNCTION "public"."fn_costo_directo_unidad_tarifa_impresion"("p_precio_impresion_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_costo_directo_unidad_tarifa_impresion"("p_precio_impresion_id" "uuid") IS 'Suma receta IMPRESION (insumos activos): POR_CARA×caras de 1 unidad tarifaria, POR_HOJA_FISICA×hojas.';



CREATE OR REPLACE FUNCTION "public"."fn_costo_por_unidad_venta"("p_insumo_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  SELECT public.fn_costo_unitario_insumo(p_insumo_id);
$$;


ALTER FUNCTION "public"."fn_costo_por_unidad_venta"("p_insumo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_costo_por_unit_venta"("p_insumo_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  SELECT public.fn_costo_unitario_insumo(p_insumo_id);
$$;


ALTER FUNCTION "public"."fn_costo_por_unit_venta"("p_insumo_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_costo_por_unit_venta"("p_insumo_id" "uuid") IS 'Alias de fn_costo_unitario_insumo: costo lote ÷ equivalencia (hojas, páginas/cartucho).';



CREATE OR REPLACE FUNCTION "public"."fn_costo_total_real_insumos"("costo_insumos" numeric) RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  d numeric;
  m numeric;
BEGIN
  SELECT
    COALESCE(cn.pct_desperdicio, 5),
    COALESCE(cn.pct_mantenimiento_maquinas, 10)
  INTO d, m
  FROM public.configuracion_negocio cn
  WHERE cn.id = 1;

  IF costo_insumos IS NULL OR costo_insumos < 0 THEN
    RETURN 0;
  END IF;
  RETURN round(
    costo_insumos * (1 + d / 100.0) * (1 + m / 100.0),
    4
  );
END;
$$;


ALTER FUNCTION "public"."fn_costo_total_real_insumos"("costo_insumos" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_costo_total_real_insumos"("costo_insumos" numeric) IS 'CostoTotal = CostoInsumos × (1+desperdicio) × (1+mantenimiento).';



CREATE OR REPLACE FUNCTION "public"."fn_costo_unitario_insumo"("p_insumo_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p_insumo_id IS NULL THEN 0::numeric
        WHEN i.categoria = 'tinta' THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / (
            1000.0 * NULLIF(
              GREATEST(COALESCE(NULLIF(i.rendimiento, 0), 30), 1)::numeric,
              0
            )
          )
        WHEN COALESCE(i.rendimiento, 0) > 0 THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / NULLIF(i.rendimiento::numeric, 0)
        WHEN i.categoria = 'toner' THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0) / 1000::numeric
        WHEN i.categoria = 'papel' THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / NULLIF(
            GREATEST(
              COALESCE(NULLIF(i.hojas_por_unidad, 0), 0),
              500
            )::numeric,
            0
          )
        WHEN GREATEST(
          COALESCE(i.unidad_venta_equivalente, 0),
          COALESCE(i.unidades_por_compra, 0)
        ) > 0 THEN
          COALESCE(i.costo_compra, i.costo_base, i.precio_compra, 0)
          / GREATEST(
            NULLIF(COALESCE(i.unidad_venta_equivalente, i.unidades_por_compra), 0),
            1
          )
        ELSE 0::numeric
      END
      FROM public.insumos i
      WHERE i.id = p_insumo_id AND COALESCE(i.activo, true)
    ),
    0::numeric
  );
$$;


ALTER FUNCTION "public"."fn_costo_unitario_insumo"("p_insumo_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_costo_unitario_insumo"("p_insumo_id" "uuid") IS 'Costo por unidad de consumo: tinta = (precio litro) / (1000 × páginas/ml); tóner sin rendimiento = ÷1000 pág/cartucho.';



CREATE OR REPLACE FUNCTION "public"."fn_dashboard_pedidos_pendientes"() RETURNS bigint
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COUNT(*)::bigint
  FROM public.pedidos p
  WHERE p.estado IS DISTINCT FROM 'cancelado'
    AND p.estado IS DISTINCT FROM 'entregado'
    AND COALESCE(p.entregado, false) = false;
$$;


ALTER FUNCTION "public"."fn_dashboard_pedidos_pendientes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_dashboard_ranking_vendedores"("p_desde" "date", "p_hasta" "date") RETURNS TABLE("vendedor_id" "uuid", "nombre" "text", "ventas_totales" numeric, "comision_acumulada" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH base AS (
    SELECT
      p.id AS pedido_id,
      p.vendedor_id,
      (timezone('America/Argentina/Buenos_Aires', p.created_at))::date AS dia,
      COALESCE(p.total_pedido, p.total, 0)::numeric AS total_cabecera
    FROM public.pedidos p
    WHERE p.estado IN ('pendiente', 'pagado', 'listo', 'entregado')
      AND p.vendedor_id IS NOT NULL
      AND (timezone('America/Argentina/Buenos_Aires', p.created_at))::date
        BETWEEN p_desde AND p_hasta
  ),
  venta_items AS (
    SELECT
      pi.pedido_id,
      SUM(COALESCE(pi.subtotal_item, 0))::numeric AS venta_lineas
    FROM public.pedido_items pi
    INNER JOIN base b ON b.pedido_id = pi.pedido_id
    GROUP BY pi.pedido_id
  ),
  por_pedido AS (
    SELECT
      b.vendedor_id,
      CASE
        WHEN COALESCE(v.venta_lineas, 0) > 0 THEN v.venta_lineas
        ELSE COALESCE(b.total_cabecera, 0)
      END AS venta,
      COALESCE(p.comision_monto, 0)::numeric AS comision
    FROM base b
    LEFT JOIN venta_items v ON v.pedido_id = b.pedido_id
    INNER JOIN public.pedidos p ON p.id = b.pedido_id
  )
  SELECT
    pp.vendedor_id,
    COALESCE(NULLIF(TRIM(pr.full_name), ''), pr.id::text)::text AS nombre,
    SUM(pp.venta)::numeric AS ventas_totales,
    SUM(pp.comision)::numeric AS comision_acumulada
  FROM por_pedido pp
  INNER JOIN public.profiles pr ON pr.id = pp.vendedor_id
  GROUP BY pp.vendedor_id, pr.id, pr.full_name
  ORDER BY SUM(pp.venta) DESC NULLS LAST;
$$;


ALTER FUNCTION "public"."fn_dashboard_ranking_vendedores"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_dashboard_ranking_vendedores"("p_desde" "date", "p_hasta" "date") IS 'Ventas y comisiones por vendedor (pendiente/pagado/listo/entregado).';



CREATE OR REPLACE FUNCTION "public"."fn_dashboard_top_productos_margen"("p_desde" "date", "p_hasta" "date", "p_limit" integer DEFAULT 3) RETURNS TABLE("producto" "text", "margen_neto" numeric, "venta_total" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH lineas AS (
    SELECT
      COALESCE(
        NULLIF(TRIM(pi.nombre_archivo), ''),
        CONCAT(
          COALESCE(pi.tipo_impresion, 'item'),
          ' · ',
          COALESCE(pi.anillado, '—')
        )
      ) AS lbl,
      COALESCE(pi.subtotal_item, 0)::numeric AS v,
      COALESCE((
        SELECT SUM(pii.costo_total)
        FROM public.pedido_items_insumos pii
        WHERE pii.pedido_item_id = pi.id
      ), 0)::numeric AS c
    FROM public.pedido_items pi
    INNER JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE p.estado IN ('pendiente', 'pagado', 'listo', 'entregado')
      AND (timezone('America/Argentina/Buenos_Aires', p.created_at))::date
        BETWEEN p_desde AND p_hasta
  )
  SELECT
    lineas.lbl AS producto,
    SUM(lineas.v - lineas.c)::numeric AS margen_neto,
    SUM(lineas.v)::numeric AS venta_total
  FROM lineas
  GROUP BY lineas.lbl
  ORDER BY SUM(lineas.v - lineas.c) DESC NULLS LAST
  LIMIT COALESCE(NULLIF(p_limit, 0), 3);
$$;


ALTER FUNCTION "public"."fn_dashboard_top_productos_margen"("p_desde" "date", "p_hasta" "date", "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_dashboard_top_productos_margen"("p_desde" "date", "p_hasta" "date", "p_limit" integer) IS 'Top líneas de pedido por margen (venta ítem − costo BOM) en rango de fechas.';



CREATE OR REPLACE FUNCTION "public"."fn_hojas_fisicas"("paginas" integer, "doble_faz" boolean) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN paginas IS NULL OR paginas < 0 THEN 0
    WHEN doble_faz THEN CEIL(paginas::numeric / 2)::integer
    ELSE paginas
  END;
$$;


ALTER FUNCTION "public"."fn_hojas_fisicas"("paginas" integer, "doble_faz" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_normalizar_cantidad_stock_pii"("p_insumo_id" "uuid", "p_qty" numeric, "p_cuo" numeric) RETURNS TABLE("o_qty" numeric, "o_cuo" numeric, "o_ct" numeric)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    CASE
      WHEN i.categoria = 'tinta' THEN
        p_qty / GREATEST(
          COALESCE(NULLIF(i.rendimiento, 0), 30)::numeric,
          1::numeric
        )
      ELSE p_qty
    END,
    CASE
      WHEN i.categoria = 'tinta' THEN
        p_cuo * GREATEST(
          COALESCE(NULLIF(i.rendimiento, 0), 30)::numeric,
          1::numeric
        )
      ELSE p_cuo
    END,
    round(
      (CASE
        WHEN i.categoria = 'tinta' THEN
          p_qty / GREATEST(
            COALESCE(NULLIF(i.rendimiento, 0), 30)::numeric,
            1::numeric
          )
        ELSE p_qty
      END) *
      (CASE
        WHEN i.categoria = 'tinta' THEN
          p_cuo * GREATEST(
            COALESCE(NULLIF(i.rendimiento, 0), 30)::numeric,
            1::numeric
          )
        ELSE p_cuo
      END),
      4
    )
  FROM public.insumos i
  WHERE i.id = p_insumo_id
  UNION ALL
  SELECT p_qty, p_cuo, round(p_qty * p_cuo, 4)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.insumos j WHERE j.id = p_insumo_id
  );
$$;


ALTER FUNCTION "public"."fn_normalizar_cantidad_stock_pii"("p_insumo_id" "uuid", "p_qty" numeric, "p_cuo" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_normalizar_cantidad_stock_pii"("p_insumo_id" "uuid", "p_qty" numeric, "p_cuo" numeric) IS 'Tinta: cantidad lógica (× carillas) → ml; costo congelado $/ml. Default 30 pág/ml.';



CREATE OR REPLACE FUNCTION "public"."fn_pedido_tiene_bom_completo"("p_pedido_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.pedido_items pi WHERE pi.pedido_id = p_pedido_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.pedido_items pi
      WHERE pi.pedido_id = p_pedido_id
        AND NOT EXISTS (
          SELECT 1 FROM public.pedido_items_insumos pii
          WHERE pii.pedido_item_id = pi.id
        )
    );
$$;


ALTER FUNCTION "public"."fn_pedido_tiene_bom_completo"("p_pedido_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_refresh_precios_costo_por_insumo"("p_insumo_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r record;
  v numeric;
BEGIN
  FOR r IN
    SELECT DISTINCT ri.precio_impresion_id AS pid
    FROM public.recetas_items ri
    WHERE ri.alcance = 'IMPRESION'
      AND ri.precio_impresion_id IS NOT NULL
      AND ri.insumo_id = p_insumo_id
      AND ri.es_espiral_auto = false
  LOOP
    v := public.fn_costo_directo_unidad_tarifa_impresion(r.pid);
    UPDATE public.precios_impresion
    SET costo_insumo_directo = v
    WHERE id = r.pid;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."fn_refresh_precios_costo_por_insumo"("p_insumo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_refresh_recetas_costo_reposicion"("p_insumo_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.recetas_items ri
  SET costo_unitario_reposicion = public.fn_costo_unitario_insumo(ri.insumo_id)
  WHERE ri.insumo_id = p_insumo_id
    AND ri.es_espiral_auto = false
    AND ri.insumo_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."fn_refresh_recetas_costo_reposicion"("p_insumo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_resolver_insumo_espiral_por_hojas"("p_hojas" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  cn public.configuracion_negocio%ROWTYPE;
  mid integer;
  sid uuid;
BEGIN
  IF p_hojas IS NULL OR p_hojas < 1 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO cn FROM public.configuracion_negocio WHERE id = 1;
  IF p_hojas <= COALESCE(cn.anillado_umbral_chico_max, 80) THEN
    mid := COALESCE(cn.espiral_chico_medida_mm, 16);
  ELSIF p_hojas <= COALESCE(cn.anillado_umbral_mediano_max, 200) THEN
    mid := COALESCE(cn.espiral_mediano_medida_mm, 22);
  ELSE
    mid := COALESCE(cn.espiral_grande_medida_mm, 28);
  END IF;
  SELECT i.id INTO sid
  FROM public.insumos i
  WHERE i.categoria = 'espiral'
    AND COALESCE(i.activo, true)
    AND i.medida_mm = mid
  ORDER BY i.nombre
  LIMIT 1;
  RETURN sid;
END;
$$;


ALTER FUNCTION "public"."fn_resolver_insumo_espiral_por_hojas"("p_hojas" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_resolver_insumo_espiral_por_mm_rango"("p_mm" integer, "p_rango" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  sid uuid;
BEGIN
  IF p_mm IS NULL OR p_mm < 1 THEN
    RETURN NULL;
  END IF;
  SELECT i.id INTO sid
  FROM public.insumos i
  WHERE i.categoria = 'espiral'
    AND COALESCE(i.activo, true)
    AND i.medida_mm = p_mm
    AND (
      p_rango IS NULL
      OR btrim(p_rango) = ''
      OR i.rango_anillado IS NULL
      OR i.rango_anillado = p_rango
    )
  ORDER BY i.nombre
  LIMIT 1;
  RETURN sid;
END;
$$;


ALTER FUNCTION "public"."fn_resolver_insumo_espiral_por_mm_rango"("p_mm" integer, "p_rango" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_resolver_insumo_espiral_por_mm_rango"("p_mm" integer, "p_rango" "text") IS 'Espiral por medida mm y rango de tarifa (Chico/Mediano/Grande); NULL si no hay match.';



CREATE OR REPLACE FUNCTION "public"."fn_restaurar_stock_pedido"("p_pedido_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT insumo_id, sum(cantidad)::numeric AS qty
    FROM public.stock_movimientos
    WHERE referencia_pedido_id = p_pedido_id
      AND motivo = 'pedido'
      AND tipo = 'salida'
    GROUP BY insumo_id
  LOOP
    UPDATE public.insumos i
    SET stock_actual = i.stock_actual + r.qty
    WHERE i.id = r.insumo_id;

    INSERT INTO public.stock_movimientos (
      insumo_id, tipo, cantidad, motivo, referencia_pedido_id, notas
    ) VALUES (
      r.insumo_id,
      'entrada',
      r.qty,
      'cancelacion',
      p_pedido_id,
      'Rollback stock por cancelación'
    );
  END LOOP;

  UPDATE public.pedidos
  SET stock_descontado = false
  WHERE id = p_pedido_id;
END;
$$;


ALTER FUNCTION "public"."fn_restaurar_stock_pedido"("p_pedido_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_restaurar_stock_pedido"("p_pedido_id" "uuid") IS 'Revierte salidas de stock por pedido (cancelación).';



CREATE OR REPLACE FUNCTION "public"."handle_auth_user_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _name text;
BEGIN
  IF NEW.raw_user_meta_data IS NOT DISTINCT FROM OLD.raw_user_meta_data THEN
    RETURN NEW;
  END IF;

  _name := NULLIF(public.display_name_from_auth_meta(NEW.raw_user_meta_data), '');

  IF _name IS NOT NULL THEN
    UPDATE public.profiles
    SET
      full_name = _name,
      updated_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_auth_user_updated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _role public.app_role;
  _name TEXT;
BEGIN
  _role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::public.app_role,
    'operador'
  );
  _name := public.display_name_from_auth_meta(COALESCE(NEW.raw_user_meta_data, '{}'::jsonb));

  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, _role, NULLIF(_name, ''))
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.sync_role_to_jwt(NEW.id, _role);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_profile_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.sync_role_to_jwt(NEW.id, NEW.role);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_profile_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_insumo_precio_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.precio_compra IS DISTINCT FROM NEW.precio_compra THEN
    INSERT INTO public.insumos_precios_log (insumo_id, precio_anterior, precio_nuevo, changed_by)
    VALUES (NEW.id, OLD.precio_compra, NEW.precio_compra, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_insumo_precio_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalizar_texto_busqueda"("t" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
  SELECT translate(
    lower(trim(coalesce(t, ''))),
    'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
    'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
  );
$$;


ALTER FUNCTION "public"."normalizar_texto_busqueda"("t" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalizar_texto_busqueda"("t" "text") IS 'Minúsculas y sin tildes (español) para búsqueda insensible a acentos.';



CREATE OR REPLACE FUNCTION "public"."restaurar_stock_pedido"("pedido_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.fn_restaurar_stock_pedido(pedido_id);
$$;


ALTER FUNCTION "public"."restaurar_stock_pedido"("pedido_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_convertir_presupuesto_a_pedido"("p_pedido_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_modalidad text;
  v_venc timestamptz;
BEGIN
  SELECT modalidad, fecha_vencimiento
  INTO v_modalidad, v_venc
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NO_ENCONTRADO';
  END IF;

  IF v_modalidad <> 'presupuesto' THEN
    RAISE EXCEPTION 'NO_ES_PRESUPUESTO';
  END IF;

  IF v_venc IS NOT NULL AND now() > v_venc THEN
    RAISE EXCEPTION 'PRESUPUESTO_VENCIDO: actualizá precios según costos vigentes y generá un nuevo presupuesto';
  END IF;

  UPDATE public.pedidos
  SET
    modalidad = 'pedido',
    fecha_vencimiento = NULL,
    estado = 'pendiente'
  WHERE id = p_pedido_id;
END;
$$;


ALTER FUNCTION "public"."rpc_convertir_presupuesto_a_pedido"("p_pedido_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_convertir_presupuesto_a_pedido"("p_pedido_id" "uuid") IS 'Pasa modalidad a pedido y estado a pendiente; falla si presupuesto venció.';



CREATE OR REPLACE FUNCTION "public"."rpc_delete_insumo_fisico"("p_insumo_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM public.insumos WHERE id = p_insumo_id;
$$;


ALTER FUNCTION "public"."rpc_delete_insumo_fisico"("p_insumo_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_delete_insumo_fisico"("p_insumo_id" "uuid") IS 'Borrado físico; FKs en cascada / SET NULL según tabla.';



CREATE OR REPLACE FUNCTION "public"."rpc_explotar_bom_pedido"("p_pedido_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  it record;
  r record;
  v_carillas integer;
  v_hojas integer;
  v_copias numeric;
  v_bn boolean;
  v_df boolean;
  v_solo boolean;
  v_anillado_mm integer;
  v_pid_imp uuid;
  v_pid_an uuid;
  v_qty numeric;
  v_costo_u numeric;
  v_costo_tot numeric;
  v_sid uuid;
  v_tapa_f uuid;
  v_tapa_d uuid;
  v_cn public.configuracion_negocio%ROWTYPE;
  v_cnt_imp integer;
  v_cnt_an integer;
  v_cnt_reg integer;
  v_rango_cat text;
BEGIN
  SELECT * INTO v_cn FROM public.configuracion_negocio WHERE id = 1;
  v_tapa_f := v_cn.insumo_tapa_frontal_id;
  v_tapa_d := v_cn.insumo_tapa_dorsal_id;

  DELETE FROM public.pedido_items_insumos pii
  USING public.pedido_items pi
  WHERE pii.pedido_item_id = pi.id AND pi.pedido_id = p_pedido_id;

  FOR it IN
    SELECT * FROM public.pedido_items WHERE pedido_id = p_pedido_id
  LOOP
    v_copias := GREATEST(COALESCE(it.copias, 1), 1)::numeric;
    v_solo := COALESCE(it.solo_anillado, false);
    v_df := COALESCE(it.doble_faz, false);
    v_bn := it.tipo_impresion IS NULL OR (it.tipo_impresion NOT ILIKE '%COLOR%');
    v_anillado_mm := it.anillado_medida_mm;
    IF v_anillado_mm IS NULL AND it.anillado IS NOT NULL THEN
      SELECT (regexp_match(it.anillado, '(\d+)'))[1]::integer INTO v_anillado_mm;
    END IF;

    v_carillas := GREATEST(COALESCE(it.paginas, 0), 0);
    v_hojas := public.fn_hojas_fisicas(it.paginas, v_df);

    v_rango_cat := NULL;
    IF it.precio_anillado_id IS NOT NULL THEN
      SELECT pa.nombre_categoria INTO v_rango_cat
      FROM public.precios_anillado pa
      WHERE pa.id = it.precio_anillado_id;
    END IF;

    v_pid_imp := it.precio_impresion_id;
    IF v_pid_imp IS NULL AND NOT v_solo THEN
      SELECT pi2.id INTO v_pid_imp
      FROM public.precios_impresion pi2
      WHERE pi2.tipo = CASE WHEN v_bn THEN 'bn' ELSE 'color' END
        AND pi2.doble_faz = v_df
        AND pi2.activo
      LIMIT 1;
    END IF;

    IF NOT v_solo AND v_carillas > 0 AND v_pid_imp IS NOT NULL THEN
      SELECT count(*) INTO v_cnt_reg
      FROM public.reglas_costo
      WHERE precio_impresion_id = v_pid_imp
        AND activo
        AND insumo_id IS NOT NULL;

      IF v_cnt_reg > 0 THEN
        FOR r IN
          SELECT rc.*, i.categoria AS insumo_cat
          FROM public.reglas_costo rc
          INNER JOIN public.insumos i ON i.id = rc.insumo_id
          WHERE rc.precio_impresion_id = v_pid_imp
            AND rc.activo
            AND rc.insumo_id IS NOT NULL
        LOOP
          IF r.insumo_cat = 'papel' THEN
            v_qty := r.cantidad_usada::numeric * v_hojas * v_copias;
          ELSE
            v_qty := r.cantidad_usada::numeric * v_carillas * v_copias;
          END IF;
          v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
          SELECT o_qty, o_cuo, o_ct
          INTO v_qty, v_costo_u, v_costo_tot
          FROM public.fn_normalizar_cantidad_stock_pii(r.insumo_id, v_qty, v_costo_u);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, r.insumo_id, NULL, v_qty, v_costo_u, v_costo_tot
          );
        END LOOP;
      ELSE
        SELECT count(*) INTO v_cnt_imp
        FROM public.recetas_items
        WHERE alcance = 'IMPRESION' AND precio_impresion_id = v_pid_imp;

        IF v_cnt_imp > 0 THEN
          FOR r IN
            SELECT * FROM public.recetas_items
            WHERE alcance = 'IMPRESION' AND precio_impresion_id = v_pid_imp
          LOOP
            v_qty := r.cantidad::numeric;
            IF r.modo_consumo = 'POR_CARA' THEN
              v_qty := v_qty * v_carillas * v_copias;
            ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
              v_qty := v_qty * v_hojas * v_copias;
            ELSE
              v_qty := v_qty * v_copias;
            END IF;
            v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
            SELECT o_qty, o_cuo, o_ct
            INTO v_qty, v_costo_u, v_costo_tot
            FROM public.fn_normalizar_cantidad_stock_pii(r.insumo_id, v_qty, v_costo_u);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, r.insumo_id, NULL, v_qty, v_costo_u, v_costo_tot
            );
          END LOOP;
        END IF;
      END IF;
    END IF;

    IF v_solo AND v_carillas >= 1 THEN
      v_pid_an := it.precio_anillado_id;
      IF v_pid_an IS NOT NULL THEN
        SELECT count(*) INTO v_cnt_reg
        FROM public.reglas_costo
        WHERE precio_anillado_id = v_pid_an
          AND activo
          AND insumo_id IS NOT NULL;

        IF v_cnt_reg > 0 THEN
          FOR r IN
            SELECT * FROM public.reglas_costo
            WHERE precio_anillado_id = v_pid_an
              AND activo
              AND insumo_id IS NOT NULL
          LOOP
            v_qty := r.cantidad_usada::numeric * v_copias;
            v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
            );
          END LOOP;
        ELSE
          SELECT count(*) INTO v_cnt_an FROM public.recetas_items
          WHERE alcance = 'SOLO_ANILLADO';
          IF v_cnt_an > 0 THEN
            FOR r IN
              SELECT * FROM public.recetas_items WHERE alcance = 'SOLO_ANILLADO'
            LOOP
              v_qty := r.cantidad::numeric;
              IF r.modo_consumo = 'POR_CARA' THEN
                v_qty := v_qty * v_carillas * v_copias;
              ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
                v_qty := v_qty * v_hojas * v_copias;
              ELSE
                v_qty := v_qty * v_copias;
              END IF;
              IF r.es_espiral_auto THEN
                v_sid := public.fn_resolver_insumo_espiral_por_hojas(
                  GREATEST(v_hojas, 1)
                );
                IF v_sid IS NOT NULL THEN
                  v_costo_u := public.fn_costo_unitario_insumo(v_sid);
                  INSERT INTO public.pedido_items_insumos (
                    pedido_item_id, insumo_id, equipo_id, cantidad,
                    costo_unitario_congelado, costo_total
                  ) VALUES (
                    it.id, v_sid, NULL, v_qty, v_costo_u,
                    round(v_qty * v_costo_u, 4)
                  );
                END IF;
              ELSE
                v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
                INSERT INTO public.pedido_items_insumos (
                  pedido_item_id, insumo_id, equipo_id, cantidad,
                  costo_unitario_congelado, costo_total
                ) VALUES (
                  it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
                );
              END IF;
            END LOOP;
          ELSE
            v_sid := public.fn_resolver_insumo_espiral_por_mm_rango(
              v_anillado_mm,
              v_rango_cat
            );
            IF v_sid IS NULL THEN
              v_sid := public.fn_resolver_insumo_espiral_por_hojas(v_hojas);
            END IF;
            IF v_sid IS NOT NULL THEN
              v_costo_u := public.fn_costo_unitario_insumo(v_sid);
              INSERT INTO public.pedido_items_insumos (
                pedido_item_id, insumo_id, equipo_id, cantidad,
                costo_unitario_congelado, costo_total
              ) VALUES (
                it.id, v_sid, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
              );
            END IF;
            IF v_tapa_f IS NOT NULL THEN
              v_costo_u := public.fn_costo_unitario_insumo(v_tapa_f);
              INSERT INTO public.pedido_items_insumos (
                pedido_item_id, insumo_id, equipo_id, cantidad,
                costo_unitario_congelado, costo_total
              ) VALUES (
                it.id, v_tapa_f, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
              );
            END IF;
            IF v_tapa_d IS NOT NULL THEN
              v_costo_u := public.fn_costo_unitario_insumo(v_tapa_d);
              INSERT INTO public.pedido_items_insumos (
                pedido_item_id, insumo_id, equipo_id, cantidad,
                costo_unitario_congelado, costo_total
              ) VALUES (
                it.id, v_tapa_d, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
              );
            END IF;
          END IF;
        END IF;
      ELSE
        SELECT count(*) INTO v_cnt_an FROM public.recetas_items
        WHERE alcance = 'SOLO_ANILLADO';
        IF v_cnt_an > 0 THEN
          FOR r IN
            SELECT * FROM public.recetas_items WHERE alcance = 'SOLO_ANILLADO'
          LOOP
            v_qty := r.cantidad::numeric;
            IF r.modo_consumo = 'POR_CARA' THEN
              v_qty := v_qty * v_carillas * v_copias;
            ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
              v_qty := v_qty * v_hojas * v_copias;
            ELSE
              v_qty := v_qty * v_copias;
            END IF;
            IF r.es_espiral_auto THEN
              v_sid := public.fn_resolver_insumo_espiral_por_hojas(
                GREATEST(v_hojas, 1)
              );
              IF v_sid IS NOT NULL THEN
                v_costo_u := public.fn_costo_unitario_insumo(v_sid);
                INSERT INTO public.pedido_items_insumos (
                  pedido_item_id, insumo_id, equipo_id, cantidad,
                  costo_unitario_congelado, costo_total
                ) VALUES (
                  it.id, v_sid, NULL, v_qty, v_costo_u,
                  round(v_qty * v_costo_u, 4)
                );
              END IF;
            ELSE
              v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
              INSERT INTO public.pedido_items_insumos (
                pedido_item_id, insumo_id, equipo_id, cantidad,
                costo_unitario_congelado, costo_total
              ) VALUES (
                it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
              );
            END IF;
          END LOOP;
        ELSE
          v_sid := public.fn_resolver_insumo_espiral_por_mm_rango(
            v_anillado_mm,
            v_rango_cat
          );
          IF v_sid IS NULL THEN
            v_sid := public.fn_resolver_insumo_espiral_por_hojas(v_hojas);
          END IF;
          IF v_sid IS NOT NULL THEN
            v_costo_u := public.fn_costo_unitario_insumo(v_sid);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, v_sid, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
            );
          END IF;
          IF v_tapa_f IS NOT NULL THEN
            v_costo_u := public.fn_costo_unitario_insumo(v_tapa_f);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, v_tapa_f, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
            );
          END IF;
          IF v_tapa_d IS NOT NULL THEN
            v_costo_u := public.fn_costo_unitario_insumo(v_tapa_d);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, v_tapa_d, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
            );
          END IF;
        END IF;
      END IF;
    END IF;

    IF NOT v_solo AND COALESCE(v_anillado_mm, 0) > 0 THEN
      SELECT count(*) INTO v_cnt_an FROM public.recetas_items
      WHERE alcance = 'ANILLADO_EXTRA';
      IF v_cnt_an > 0 THEN
        FOR r IN
          SELECT * FROM public.recetas_items WHERE alcance = 'ANILLADO_EXTRA'
        LOOP
          v_qty := r.cantidad::numeric;
          IF r.modo_consumo = 'POR_CARA' THEN
            v_qty := v_qty * v_carillas * v_copias;
          ELSIF r.modo_consumo = 'POR_HOJA_FISICA' THEN
            v_qty := v_qty * v_hojas * v_copias;
          ELSE
            v_qty := v_qty * v_copias;
          END IF;
          IF r.es_espiral_auto THEN
            v_sid := public.fn_resolver_insumo_espiral_por_mm_rango(
              v_anillado_mm,
              v_rango_cat
            );
            IF v_sid IS NULL THEN
              v_sid := public.fn_resolver_insumo_espiral_por_hojas(
                GREATEST(v_hojas, 1)
              );
            END IF;
            IF v_sid IS NOT NULL THEN
              v_costo_u := public.fn_costo_unitario_insumo(v_sid);
              INSERT INTO public.pedido_items_insumos (
                pedido_item_id, insumo_id, equipo_id, cantidad,
                costo_unitario_congelado, costo_total
              ) VALUES (
                it.id, v_sid, NULL, v_qty, v_costo_u,
                round(v_qty * v_costo_u, 4)
              );
            END IF;
          ELSE
            v_costo_u := public.fn_costo_unitario_insumo(r.insumo_id);
            INSERT INTO public.pedido_items_insumos (
              pedido_item_id, insumo_id, equipo_id, cantidad,
              costo_unitario_congelado, costo_total
            ) VALUES (
              it.id, r.insumo_id, NULL, v_qty, v_costo_u, round(v_qty * v_costo_u, 4)
            );
          END IF;
        END LOOP;
      ELSE
        v_sid := public.fn_resolver_insumo_espiral_por_mm_rango(
          v_anillado_mm,
          v_rango_cat
        );
        IF v_sid IS NULL THEN
          v_sid := public.fn_resolver_insumo_espiral_por_hojas(GREATEST(v_hojas, 1));
        END IF;
        IF v_sid IS NOT NULL THEN
          v_costo_u := public.fn_costo_unitario_insumo(v_sid);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, v_sid, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
          );
        END IF;
        IF v_tapa_f IS NOT NULL THEN
          v_costo_u := public.fn_costo_unitario_insumo(v_tapa_f);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, v_tapa_f, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
          );
        END IF;
        IF v_tapa_d IS NOT NULL THEN
          v_costo_u := public.fn_costo_unitario_insumo(v_tapa_d);
          INSERT INTO public.pedido_items_insumos (
            pedido_item_id, insumo_id, equipo_id, cantidad,
            costo_unitario_congelado, costo_total
          ) VALUES (
            it.id, v_tapa_d, NULL, v_copias, v_costo_u, round(v_copias * v_costo_u, 4)
          );
        END IF;
      END IF;
    END IF;

  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rpc_explotar_bom_pedido"("p_pedido_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_explotar_bom_pedido"("p_pedido_id" "uuid") IS 'BOM pedido: en reglas de impresión, papel = cantidad × hojas físicas × copias; tinta/tóner en carillas; tinta PII en ml.';



CREATE OR REPLACE FUNCTION "public"."set_configuracion_negocio_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_configuracion_negocio_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_role_to_jwt"("user_id" "uuid", "new_role" "public"."app_role") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', new_role::text)
  WHERE id = user_id;
END;
$$;


ALTER FUNCTION "public"."sync_role_to_jwt"("user_id" "uuid", "new_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_insumos_propaga_costo_recetas"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.costo_base IS DISTINCT FROM NEW.costo_base OR
    OLD.precio_compra IS DISTINCT FROM NEW.precio_compra OR
    OLD.unidad_venta_equivalente IS DISTINCT FROM NEW.unidad_venta_equivalente
  ) THEN
    PERFORM public.fn_refresh_recetas_costo_reposicion(NEW.id);
    PERFORM public.fn_refresh_precios_costo_por_insumo(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_insumos_propaga_costo_recetas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_insumos_refresh_tarifas_costo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  pid uuid;
  aid uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.costo_compra IS DISTINCT FROM NEW.costo_compra OR
    OLD.unidades_por_compra IS DISTINCT FROM NEW.unidades_por_compra OR
    OLD.rendimiento IS DISTINCT FROM NEW.rendimiento OR
    OLD.costo_base IS DISTINCT FROM NEW.costo_base OR
    OLD.precio_compra IS DISTINCT FROM NEW.precio_compra OR
    OLD.unidad_venta_equivalente IS DISTINCT FROM NEW.unidad_venta_equivalente
  ) THEN
    PERFORM public.fn_refresh_recetas_costo_reposicion(NEW.id);

    FOR pid IN
      SELECT DISTINCT rc.precio_impresion_id
      FROM public.reglas_costo rc
      WHERE rc.insumo_id = NEW.id AND rc.precio_impresion_id IS NOT NULL
    LOOP
      UPDATE public.precios_impresion p
      SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id)
      WHERE p.id = pid;
    END LOOP;

    FOR aid IN
      SELECT DISTINCT rc.precio_anillado_id
      FROM public.reglas_costo rc
      WHERE rc.insumo_id = NEW.id AND rc.precio_anillado_id IS NOT NULL
    LOOP
      UPDATE public.precios_anillado pa
      SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_anillado(pa.id)
      WHERE pa.id = aid;
    END LOOP;

    FOR pid IN
      SELECT DISTINCT ri.precio_impresion_id
      FROM public.recetas_items ri
      WHERE ri.insumo_id = NEW.id AND ri.alcance = 'IMPRESION' AND ri.precio_impresion_id IS NOT NULL
    LOOP
      UPDATE public.precios_impresion p
      SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id)
      WHERE p.id = pid;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_insumos_refresh_tarifas_costo"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_insumos_refresh_tarifas_costo"() IS 'Tras cambiar costo/rendimiento del insumo: actualiza costo_unitario_reposicion en recetas_items y costo_insumo_directo en tarifas (impresión y anillado).';



CREATE OR REPLACE FUNCTION "public"."trg_pedidos_asignar_numero_publico"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.numero_publico IS NULL THEN
    NEW.numero_publico := nextval('public.pedidos_numero_publico_seq')::integer;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_pedidos_asignar_numero_publico"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_pedidos_calcular_comision"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  pct numeric;
  base numeric;
  v_role public.app_role;
BEGIN
  base := COALESCE(NEW.total_pedido, NEW.total, 0);
  IF NEW.vendedor_id IS NULL THEN
    NEW.comision_monto := 0;
    RETURN NEW;
  END IF;

  SELECT pr.role, pr.comision_pct
  INTO v_role, pct
  FROM public.profiles pr
  WHERE pr.id = NEW.vendedor_id;

  IF NOT FOUND THEN
    NEW.comision_monto := 0;
    RETURN NEW;
  END IF;

  IF v_role IS DISTINCT FROM 'vendedor'::public.app_role THEN
    NEW.comision_monto := 0;
    RETURN NEW;
  END IF;

  pct := COALESCE(pct, 10);
  NEW.comision_monto := ROUND(base * (pct / 100.0), 2);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_pedidos_calcular_comision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_pedidos_set_vencimiento_presupuesto"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  dias integer;
BEGIN
  IF NEW.modalidad = 'presupuesto' AND NEW.fecha_vencimiento IS NULL THEN
    SELECT COALESCE(cn.dias_vigencia_presupuesto, 7)
    INTO dias
    FROM public.configuracion_negocio cn
    WHERE cn.id = 1;
    NEW.fecha_vencimiento := now() + (COALESCE(dias, 7) || ' days')::interval;
  END IF;
  IF NEW.modalidad = 'pedido' AND TG_OP = 'INSERT' THEN
    NEW.fecha_vencimiento := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_pedidos_set_vencimiento_presupuesto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_pedidos_stock_preventivo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
    AND NEW.estado = 'pendiente'
    AND OLD.estado IN ('presupuesto', 'presupuestado')
    AND COALESCE(NEW.stock_descontado, false) = false
  THEN
    PERFORM public.fn_aplicar_stock_preventivo(NEW.id);
  END IF;

  IF NEW.estado = 'cancelado'
    AND OLD.estado IS DISTINCT FROM 'cancelado'
    AND COALESCE(OLD.stock_descontado, false) = true
  THEN
    PERFORM public.fn_restaurar_stock_pedido(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_pedidos_stock_preventivo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_pedidos_validar_bom_antes_senado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
    AND NEW.estado = 'pendiente'
    AND OLD.estado IN ('presupuesto', 'presupuestado')
    AND COALESCE(OLD.estado, '') <> 'cancelado'
  THEN
    IF NOT public.fn_pedido_tiene_bom_completo(NEW.id) THEN
      RAISE EXCEPTION 'BOM_INCOMPLETO: ejecutá la explosión de materiales antes de confirmar (rpc_explotar_bom_pedido)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_pedidos_validar_bom_antes_senado"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_pedidos_validar_bom_antes_senado"() IS 'Antes de presupuesto → pendiente: exige BOM completo.';



CREATE OR REPLACE FUNCTION "public"."trg_recetas_set_costo_reposicion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.es_espiral_auto = true OR NEW.insumo_id IS NULL THEN
    NEW.costo_unitario_reposicion := NULL;
  ELSE
    NEW.costo_unitario_reposicion := public.fn_costo_unitario_insumo(NEW.insumo_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_recetas_set_costo_reposicion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_reglas_refresh_tarifa"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  pid uuid;
  aid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    pid := OLD.precio_impresion_id;
    aid := OLD.precio_anillado_id;
  ELSE
    pid := NEW.precio_impresion_id;
    aid := NEW.precio_anillado_id;
  END IF;

  IF pid IS NOT NULL THEN
    UPDATE public.precios_impresion p
    SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_impresion(p.id)
    WHERE p.id = pid;
  END IF;
  IF aid IS NOT NULL THEN
    UPDATE public.precios_anillado pa
    SET costo_insumo_directo = public.fn_costo_directo_unidad_tarifa_anillado(pa.id)
    WHERE pa.id = aid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."trg_reglas_refresh_tarifa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_equipos_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_equipos_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_insumos_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_insumos_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."_printmanager_migrations" (
    "key" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."_printmanager_migrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."_printmanager_migrations" IS 'Marcas de migraciones de datos (evitar doble ejecución).';



CREATE TABLE IF NOT EXISTS "public"."config" (
    "id" "text" NOT NULL,
    "valor" "text" NOT NULL
);


ALTER TABLE "public"."config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."config_costos" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "descripcion" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."config_costos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuracion_negocio" (
    "id" smallint DEFAULT 1 NOT NULL,
    "pct_desperdicio" numeric DEFAULT 5 NOT NULL,
    "pct_mantenimiento_maquinas" numeric DEFAULT 10 NOT NULL,
    "dias_vigencia_presupuesto" integer DEFAULT 7 NOT NULL,
    "margen_objetivo_pct" numeric DEFAULT 40 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "anillado_umbral_chico_max" integer DEFAULT 80 NOT NULL,
    "anillado_umbral_mediano_max" integer DEFAULT 200 NOT NULL,
    "espiral_chico_medida_mm" integer DEFAULT 16 NOT NULL,
    "espiral_mediano_medida_mm" integer DEFAULT 22 NOT NULL,
    "espiral_grande_medida_mm" integer DEFAULT 28 NOT NULL,
    "insumo_tapa_frontal_id" "uuid",
    "insumo_tapa_dorsal_id" "uuid",
    CONSTRAINT "chk_dias" CHECK ((("dias_vigencia_presupuesto" >= 1) AND ("dias_vigencia_presupuesto" <= 365))),
    CONSTRAINT "chk_margen_obj" CHECK ((("margen_objetivo_pct" >= (0)::numeric) AND ("margen_objetivo_pct" <= (100)::numeric))),
    CONSTRAINT "chk_pct_desperdicio" CHECK ((("pct_desperdicio" >= (0)::numeric) AND ("pct_desperdicio" <= (100)::numeric))),
    CONSTRAINT "chk_pct_mant" CHECK ((("pct_mantenimiento_maquinas" >= (0)::numeric) AND ("pct_mantenimiento_maquinas" <= (100)::numeric))),
    CONSTRAINT "configuracion_negocio_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."configuracion_negocio" OWNER TO "postgres";


COMMENT ON COLUMN "public"."configuracion_negocio"."anillado_umbral_chico_max" IS 'Hojas físicas máximas para espiral chico (≤ este valor).';



COMMENT ON COLUMN "public"."configuracion_negocio"."anillado_umbral_mediano_max" IS 'Hojas físicas máximas para espiral mediano (entre chico+1 y este valor).';



CREATE TABLE IF NOT EXISTS "public"."equipos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "costo_adquisicion" numeric DEFAULT 0 NOT NULL,
    "fecha_adquisicion" "date",
    "vida_util_meses" integer DEFAULT 36 NOT NULL,
    "costo_mantenimiento_mensual" numeric DEFAULT 0 NOT NULL,
    "paginas_mes_estimadas" integer DEFAULT 3000 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "equipos_tipo_check" CHECK (("tipo" = ANY (ARRAY['inkjet'::"text", 'laser'::"text"])))
);


ALTER TABLE "public"."equipos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gastos_fijos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "concepto" "text" NOT NULL,
    "monto" numeric NOT NULL,
    "categoria" "public"."categoria_gasto_fijo" NOT NULL,
    "dia_vencimiento" smallint,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gastos_fijos_dia_vencimiento_check" CHECK ((("dia_vencimiento" IS NULL) OR (("dia_vencimiento" >= 1) AND ("dia_vencimiento" <= 28)))),
    CONSTRAINT "gastos_fijos_monto_check" CHECK (("monto" >= (0)::numeric))
);


ALTER TABLE "public"."gastos_fijos" OWNER TO "postgres";


COMMENT ON TABLE "public"."gastos_fijos" IS 'Gastos fijos mensuales (Monotributo, servicios, amortización, sueldos).';



CREATE TABLE IF NOT EXISTS "public"."insumos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "categoria" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "unidad" "text" NOT NULL,
    "medida_mm" integer,
    "color" "text",
    "tipo_papel" "text",
    "rendimiento" integer,
    "hojas_por_unidad" integer,
    "precio_compra" numeric DEFAULT 0 NOT NULL,
    "stock_actual" numeric DEFAULT 0 NOT NULL,
    "stock_minimo" numeric DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "costo_base" numeric,
    "unidad_medida" "text",
    "unidad_venta_equivalente" numeric DEFAULT 1 NOT NULL,
    "costo_compra" numeric,
    "unidades_por_compra" numeric,
    "rango_anillado" "text",
    "toner_modelo_id" "uuid",
    CONSTRAINT "insumos_categoria_check" CHECK (("categoria" = ANY (ARRAY['espiral'::"text", 'tapa_transparente'::"text", 'tapa_color'::"text", 'papel'::"text", 'tinta'::"text", 'toner'::"text", 'bolsa'::"text", 'bolsa_propileno'::"text", 'clip'::"text", 'otro'::"text"]))),
    CONSTRAINT "insumos_rango_anillado_check" CHECK ((("rango_anillado" IS NULL) OR ("rango_anillado" = ANY (ARRAY['Chico'::"text", 'Mediano'::"text", 'Grande'::"text"])))),
    CONSTRAINT "insumos_unidad_check" CHECK (("unidad" = ANY (ARRAY['unidad'::"text", 'litro'::"text", 'resma'::"text", 'cartucho'::"text", 'paquete'::"text"])))
);


ALTER TABLE "public"."insumos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."insumos"."rendimiento" IS 'Papel: hojas por resma; tóner: páginas por cartucho; tinta: páginas impresas por ml (stock en ml; precio compra $/litro).';



COMMENT ON COLUMN "public"."insumos"."stock_actual" IS 'Unidades mínimas de consumo (hojas, carillas, etc.); valor final enviado por la app.';



COMMENT ON COLUMN "public"."insumos"."costo_base" IS 'Costo del lote de compra; debe alinearse con precio_compra desde la app si aplica.';



COMMENT ON COLUMN "public"."insumos"."unidad_medida" IS 'Etiqueta de unidad de compra (ej. resma, cartucho); alinea con unidad legacy.';



COMMENT ON COLUMN "public"."insumos"."unidad_venta_equivalente" IS 'Cuántas unidades de consumo/venta entran en costo_base (ej. 500 hojas por resma).';



COMMENT ON COLUMN "public"."insumos"."costo_compra" IS 'Precio del lote; costo unitario = costo_compra / unidades_por_compra.';



COMMENT ON COLUMN "public"."insumos"."unidades_por_compra" IS 'Unidades de consumo por lote (ej. 500 hojas).';



COMMENT ON COLUMN "public"."insumos"."rango_anillado" IS 'Solo espirales: coincide con precios_anillado.nombre_categoria.';



COMMENT ON COLUMN "public"."insumos"."toner_modelo_id" IS 'Opcional: perfil del catálogo toner_modelos usado al guardar (null si personalizado).';



CREATE TABLE IF NOT EXISTS "public"."insumos_precios_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "precio_anterior" numeric NOT NULL,
    "precio_nuevo" numeric NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "changed_by" "uuid"
);


ALTER TABLE "public"."insumos_precios_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precios_anillado" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "medida_mm" integer NOT NULL,
    "paginas_max" integer,
    "precio_venta" numeric NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "costo_insumo_directo" numeric,
    "nombre_categoria" "text" DEFAULT 'Mediano'::"text" NOT NULL,
    CONSTRAINT "precios_anillado_nombre_categoria_check" CHECK (("nombre_categoria" = ANY (ARRAY['Chico'::"text", 'Mediano'::"text", 'Grande'::"text"])))
);


ALTER TABLE "public"."precios_anillado" OWNER TO "postgres";


COMMENT ON COLUMN "public"."precios_anillado"."costo_insumo_directo" IS 'Costo variable de insumos por trabajo de anillado, antes de factores.';



COMMENT ON COLUMN "public"."precios_anillado"."nombre_categoria" IS 'Etiqueta de tarifa (rango); alinea con insumos espiral.rango_anillado.';



CREATE TABLE IF NOT EXISTS "public"."precios_impresion" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "doble_faz" boolean DEFAULT false NOT NULL,
    "precio_venta" numeric NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "costo_insumo_directo" numeric,
    "equipo_id" "uuid",
    "perfil_tinta" "text" DEFAULT 'color'::"text" NOT NULL,
    CONSTRAINT "precios_impresion_perfil_tinta_check" CHECK (("perfil_tinta" = ANY (ARRAY['bn'::"text", 'color'::"text"])))
);


ALTER TABLE "public"."precios_impresion" OWNER TO "postgres";


COMMENT ON COLUMN "public"."precios_impresion"."tipo" IS 'Slug de línea de producto (bn, color, candy_bar, …). Sin CHECK: nuevas líneas vía app.';



COMMENT ON COLUMN "public"."precios_impresion"."costo_insumo_directo" IS 'Costo variable de insumos por unidad tarifaria (hoja), antes de factores desperdicio/mantenimiento.';



COMMENT ON COLUMN "public"."precios_impresion"."equipo_id" IS 'Equipo al que se atribuye ROI / costo operativo para ítems que usan esta tarifa de impresión.';



COMMENT ON COLUMN "public"."precios_impresion"."perfil_tinta" IS 'bn = costo motor tóner; color = suma tintas (stickers, pegatinas, etc.).';



CREATE OR REPLACE VIEW "public"."lista_precios_publica" AS
 SELECT "pi"."id",
    'impresion'::"text" AS "familia",
    (("pi"."tipo" || '_'::"text") ||
        CASE
            WHEN "pi"."doble_faz" THEN 'df'::"text"
            ELSE 'sf'::"text"
        END) AS "codigo",
    TRIM(BOTH FROM (("upper"("pi"."tipo") || ' '::"text") ||
        CASE
            WHEN "pi"."doble_faz" THEN 'doble faz'::"text"
            ELSE 'simple faz'::"text"
        END)) AS "descripcion",
    "pi"."precio_venta" AS "precio_final",
    "pi"."activo",
    "pi"."costo_insumo_directo",
    "pi"."updated_at"
   FROM "public"."precios_impresion" "pi"
UNION ALL
 SELECT "pa"."id",
    'anillado'::"text" AS "familia",
    ('ani_'::"text" || ("pa"."medida_mm")::"text") AS "codigo",
    (('Anillado '::"text" || ("pa"."medida_mm")::"text") || ' mm'::"text") AS "descripcion",
    "pa"."precio_venta" AS "precio_final",
    "pa"."activo",
    "pa"."costo_insumo_directo",
    "pa"."updated_at"
   FROM "public"."precios_anillado" "pa";


ALTER VIEW "public"."lista_precios_publica" OWNER TO "postgres";


COMMENT ON VIEW "public"."lista_precios_publica" IS 'Catálogo unificado de precios de venta; referencia para UI operador.';



CREATE TABLE IF NOT EXISTS "public"."mensajes_whatsapp_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "plantilla_id" "uuid",
    "cuerpo_texto" "text" NOT NULL,
    "enviado_at" timestamp with time zone DEFAULT "now"(),
    "enviado_por" "uuid"
);


ALTER TABLE "public"."mensajes_whatsapp_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedido_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "nombre_archivo" "text",
    "paginas" integer DEFAULT 0,
    "copias" integer DEFAULT 1,
    "tipo_impresion" "text",
    "anillado" "text",
    "precio_unitario" numeric DEFAULT 0,
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "descuento_porcentaje" numeric,
    "descuento_monto" numeric,
    "recargo_porcentaje" numeric,
    "recargo_monto" numeric,
    "tipo_tinta" "text" DEFAULT 'bn'::"text",
    "doble_faz" boolean DEFAULT false,
    "anillado_costo" numeric DEFAULT 0,
    "subtotal_item" numeric DEFAULT 0,
    "solo_anillado" boolean DEFAULT false NOT NULL,
    "precio_impresion_id" "uuid",
    "precio_anillado_id" "uuid",
    "anillado_medida_mm" integer,
    "impreso" boolean DEFAULT false NOT NULL,
    "nombre_archivo_busqueda" "text" GENERATED ALWAYS AS ("public"."normalizar_texto_busqueda"("nombre_archivo")) STORED
);


ALTER TABLE "public"."pedido_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pedido_items"."solo_anillado" IS 'Cliente trae impresión; solo materiales de encuadernación.';



COMMENT ON COLUMN "public"."pedido_items"."anillado_medida_mm" IS 'Medida mm del anillado elegido en tarifa (referencia).';



COMMENT ON COLUMN "public"."pedido_items"."impreso" IS 'Marca operativa por ítem de impresión: true=ya impreso, false=pendiente.';



CREATE TABLE IF NOT EXISTS "public"."pedido_items_insumos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_item_id" "uuid" NOT NULL,
    "insumo_id" "uuid",
    "equipo_id" "uuid",
    "cantidad" numeric NOT NULL,
    "costo_unitario_congelado" numeric NOT NULL,
    "costo_total" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pedido_items_insumos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente" "text" DEFAULT ''::"text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "sena" numeric DEFAULT 0 NOT NULL,
    "fecha_entrega" "date",
    "observaciones" "text" DEFAULT ''::"text",
    "entregado" boolean DEFAULT false NOT NULL,
    "fecha_pago" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo_pago" "text",
    "stock_descontado" boolean DEFAULT false NOT NULL,
    "descuento_global_porcentaje" numeric,
    "descuento_global_monto" numeric,
    "recargo_global_porcentaje" numeric,
    "recargo_global_monto" numeric,
    "total_pedido" numeric DEFAULT 0,
    "paginas" integer DEFAULT 0,
    "tipo_tinta" "text",
    "doble_faz" boolean DEFAULT false,
    "anillado_costo" numeric DEFAULT 0,
    "modalidad" "text" DEFAULT 'pedido'::"text" NOT NULL,
    "fecha_vencimiento" timestamp with time zone,
    "numero_publico" integer,
    "vendedor_id" "uuid",
    "comision_monto" numeric DEFAULT 0 NOT NULL,
    "forma_pago_sena" "text",
    "forma_pago_total" "text",
    "facturado" boolean DEFAULT false NOT NULL,
    "cliente_busqueda" "text" GENERATED ALWAYS AS ("public"."normalizar_texto_busqueda"("cliente")) STORED,
    "observaciones_busqueda" "text" GENERATED ALWAYS AS ("public"."normalizar_texto_busqueda"("observaciones")) STORED,
    CONSTRAINT "pedidos_modalidad_check" CHECK (("modalidad" = ANY (ARRAY['presupuesto'::"text", 'pedido'::"text"])))
);


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pedidos"."estado" IS 'presupuesto | pendiente | listo | pagado | entregado | cancelado';



COMMENT ON COLUMN "public"."pedidos"."modalidad" IS 'presupuesto: cotización con vigencia; pedido: trabajo confirmado.';



COMMENT ON COLUMN "public"."pedidos"."fecha_vencimiento" IS 'Fin de vigencia del presupuesto; se calcula al crear si modalidad = presupuesto.';



COMMENT ON COLUMN "public"."pedidos"."numero_publico" IS 'Número correlativo legible (ej. 1024) para mostrar #1024 en UI y WhatsApp.';



COMMENT ON COLUMN "public"."pedidos"."vendedor_id" IS 'Vendedor asignado (operador o vendedor).';



COMMENT ON COLUMN "public"."pedidos"."comision_monto" IS 'Comisión calculada: base venta × comision_pct del vendedor.';



COMMENT ON COLUMN "public"."pedidos"."forma_pago_sena" IS 'Si hay seña: siempre transferencia (regla de negocio).';



COMMENT ON COLUMN "public"."pedidos"."forma_pago_total" IS 'efectivo | transferencia al cobrar el saldo total (modal Cobrar total).';



COMMENT ON COLUMN "public"."pedidos"."facturado" IS 'True si ya se exportó en Facturación y se marcó como facturado.';



CREATE SEQUENCE IF NOT EXISTS "public"."pedidos_numero_publico_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pedidos_numero_publico_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plantillas_whatsapp" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "estado_destino" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "cuerpo" "text" NOT NULL,
    "incluir_datos_pago" boolean DEFAULT false NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "orden" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "match_criterio" "text" DEFAULT 'any'::"text" NOT NULL,
    CONSTRAINT "plantillas_whatsapp_match_criterio_check" CHECK (("match_criterio" = ANY (ARRAY['any'::"text", 'pago_total'::"text", 'con_sena'::"text", 'sin_sena'::"text"])))
);


ALTER TABLE "public"."plantillas_whatsapp" OWNER TO "postgres";


COMMENT ON COLUMN "public"."plantillas_whatsapp"."match_criterio" IS 'Criterio de pago para elegir plantilla: pago_total | con_sena | sin_sena | any (fallback).';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'operador'::"public"."app_role" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "comision_pct" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "profiles_comision_pct_check" CHECK ((("comision_pct" >= (0)::numeric) AND ("comision_pct" <= (100)::numeric)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."comision_pct" IS 'Solo aplica a role vendedor (externos). Admin/operador deben permanecer en 0.';



CREATE TABLE IF NOT EXISTS "public"."recetas_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alcance" "text" NOT NULL,
    "precio_impresion_id" "uuid",
    "insumo_id" "uuid",
    "modo_consumo" "text" NOT NULL,
    "cantidad" numeric DEFAULT 1 NOT NULL,
    "es_espiral_auto" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "costo_unitario_reposicion" numeric,
    CONSTRAINT "chk_receta_alcance_impresion" CHECK (((("alcance" = 'IMPRESION'::"text") AND ("precio_impresion_id" IS NOT NULL)) OR (("alcance" = ANY (ARRAY['SOLO_ANILLADO'::"text", 'ANILLADO_EXTRA'::"text"])) AND ("precio_impresion_id" IS NULL)))),
    CONSTRAINT "chk_receta_espiral_auto" CHECK (((("es_espiral_auto" = false) AND ("insumo_id" IS NOT NULL)) OR (("es_espiral_auto" = true) AND ("insumo_id" IS NULL)))),
    CONSTRAINT "recetas_items_alcance_check" CHECK (("alcance" = ANY (ARRAY['IMPRESION'::"text", 'SOLO_ANILLADO'::"text", 'ANILLADO_EXTRA'::"text"]))),
    CONSTRAINT "recetas_items_cantidad_check" CHECK (("cantidad" > (0)::numeric)),
    CONSTRAINT "recetas_items_modo_consumo_check" CHECK (("modo_consumo" = ANY (ARRAY['POR_CARA'::"text", 'POR_HOJA_FISICA'::"text", 'POR_TRABAJO'::"text"])))
);


ALTER TABLE "public"."recetas_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."recetas_items" IS 'BOM: insumos por tarifa de impresión o bloques de anillado (espiral auto = sin insumo fijo).';



COMMENT ON COLUMN "public"."recetas_items"."costo_unitario_reposicion" IS 'Costo unitario de reposición del insumo (costo_base ÷ contenido); se sincroniza al editar insumo o receta.';



CREATE TABLE IF NOT EXISTS "public"."reglas_costo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "precio_impresion_id" "uuid",
    "insumo_id" "uuid",
    "cantidad_usada" numeric DEFAULT 1 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "precio_anillado_id" "uuid",
    CONSTRAINT "reglas_costo_cantidad_usada_check" CHECK (("cantidad_usada" > (0)::numeric)),
    CONSTRAINT "reglas_costo_tarifa_una" CHECK (((("precio_impresion_id" IS NOT NULL) AND ("precio_anillado_id" IS NULL)) OR (("precio_impresion_id" IS NULL) AND ("precio_anillado_id" IS NOT NULL))))
);


ALTER TABLE "public"."reglas_costo" OWNER TO "postgres";


COMMENT ON TABLE "public"."reglas_costo" IS 'Componentes de costo por tarifa de impresión; insumo opcional (borrado → NULL, costo 0).';



COMMENT ON COLUMN "public"."reglas_costo"."precio_anillado_id" IS 'Tarifa de anillado (medida mm); alternativa exclusiva a precio_impresion_id.';



CREATE TABLE IF NOT EXISTS "public"."stock_movimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "cantidad" numeric NOT NULL,
    "motivo" "text" NOT NULL,
    "referencia_pedido_id" "uuid",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "stock_movimientos_motivo_check" CHECK (("motivo" = ANY (ARRAY['compra'::"text", 'pedido'::"text", 'ajuste_manual'::"text", 'devolucion'::"text", 'cancelacion'::"text"]))),
    CONSTRAINT "stock_movimientos_tipo_check" CHECK (("tipo" = ANY (ARRAY['entrada'::"text", 'salida'::"text", 'ajuste'::"text"])))
);


ALTER TABLE "public"."stock_movimientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."toner_modelos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text",
    "nombre" "text" NOT NULL,
    "notas" "text",
    "gramos_por_cartucho" numeric NOT NULL,
    "mg_por_cara" numeric NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "toner_modelos_gramos_por_cartucho_check" CHECK ((("gramos_por_cartucho" > (0)::numeric) AND ("gramos_por_cartucho" <= (50000)::numeric))),
    CONSTRAINT "toner_modelos_mg_por_cara_check" CHECK ((("mg_por_cara" > (0)::numeric) AND ("mg_por_cara" <= (500000)::numeric)))
);


ALTER TABLE "public"."toner_modelos" OWNER TO "postgres";


COMMENT ON TABLE "public"."toner_modelos" IS 'Perfiles de referencia para tóner laser: gramos por cartucho y mg por cara A4 (cobertura de referencia).';



CREATE OR REPLACE VIEW "public"."v_equipo_resumen_roi" AS
 WITH "ins" AS (
         SELECT "pedido_items_insumos"."pedido_item_id",
            "sum"("pedido_items_insumos"."costo_total") AS "costo_insumos"
           FROM "public"."pedido_items_insumos"
          WHERE ("pedido_items_insumos"."insumo_id" IS NOT NULL)
          GROUP BY "pedido_items_insumos"."pedido_item_id"
        ), "lineas" AS (
         SELECT "pri"."equipo_id",
            ((COALESCE("pi"."subtotal_item", (0)::numeric) - (COALESCE("ins"."costo_insumos", (0)::numeric) * ((1)::numeric + (( SELECT COALESCE("cn"."pct_desperdicio", (5)::numeric) AS "coalesce"
                   FROM "public"."configuracion_negocio" "cn"
                  WHERE ("cn"."id" = 1)) / 100.0)))) - ((((("e_1"."costo_adquisicion" / (NULLIF("e_1"."vida_util_meses", 0))::numeric) + ("e_1"."costo_mantenimiento_mensual" * ((1)::numeric + (( SELECT COALESCE("cn"."pct_mantenimiento_maquinas", (10)::numeric) AS "coalesce"
                   FROM "public"."configuracion_negocio" "cn"
                  WHERE ("cn"."id" = 1)) / 100.0)))) / (NULLIF("e_1"."paginas_mes_estimadas", 0))::numeric) * (GREATEST(COALESCE("pi"."paginas", 0), 0))::numeric) * (GREATEST(COALESCE("pi"."copias", 1), 1))::numeric)) AS "ganancia_linea"
           FROM (((("public"."pedidos" "p"
             JOIN "public"."pedido_items" "pi" ON (("pi"."pedido_id" = "p"."id")))
             JOIN "public"."precios_impresion" "pri" ON (("pri"."id" = "pi"."precio_impresion_id")))
             JOIN "public"."equipos" "e_1" ON (("e_1"."id" = "pri"."equipo_id")))
             LEFT JOIN "ins" ON (("ins"."pedido_item_id" = "pi"."id")))
          WHERE (("lower"(TRIM(BOTH FROM "p"."estado")) = ANY (ARRAY['entregado'::"text", 'pagado'::"text"])) AND (COALESCE("pi"."solo_anillado", false) = false) AND ("pri"."equipo_id" IS NOT NULL))
        )
 SELECT "e"."id" AS "equipo_id",
    "e"."nombre" AS "equipo_nombre",
    "e"."costo_adquisicion",
    COALESCE("sum"("l"."ganancia_linea"), (0)::numeric) AS "ganancia_acumulada",
        CASE
            WHEN ("e"."costo_adquisicion" > (0)::numeric) THEN "round"(((COALESCE("sum"("l"."ganancia_linea"), (0)::numeric) / "e"."costo_adquisicion") * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS "ratio_recuperacion_pct"
   FROM ("public"."equipos" "e"
     LEFT JOIN "lineas" "l" ON (("l"."equipo_id" = "e"."id")))
  GROUP BY "e"."id", "e"."nombre", "e"."costo_adquisicion";


ALTER VIEW "public"."v_equipo_resumen_roi" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_equipo_resumen_roi" IS 'Ganancia neta acumulada por equipo (pedidos entregado/pagado) vs costo de adquisición; requiere precios_impresion.equipo_id.';



CREATE OR REPLACE VIEW "public"."v_estadisticas_diarias" AS
 WITH "base" AS (
         SELECT "p"."id" AS "pedido_id",
            ("timezone"('America/Argentina/Buenos_Aires'::"text", "p"."created_at"))::"date" AS "dia",
            COALESCE("p"."total_pedido", "p"."total", (0)::numeric) AS "total_cabecera"
           FROM "public"."pedidos" "p"
          WHERE ("p"."estado" = ANY (ARRAY['pendiente'::"text", 'pagado'::"text", 'listo'::"text", 'entregado'::"text"]))
        ), "venta_items" AS (
         SELECT "pi"."pedido_id",
            "sum"(COALESCE("pi"."subtotal_item", (0)::numeric)) AS "venta_lineas"
           FROM ("public"."pedido_items" "pi"
             JOIN "base" "b" ON (("b"."pedido_id" = "pi"."pedido_id")))
          GROUP BY "pi"."pedido_id"
        ), "costos" AS (
         SELECT "pi"."pedido_id",
            "sum"(COALESCE("pii"."costo_total", (0)::numeric)) AS "costo_insumos"
           FROM (("public"."pedido_items" "pi"
             JOIN "public"."pedido_items_insumos" "pii" ON (("pii"."pedido_item_id" = "pi"."id")))
             JOIN "base" "b" ON (("b"."pedido_id" = "pi"."pedido_id")))
          GROUP BY "pi"."pedido_id"
        ), "por_pedido" AS (
         SELECT "b"."dia",
            "b"."pedido_id",
                CASE
                    WHEN (COALESCE("v"."venta_lineas", (0)::numeric) > (0)::numeric) THEN "v"."venta_lineas"
                    ELSE COALESCE("b"."total_cabecera", (0)::numeric)
                END AS "venta",
            COALESCE("c"."costo_insumos", (0)::numeric) AS "costo",
            COALESCE("p"."comision_monto", (0)::numeric) AS "comision",
            COALESCE("p"."forma_pago_total", "p"."forma_pago_sena") AS "forma_cobro"
           FROM ((("base" "b"
             LEFT JOIN "venta_items" "v" ON (("v"."pedido_id" = "b"."pedido_id")))
             LEFT JOIN "costos" "c" ON (("c"."pedido_id" = "b"."pedido_id")))
             JOIN "public"."pedidos" "p" ON (("p"."id" = "b"."pedido_id")))
        )
 SELECT "dia",
    "sum"("venta") AS "total_ingresos",
    "sum"(
        CASE
            WHEN ("forma_cobro" = 'transferencia'::"text") THEN "venta"
            ELSE (0)::numeric
        END) AS "ingresos_transferencia",
    "sum"(
        CASE
            WHEN ("forma_cobro" = 'efectivo'::"text") THEN "venta"
            ELSE (0)::numeric
        END) AS "ingresos_efectivo",
    "sum"(
        CASE
            WHEN ("forma_cobro" IS NULL) THEN "venta"
            ELSE (0)::numeric
        END) AS "ingresos_sin_forma",
    "sum"("costo") AS "total_insumos",
    "sum"("comision") AS "total_comisiones",
    (("sum"("venta") - "sum"("costo")) - "sum"("comision")) AS "ganancia_neta",
        CASE
            WHEN ("sum"("venta") > (0)::numeric) THEN "round"((((("sum"("venta") - "sum"("costo")) - "sum"("comision")) / NULLIF("sum"("venta"), (0)::numeric)) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS "pct_margen_real"
   FROM "por_pedido"
  GROUP BY "dia";


ALTER VIEW "public"."v_estadisticas_diarias" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_estadisticas_diarias" IS 'Por día (AR): ingresos totales y desglose transferencia/efectivo/sin dato; insumos BOM; comisiones.';



CREATE OR REPLACE VIEW "public"."v_insumos_alerta_stock" AS
 SELECT "id",
    "categoria",
    "nombre",
    "unidad",
    "medida_mm",
    "color",
    "tipo_papel",
    "rendimiento",
    "hojas_por_unidad",
    "precio_compra",
    "stock_actual",
    "stock_minimo",
    "activo",
    "created_at",
    "updated_at",
    "updated_by",
    "costo_base",
    "unidad_medida",
    "unidad_venta_equivalente"
   FROM "public"."insumos" "i"
  WHERE (("activo" = true) AND ("stock_actual" <= "stock_minimo"));


ALTER VIEW "public"."v_insumos_alerta_stock" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_insumos_alerta_stock" IS 'stock_actual <= stock_minimo (incluye cero o negativo si aplica).';



CREATE OR REPLACE VIEW "public"."v_rendimiento_vendedores" AS
 WITH "base" AS (
         SELECT "p"."id" AS "pedido_id",
            "p"."vendedor_id",
            COALESCE("p"."total_pedido", "p"."total", (0)::numeric) AS "total_cabecera"
           FROM "public"."pedidos" "p"
          WHERE (("p"."estado" = ANY (ARRAY['pendiente'::"text", 'pagado'::"text", 'listo'::"text", 'entregado'::"text"])) AND ("p"."vendedor_id" IS NOT NULL))
        ), "venta_items" AS (
         SELECT "pi"."pedido_id",
            "sum"(COALESCE("pi"."subtotal_item", (0)::numeric)) AS "venta_lineas"
           FROM ("public"."pedido_items" "pi"
             JOIN "base" "b" ON (("b"."pedido_id" = "pi"."pedido_id")))
          GROUP BY "pi"."pedido_id"
        ), "por_pedido" AS (
         SELECT "b"."pedido_id",
            "b"."vendedor_id",
                CASE
                    WHEN (COALESCE("v"."venta_lineas", (0)::numeric) > (0)::numeric) THEN "v"."venta_lineas"
                    ELSE COALESCE("b"."total_cabecera", (0)::numeric)
                END AS "venta",
            COALESCE("p"."comision_monto", (0)::numeric) AS "comision"
           FROM (("base" "b"
             LEFT JOIN "venta_items" "v" ON (("v"."pedido_id" = "b"."pedido_id")))
             JOIN "public"."pedidos" "p" ON (("p"."id" = "b"."pedido_id")))
        ), "agg" AS (
         SELECT "por_pedido"."vendedor_id",
            "count"(DISTINCT "por_pedido"."pedido_id") AS "pedidos",
            "sum"("por_pedido"."venta") AS "total_facturado",
            "sum"("por_pedido"."comision") AS "comision_acumulada"
           FROM "por_pedido"
          GROUP BY "por_pedido"."vendedor_id"
        )
 SELECT "a"."vendedor_id",
    COALESCE(NULLIF(TRIM(BOTH FROM "pr"."full_name"), ''::"text"), ("pr"."id")::"text") AS "nombre",
    "a"."pedidos",
    "a"."total_facturado",
    "a"."comision_acumulada"
   FROM ("agg" "a"
     JOIN "public"."profiles" "pr" ON (("pr"."id" = "a"."vendedor_id")))
  ORDER BY "a"."total_facturado" DESC NULLS LAST;


ALTER VIEW "public"."v_rendimiento_vendedores" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_rendimiento_vendedores" IS 'Por vendedor: pedidos pendiente/pagado/listo/entregado, total y comisión.';



CREATE OR REPLACE VIEW "public"."v_rentabilidad_lista_precios" AS
 WITH "lp_base" AS (
         SELECT "lp"."id",
            "lp"."familia",
            "lp"."codigo",
            "lp"."descripcion",
            "lp"."precio_final",
            "lp"."activo",
                CASE
                    WHEN ("lp"."familia" = 'impresion'::"text") THEN COALESCE("public"."fn_costo_directo_unidad_tarifa_impresion"("lp"."id"), "lp"."costo_insumo_directo")
                    ELSE "lp"."costo_insumo_directo"
                END AS "costo_insumo_directo"
           FROM "public"."lista_precios_publica" "lp"
        )
 SELECT "b"."id",
    "b"."familia",
    "b"."codigo",
    "b"."descripcion",
    "b"."precio_final",
    "b"."activo",
    "b"."costo_insumo_directo",
    "public"."fn_costo_total_real_insumos"(COALESCE("b"."costo_insumo_directo", (0)::numeric)) AS "costo_real",
        CASE
            WHEN ("b"."costo_insumo_directo" IS NULL) THEN NULL::numeric
            WHEN ("b"."precio_final" > (0)::numeric) THEN "round"(((("b"."precio_final" - "public"."fn_costo_total_real_insumos"(COALESCE("b"."costo_insumo_directo", (0)::numeric))) / "b"."precio_final") * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS "margen_pct",
    "cn"."margen_objetivo_pct",
        CASE
            WHEN ("b"."costo_insumo_directo" IS NULL) THEN 'sin_datos'::"text"
            WHEN ("b"."precio_final" <= (0)::numeric) THEN 'error'::"text"
            WHEN (("b"."precio_final" > (0)::numeric) AND (((("b"."precio_final" - "public"."fn_costo_total_real_insumos"(COALESCE("b"."costo_insumo_directo", (0)::numeric))) / NULLIF("b"."precio_final", (0)::numeric)) * (100)::numeric) >= "cn"."margen_objetivo_pct")) THEN 'verde'::"text"
            WHEN (("b"."precio_final" > (0)::numeric) AND (((("b"."precio_final" - "public"."fn_costo_total_real_insumos"(COALESCE("b"."costo_insumo_directo", (0)::numeric))) / NULLIF("b"."precio_final", (0)::numeric)) * (100)::numeric) >= ("cn"."margen_objetivo_pct" * 0.5))) THEN 'amarillo'::"text"
            ELSE 'rojo'::"text"
        END AS "semaforo"
   FROM ("lp_base" "b"
     CROSS JOIN "public"."configuracion_negocio" "cn")
  WHERE ("cn"."id" = 1);


ALTER VIEW "public"."v_rentabilidad_lista_precios" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_rentabilidad_lista_precios" IS 'Margen % y semáforo; impresión usa fn_costo_directo_unidad_tarifa_impresion (BOM) si hay receta activa.';



ALTER TABLE ONLY "public"."_printmanager_migrations"
    ADD CONSTRAINT "_printmanager_migrations_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."config_costos"
    ADD CONSTRAINT "config_costos_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."config"
    ADD CONSTRAINT "config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracion_negocio"
    ADD CONSTRAINT "configuracion_negocio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipos"
    ADD CONSTRAINT "equipos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gastos_fijos"
    ADD CONSTRAINT "gastos_fijos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insumos"
    ADD CONSTRAINT "insumos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insumos_precios_log"
    ADD CONSTRAINT "insumos_precios_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensajes_whatsapp_log"
    ADD CONSTRAINT "mensajes_whatsapp_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedido_items_insumos"
    ADD CONSTRAINT "pedido_items_insumos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plantillas_whatsapp"
    ADD CONSTRAINT "plantillas_whatsapp_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precios_anillado"
    ADD CONSTRAINT "precios_anillado_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precios_impresion"
    ADD CONSTRAINT "precios_impresion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precios_impresion"
    ADD CONSTRAINT "precios_impresion_tipo_doble_faz_key" UNIQUE ("tipo", "doble_faz");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recetas_items"
    ADD CONSTRAINT "recetas_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reglas_costo"
    ADD CONSTRAINT "reglas_costo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."toner_modelos"
    ADD CONSTRAINT "toner_modelos_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."toner_modelos"
    ADD CONSTRAINT "toner_modelos_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_gastos_fijos_activo" ON "public"."gastos_fijos" USING "btree" ("activo");



CREATE INDEX "idx_insumos_activo" ON "public"."insumos" USING "btree" ("activo");



CREATE INDEX "idx_insumos_categoria" ON "public"."insumos" USING "btree" ("categoria");



CREATE INDEX "idx_mensajes_whatsapp_log_enviado_at" ON "public"."mensajes_whatsapp_log" USING "btree" ("enviado_at" DESC);



CREATE INDEX "idx_mensajes_whatsapp_log_pedido" ON "public"."mensajes_whatsapp_log" USING "btree" ("pedido_id");



CREATE INDEX "idx_pedido_items_nom_arch_busq" ON "public"."pedido_items" USING "btree" ("nombre_archivo_busqueda");



CREATE INDEX "idx_pedido_items_pedido_id" ON "public"."pedido_items" USING "btree" ("pedido_id");



CREATE INDEX "idx_pedidos_cliente_busqueda" ON "public"."pedidos" USING "btree" ("cliente_busqueda");



CREATE INDEX "idx_pedidos_facturacion_arca" ON "public"."pedidos" USING "btree" ("facturado", "estado") WHERE (("facturado" = false) AND ("lower"(TRIM(BOTH FROM "estado")) = 'entregado'::"text"));



CREATE UNIQUE INDEX "idx_pedidos_numero_publico" ON "public"."pedidos" USING "btree" ("numero_publico") WHERE ("numero_publico" IS NOT NULL);



CREATE INDEX "idx_pedidos_obs_busqueda" ON "public"."pedidos" USING "btree" ("observaciones_busqueda");



CREATE INDEX "idx_pedidos_vendedor_id" ON "public"."pedidos" USING "btree" ("vendedor_id");



CREATE INDEX "idx_precios_anillado_nombre_categoria" ON "public"."precios_anillado" USING "btree" ("nombre_categoria");



CREATE INDEX "idx_precios_impresion_equipo_id" ON "public"."precios_impresion" USING "btree" ("equipo_id") WHERE ("equipo_id" IS NOT NULL);



CREATE INDEX "idx_recetas_alcance" ON "public"."recetas_items" USING "btree" ("alcance");



CREATE INDEX "idx_recetas_precio_imp" ON "public"."recetas_items" USING "btree" ("precio_impresion_id") WHERE ("alcance" = 'IMPRESION'::"text");



CREATE INDEX "idx_reglas_costo_anillado" ON "public"."reglas_costo" USING "btree" ("precio_anillado_id") WHERE ("precio_anillado_id" IS NOT NULL);



CREATE INDEX "idx_reglas_costo_insumo" ON "public"."reglas_costo" USING "btree" ("insumo_id") WHERE ("insumo_id" IS NOT NULL);



CREATE INDEX "idx_reglas_costo_precio" ON "public"."reglas_costo" USING "btree" ("precio_impresion_id");



CREATE INDEX "idx_toner_modelos_activo_orden" ON "public"."toner_modelos" USING "btree" ("activo", "orden", "nombre");



CREATE OR REPLACE TRIGGER "on_profile_role_changed" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_profile_role_change"();



CREATE OR REPLACE TRIGGER "set_updated_at_config_costos" BEFORE UPDATE ON "public"."config_costos" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_precios_anillado" BEFORE UPDATE ON "public"."precios_anillado" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_precios_impresion" BEFORE UPDATE ON "public"."precios_impresion" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_configuracion_negocio_updated" BEFORE UPDATE ON "public"."configuracion_negocio" FOR EACH ROW EXECUTE FUNCTION "public"."set_configuracion_negocio_updated_at"();



CREATE OR REPLACE TRIGGER "trg_insumo_precio_log" AFTER UPDATE ON "public"."insumos" FOR EACH ROW EXECUTE FUNCTION "public"."log_insumo_precio_change"();



CREATE OR REPLACE TRIGGER "trg_insumos_refresh_tarifas_costo" AFTER UPDATE ON "public"."insumos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_insumos_refresh_tarifas_costo"();



CREATE OR REPLACE TRIGGER "trg_insumos_updated_at" BEFORE UPDATE ON "public"."insumos" FOR EACH ROW EXECUTE FUNCTION "public"."update_insumos_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pedidos_comision" BEFORE INSERT OR UPDATE OF "total", "total_pedido", "vendedor_id" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pedidos_calcular_comision"();



CREATE OR REPLACE TRIGGER "trg_pedidos_numero_publico" BEFORE INSERT ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pedidos_asignar_numero_publico"();



CREATE OR REPLACE TRIGGER "trg_pedidos_stock_estado" AFTER UPDATE OF "estado" ON "public"."pedidos" FOR EACH ROW WHEN (("old"."estado" IS DISTINCT FROM "new"."estado")) EXECUTE FUNCTION "public"."trg_pedidos_stock_preventivo"();



CREATE OR REPLACE TRIGGER "trg_pedidos_validar_bom" BEFORE UPDATE OF "estado" ON "public"."pedidos" FOR EACH ROW WHEN (("old"."estado" IS DISTINCT FROM "new"."estado")) EXECUTE FUNCTION "public"."trg_pedidos_validar_bom_antes_senado"();



CREATE OR REPLACE TRIGGER "trg_pedidos_vencimiento" BEFORE INSERT OR UPDATE ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_pedidos_set_vencimiento_presupuesto"();



CREATE OR REPLACE TRIGGER "trg_reglas_refresh_tarifa" AFTER INSERT OR DELETE OR UPDATE ON "public"."reglas_costo" FOR EACH ROW EXECUTE FUNCTION "public"."trg_reglas_refresh_tarifa"();



CREATE OR REPLACE TRIGGER "trigger_equipos_updated_at" BEFORE UPDATE ON "public"."equipos" FOR EACH ROW EXECUTE FUNCTION "public"."update_equipos_updated_at"();



ALTER TABLE ONLY "public"."config_costos"
    ADD CONSTRAINT "config_costos_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."configuracion_negocio"
    ADD CONSTRAINT "configuracion_negocio_insumo_tapa_dorsal_id_fkey" FOREIGN KEY ("insumo_tapa_dorsal_id") REFERENCES "public"."insumos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."configuracion_negocio"
    ADD CONSTRAINT "configuracion_negocio_insumo_tapa_frontal_id_fkey" FOREIGN KEY ("insumo_tapa_frontal_id") REFERENCES "public"."insumos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."configuracion_negocio"
    ADD CONSTRAINT "configuracion_negocio_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."insumos_precios_log"
    ADD CONSTRAINT "insumos_precios_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."insumos_precios_log"
    ADD CONSTRAINT "insumos_precios_log_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."insumos"
    ADD CONSTRAINT "insumos_toner_modelo_id_fkey" FOREIGN KEY ("toner_modelo_id") REFERENCES "public"."toner_modelos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."insumos"
    ADD CONSTRAINT "insumos_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mensajes_whatsapp_log"
    ADD CONSTRAINT "mensajes_whatsapp_log_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mensajes_whatsapp_log"
    ADD CONSTRAINT "mensajes_whatsapp_log_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensajes_whatsapp_log"
    ADD CONSTRAINT "mensajes_whatsapp_log_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas_whatsapp"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedido_items_insumos"
    ADD CONSTRAINT "pedido_items_insumos_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id");



ALTER TABLE ONLY "public"."pedido_items_insumos"
    ADD CONSTRAINT "pedido_items_insumos_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedido_items_insumos"
    ADD CONSTRAINT "pedido_items_insumos_pedido_item_id_fkey" FOREIGN KEY ("pedido_item_id") REFERENCES "public"."pedido_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_precio_anillado_id_fkey" FOREIGN KEY ("precio_anillado_id") REFERENCES "public"."precios_anillado"("id");



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_precio_impresion_id_fkey" FOREIGN KEY ("precio_impresion_id") REFERENCES "public"."precios_impresion"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plantillas_whatsapp"
    ADD CONSTRAINT "plantillas_whatsapp_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."precios_anillado"
    ADD CONSTRAINT "precios_anillado_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."precios_impresion"
    ADD CONSTRAINT "precios_impresion_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."precios_impresion"
    ADD CONSTRAINT "precios_impresion_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recetas_items"
    ADD CONSTRAINT "recetas_items_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recetas_items"
    ADD CONSTRAINT "recetas_items_precio_impresion_id_fkey" FOREIGN KEY ("precio_impresion_id") REFERENCES "public"."precios_impresion"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reglas_costo"
    ADD CONSTRAINT "reglas_costo_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reglas_costo"
    ADD CONSTRAINT "reglas_costo_precio_anillado_id_fkey" FOREIGN KEY ("precio_anillado_id") REFERENCES "public"."precios_anillado"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reglas_costo"
    ADD CONSTRAINT "reglas_costo_precio_impresion_id_fkey" FOREIGN KEY ("precio_impresion_id") REFERENCES "public"."precios_impresion"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_referencia_pedido_id_fkey" FOREIGN KEY ("referencia_pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE SET NULL;



CREATE POLICY "Autenticados acceden a config" ON "public"."config" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Autenticados acceden a items" ON "public"."pedido_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Autenticados acceden a pedidos" ON "public"."pedidos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Autenticados acceden a profiles" ON "public"."profiles" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "all_plantillas_whatsapp" ON "public"."plantillas_whatsapp" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."app_role", 'operador'::"public"."app_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."app_role", 'operador'::"public"."app_role"]))))));



ALTER TABLE "public"."config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config_costos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "config_costos_all" ON "public"."config_costos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."app_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "config_costos_select" ON "public"."config_costos" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."configuracion_negocio" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "configuracion_negocio_all" ON "public"."configuracion_negocio" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."equipos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipos_delete_auth" ON "public"."equipos" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "equipos_insert_auth" ON "public"."equipos" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "equipos_select_auth" ON "public"."equipos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "equipos_update_auth" ON "public"."equipos" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."gastos_fijos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gastos_fijos_delete_admin" ON "public"."gastos_fijos" FOR DELETE TO "authenticated" USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "gastos_fijos_insert_admin" ON "public"."gastos_fijos" FOR INSERT TO "authenticated" WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "gastos_fijos_select_auth" ON "public"."gastos_fijos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "gastos_fijos_update_admin" ON "public"."gastos_fijos" FOR UPDATE TO "authenticated" USING (("public"."current_user_role"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "insert_mensajes_whatsapp_log" ON "public"."mensajes_whatsapp_log" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."insumos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insumos_all_authenticated" ON "public"."insumos" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."insumos_precios_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insumos_precios_log_all_authenticated" ON "public"."insumos_precios_log" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."mensajes_whatsapp_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedido_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedido_items_insumos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pedido_items_insumos_insert" ON "public"."pedido_items_insumos" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "pedido_items_insumos_select" ON "public"."pedido_items_insumos" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."pedidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plantillas_whatsapp" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."precios_anillado" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precios_anillado_all" ON "public"."precios_anillado" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."app_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "precios_anillado_select" ON "public"."precios_anillado" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."precios_impresion" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precios_impresion_all" ON "public"."precios_impresion" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."app_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "precios_impresion_select" ON "public"."precios_impresion" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recetas_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recetas_items_all" ON "public"."recetas_items" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."reglas_costo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reglas_costo_all" ON "public"."reglas_costo" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "select_mensajes_whatsapp_log" ON "public"."mensajes_whatsapp_log" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_plantillas_whatsapp" ON "public"."plantillas_whatsapp" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."stock_movimientos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_movimientos_all_authenticated" ON "public"."stock_movimientos" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."toner_modelos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "toner_modelos_delete_admin" ON "public"."toner_modelos" FOR DELETE TO "authenticated" USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "toner_modelos_insert_admin" ON "public"."toner_modelos" FOR INSERT TO "authenticated" WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "toner_modelos_select_auth" ON "public"."toner_modelos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "toner_modelos_update_admin" ON "public"."toner_modelos" FOR UPDATE TO "authenticated" USING (("public"."current_user_role"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT ALL ON SCHEMA "public" TO "anon";
GRANT ALL ON SCHEMA "public" TO "authenticated";
GRANT ALL ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."descontar_stock_pedido"("pedido_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."display_name_from_auth_meta"("meta" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_aplicar_stock_preventivo"("p_pedido_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_costo_directo_unidad_tarifa_anillado"("p_precio_anillado_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_costo_directo_unidad_tarifa_impresion"("p_precio_impresion_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_costo_por_unidad_venta"("p_insumo_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_costo_por_unit_venta"("p_insumo_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_costo_total_real_insumos"("costo_insumos" numeric) TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_costo_unitario_insumo"("p_insumo_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_dashboard_pedidos_pendientes"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_dashboard_ranking_vendedores"("p_desde" "date", "p_hasta" "date") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_dashboard_top_productos_margen"("p_desde" "date", "p_hasta" "date", "p_limit" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_hojas_fisicas"("paginas" integer, "doble_faz" boolean) TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_normalizar_cantidad_stock_pii"("p_insumo_id" "uuid", "p_qty" numeric, "p_cuo" numeric) TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_pedido_tiene_bom_completo"("p_pedido_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_refresh_precios_costo_por_insumo"("p_insumo_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_refresh_recetas_costo_reposicion"("p_insumo_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_resolver_insumo_espiral_por_hojas"("p_hojas" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_resolver_insumo_espiral_por_mm_rango"("p_mm" integer, "p_rango" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_restaurar_stock_pedido"("p_pedido_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."handle_auth_user_updated"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."handle_profile_role_change"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."log_insumo_precio_change"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."restaurar_stock_pedido"("pedido_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."rpc_convertir_presupuesto_a_pedido"("p_pedido_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."rpc_delete_insumo_fisico"("p_insumo_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."rpc_explotar_bom_pedido"("p_pedido_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_configuracion_negocio_updated_at"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."sync_role_to_jwt"("user_id" "uuid", "new_role" "public"."app_role") TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_insumos_propaga_costo_recetas"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_insumos_refresh_tarifas_costo"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_pedidos_asignar_numero_publico"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_pedidos_calcular_comision"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_pedidos_set_vencimiento_presupuesto"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_pedidos_stock_preventivo"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_pedidos_validar_bom_antes_senado"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_recetas_set_costo_reposicion"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trg_reglas_refresh_tarifa"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."trigger_set_updated_at"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_equipos_updated_at"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_insumos_updated_at"() TO "authenticated";


















GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."_printmanager_migrations" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."config" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."config_costos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."configuracion_negocio" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."equipos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."gastos_fijos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."insumos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."insumos_precios_log" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."precios_anillado" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."precios_impresion" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."lista_precios_publica" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."mensajes_whatsapp_log" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."pedido_items" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."pedido_items_insumos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."pedidos" TO "authenticated";



GRANT SELECT,USAGE ON SEQUENCE "public"."pedidos_numero_publico_seq" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."plantillas_whatsapp" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."recetas_items" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."reglas_costo" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."stock_movimientos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."toner_modelos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."v_equipo_resumen_roi" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."v_estadisticas_diarias" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."v_insumos_alerta_stock" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."v_rendimiento_vendedores" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."v_rentabilidad_lista_precios" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,USAGE ON SEQUENCES TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "authenticated";




























drop extension if exists "pg_net";

revoke delete on table "public"."_printmanager_migrations" from "anon";

revoke insert on table "public"."_printmanager_migrations" from "anon";

revoke references on table "public"."_printmanager_migrations" from "anon";

revoke select on table "public"."_printmanager_migrations" from "anon";

revoke trigger on table "public"."_printmanager_migrations" from "anon";

revoke truncate on table "public"."_printmanager_migrations" from "anon";

revoke update on table "public"."_printmanager_migrations" from "anon";

revoke references on table "public"."_printmanager_migrations" from "authenticated";

revoke trigger on table "public"."_printmanager_migrations" from "authenticated";

revoke truncate on table "public"."_printmanager_migrations" from "authenticated";

revoke delete on table "public"."_printmanager_migrations" from "service_role";

revoke insert on table "public"."_printmanager_migrations" from "service_role";

revoke references on table "public"."_printmanager_migrations" from "service_role";

revoke select on table "public"."_printmanager_migrations" from "service_role";

revoke trigger on table "public"."_printmanager_migrations" from "service_role";

revoke truncate on table "public"."_printmanager_migrations" from "service_role";

revoke update on table "public"."_printmanager_migrations" from "service_role";

revoke delete on table "public"."config" from "anon";

revoke insert on table "public"."config" from "anon";

revoke references on table "public"."config" from "anon";

revoke select on table "public"."config" from "anon";

revoke trigger on table "public"."config" from "anon";

revoke truncate on table "public"."config" from "anon";

revoke update on table "public"."config" from "anon";

revoke references on table "public"."config" from "authenticated";

revoke trigger on table "public"."config" from "authenticated";

revoke truncate on table "public"."config" from "authenticated";

revoke delete on table "public"."config" from "service_role";

revoke insert on table "public"."config" from "service_role";

revoke references on table "public"."config" from "service_role";

revoke select on table "public"."config" from "service_role";

revoke trigger on table "public"."config" from "service_role";

revoke truncate on table "public"."config" from "service_role";

revoke update on table "public"."config" from "service_role";

revoke delete on table "public"."config_costos" from "anon";

revoke insert on table "public"."config_costos" from "anon";

revoke references on table "public"."config_costos" from "anon";

revoke select on table "public"."config_costos" from "anon";

revoke trigger on table "public"."config_costos" from "anon";

revoke truncate on table "public"."config_costos" from "anon";

revoke update on table "public"."config_costos" from "anon";

revoke references on table "public"."config_costos" from "authenticated";

revoke trigger on table "public"."config_costos" from "authenticated";

revoke truncate on table "public"."config_costos" from "authenticated";

revoke delete on table "public"."config_costos" from "service_role";

revoke insert on table "public"."config_costos" from "service_role";

revoke references on table "public"."config_costos" from "service_role";

revoke select on table "public"."config_costos" from "service_role";

revoke trigger on table "public"."config_costos" from "service_role";

revoke truncate on table "public"."config_costos" from "service_role";

revoke update on table "public"."config_costos" from "service_role";

revoke delete on table "public"."configuracion_negocio" from "anon";

revoke insert on table "public"."configuracion_negocio" from "anon";

revoke references on table "public"."configuracion_negocio" from "anon";

revoke select on table "public"."configuracion_negocio" from "anon";

revoke trigger on table "public"."configuracion_negocio" from "anon";

revoke truncate on table "public"."configuracion_negocio" from "anon";

revoke update on table "public"."configuracion_negocio" from "anon";

revoke references on table "public"."configuracion_negocio" from "authenticated";

revoke trigger on table "public"."configuracion_negocio" from "authenticated";

revoke truncate on table "public"."configuracion_negocio" from "authenticated";

revoke delete on table "public"."configuracion_negocio" from "service_role";

revoke insert on table "public"."configuracion_negocio" from "service_role";

revoke references on table "public"."configuracion_negocio" from "service_role";

revoke select on table "public"."configuracion_negocio" from "service_role";

revoke trigger on table "public"."configuracion_negocio" from "service_role";

revoke truncate on table "public"."configuracion_negocio" from "service_role";

revoke update on table "public"."configuracion_negocio" from "service_role";

revoke delete on table "public"."equipos" from "anon";

revoke insert on table "public"."equipos" from "anon";

revoke references on table "public"."equipos" from "anon";

revoke select on table "public"."equipos" from "anon";

revoke trigger on table "public"."equipos" from "anon";

revoke truncate on table "public"."equipos" from "anon";

revoke update on table "public"."equipos" from "anon";

revoke references on table "public"."equipos" from "authenticated";

revoke trigger on table "public"."equipos" from "authenticated";

revoke truncate on table "public"."equipos" from "authenticated";

revoke delete on table "public"."equipos" from "service_role";

revoke insert on table "public"."equipos" from "service_role";

revoke references on table "public"."equipos" from "service_role";

revoke select on table "public"."equipos" from "service_role";

revoke trigger on table "public"."equipos" from "service_role";

revoke truncate on table "public"."equipos" from "service_role";

revoke update on table "public"."equipos" from "service_role";

revoke delete on table "public"."gastos_fijos" from "anon";

revoke insert on table "public"."gastos_fijos" from "anon";

revoke references on table "public"."gastos_fijos" from "anon";

revoke select on table "public"."gastos_fijos" from "anon";

revoke trigger on table "public"."gastos_fijos" from "anon";

revoke truncate on table "public"."gastos_fijos" from "anon";

revoke update on table "public"."gastos_fijos" from "anon";

revoke references on table "public"."gastos_fijos" from "authenticated";

revoke trigger on table "public"."gastos_fijos" from "authenticated";

revoke truncate on table "public"."gastos_fijos" from "authenticated";

revoke delete on table "public"."gastos_fijos" from "service_role";

revoke insert on table "public"."gastos_fijos" from "service_role";

revoke references on table "public"."gastos_fijos" from "service_role";

revoke select on table "public"."gastos_fijos" from "service_role";

revoke trigger on table "public"."gastos_fijos" from "service_role";

revoke truncate on table "public"."gastos_fijos" from "service_role";

revoke update on table "public"."gastos_fijos" from "service_role";

revoke delete on table "public"."insumos" from "anon";

revoke insert on table "public"."insumos" from "anon";

revoke references on table "public"."insumos" from "anon";

revoke select on table "public"."insumos" from "anon";

revoke trigger on table "public"."insumos" from "anon";

revoke truncate on table "public"."insumos" from "anon";

revoke update on table "public"."insumos" from "anon";

revoke references on table "public"."insumos" from "authenticated";

revoke trigger on table "public"."insumos" from "authenticated";

revoke truncate on table "public"."insumos" from "authenticated";

revoke delete on table "public"."insumos" from "service_role";

revoke insert on table "public"."insumos" from "service_role";

revoke references on table "public"."insumos" from "service_role";

revoke select on table "public"."insumos" from "service_role";

revoke trigger on table "public"."insumos" from "service_role";

revoke truncate on table "public"."insumos" from "service_role";

revoke update on table "public"."insumos" from "service_role";

revoke delete on table "public"."insumos_precios_log" from "anon";

revoke insert on table "public"."insumos_precios_log" from "anon";

revoke references on table "public"."insumos_precios_log" from "anon";

revoke select on table "public"."insumos_precios_log" from "anon";

revoke trigger on table "public"."insumos_precios_log" from "anon";

revoke truncate on table "public"."insumos_precios_log" from "anon";

revoke update on table "public"."insumos_precios_log" from "anon";

revoke references on table "public"."insumos_precios_log" from "authenticated";

revoke trigger on table "public"."insumos_precios_log" from "authenticated";

revoke truncate on table "public"."insumos_precios_log" from "authenticated";

revoke delete on table "public"."insumos_precios_log" from "service_role";

revoke insert on table "public"."insumos_precios_log" from "service_role";

revoke references on table "public"."insumos_precios_log" from "service_role";

revoke select on table "public"."insumos_precios_log" from "service_role";

revoke trigger on table "public"."insumos_precios_log" from "service_role";

revoke truncate on table "public"."insumos_precios_log" from "service_role";

revoke update on table "public"."insumos_precios_log" from "service_role";

revoke delete on table "public"."mensajes_whatsapp_log" from "anon";

revoke insert on table "public"."mensajes_whatsapp_log" from "anon";

revoke references on table "public"."mensajes_whatsapp_log" from "anon";

revoke select on table "public"."mensajes_whatsapp_log" from "anon";

revoke trigger on table "public"."mensajes_whatsapp_log" from "anon";

revoke truncate on table "public"."mensajes_whatsapp_log" from "anon";

revoke update on table "public"."mensajes_whatsapp_log" from "anon";

revoke references on table "public"."mensajes_whatsapp_log" from "authenticated";

revoke trigger on table "public"."mensajes_whatsapp_log" from "authenticated";

revoke truncate on table "public"."mensajes_whatsapp_log" from "authenticated";

revoke delete on table "public"."mensajes_whatsapp_log" from "service_role";

revoke insert on table "public"."mensajes_whatsapp_log" from "service_role";

revoke references on table "public"."mensajes_whatsapp_log" from "service_role";

revoke select on table "public"."mensajes_whatsapp_log" from "service_role";

revoke trigger on table "public"."mensajes_whatsapp_log" from "service_role";

revoke truncate on table "public"."mensajes_whatsapp_log" from "service_role";

revoke update on table "public"."mensajes_whatsapp_log" from "service_role";

revoke delete on table "public"."pedido_items" from "anon";

revoke insert on table "public"."pedido_items" from "anon";

revoke references on table "public"."pedido_items" from "anon";

revoke select on table "public"."pedido_items" from "anon";

revoke trigger on table "public"."pedido_items" from "anon";

revoke truncate on table "public"."pedido_items" from "anon";

revoke update on table "public"."pedido_items" from "anon";

revoke references on table "public"."pedido_items" from "authenticated";

revoke trigger on table "public"."pedido_items" from "authenticated";

revoke truncate on table "public"."pedido_items" from "authenticated";

revoke delete on table "public"."pedido_items" from "service_role";

revoke insert on table "public"."pedido_items" from "service_role";

revoke references on table "public"."pedido_items" from "service_role";

revoke select on table "public"."pedido_items" from "service_role";

revoke trigger on table "public"."pedido_items" from "service_role";

revoke truncate on table "public"."pedido_items" from "service_role";

revoke update on table "public"."pedido_items" from "service_role";

revoke delete on table "public"."pedido_items_insumos" from "anon";

revoke insert on table "public"."pedido_items_insumos" from "anon";

revoke references on table "public"."pedido_items_insumos" from "anon";

revoke select on table "public"."pedido_items_insumos" from "anon";

revoke trigger on table "public"."pedido_items_insumos" from "anon";

revoke truncate on table "public"."pedido_items_insumos" from "anon";

revoke update on table "public"."pedido_items_insumos" from "anon";

revoke references on table "public"."pedido_items_insumos" from "authenticated";

revoke trigger on table "public"."pedido_items_insumos" from "authenticated";

revoke truncate on table "public"."pedido_items_insumos" from "authenticated";

revoke delete on table "public"."pedido_items_insumos" from "service_role";

revoke insert on table "public"."pedido_items_insumos" from "service_role";

revoke references on table "public"."pedido_items_insumos" from "service_role";

revoke select on table "public"."pedido_items_insumos" from "service_role";

revoke trigger on table "public"."pedido_items_insumos" from "service_role";

revoke truncate on table "public"."pedido_items_insumos" from "service_role";

revoke update on table "public"."pedido_items_insumos" from "service_role";

revoke delete on table "public"."pedidos" from "anon";

revoke insert on table "public"."pedidos" from "anon";

revoke references on table "public"."pedidos" from "anon";

revoke select on table "public"."pedidos" from "anon";

revoke trigger on table "public"."pedidos" from "anon";

revoke truncate on table "public"."pedidos" from "anon";

revoke update on table "public"."pedidos" from "anon";

revoke references on table "public"."pedidos" from "authenticated";

revoke trigger on table "public"."pedidos" from "authenticated";

revoke truncate on table "public"."pedidos" from "authenticated";

revoke delete on table "public"."pedidos" from "service_role";

revoke insert on table "public"."pedidos" from "service_role";

revoke references on table "public"."pedidos" from "service_role";

revoke select on table "public"."pedidos" from "service_role";

revoke trigger on table "public"."pedidos" from "service_role";

revoke truncate on table "public"."pedidos" from "service_role";

revoke update on table "public"."pedidos" from "service_role";

revoke delete on table "public"."plantillas_whatsapp" from "anon";

revoke insert on table "public"."plantillas_whatsapp" from "anon";

revoke references on table "public"."plantillas_whatsapp" from "anon";

revoke select on table "public"."plantillas_whatsapp" from "anon";

revoke trigger on table "public"."plantillas_whatsapp" from "anon";

revoke truncate on table "public"."plantillas_whatsapp" from "anon";

revoke update on table "public"."plantillas_whatsapp" from "anon";

revoke references on table "public"."plantillas_whatsapp" from "authenticated";

revoke trigger on table "public"."plantillas_whatsapp" from "authenticated";

revoke truncate on table "public"."plantillas_whatsapp" from "authenticated";

revoke delete on table "public"."plantillas_whatsapp" from "service_role";

revoke insert on table "public"."plantillas_whatsapp" from "service_role";

revoke references on table "public"."plantillas_whatsapp" from "service_role";

revoke select on table "public"."plantillas_whatsapp" from "service_role";

revoke trigger on table "public"."plantillas_whatsapp" from "service_role";

revoke truncate on table "public"."plantillas_whatsapp" from "service_role";

revoke update on table "public"."plantillas_whatsapp" from "service_role";

revoke delete on table "public"."precios_anillado" from "anon";

revoke insert on table "public"."precios_anillado" from "anon";

revoke references on table "public"."precios_anillado" from "anon";

revoke select on table "public"."precios_anillado" from "anon";

revoke trigger on table "public"."precios_anillado" from "anon";

revoke truncate on table "public"."precios_anillado" from "anon";

revoke update on table "public"."precios_anillado" from "anon";

revoke references on table "public"."precios_anillado" from "authenticated";

revoke trigger on table "public"."precios_anillado" from "authenticated";

revoke truncate on table "public"."precios_anillado" from "authenticated";

revoke delete on table "public"."precios_anillado" from "service_role";

revoke insert on table "public"."precios_anillado" from "service_role";

revoke references on table "public"."precios_anillado" from "service_role";

revoke select on table "public"."precios_anillado" from "service_role";

revoke trigger on table "public"."precios_anillado" from "service_role";

revoke truncate on table "public"."precios_anillado" from "service_role";

revoke update on table "public"."precios_anillado" from "service_role";

revoke delete on table "public"."precios_impresion" from "anon";

revoke insert on table "public"."precios_impresion" from "anon";

revoke references on table "public"."precios_impresion" from "anon";

revoke select on table "public"."precios_impresion" from "anon";

revoke trigger on table "public"."precios_impresion" from "anon";

revoke truncate on table "public"."precios_impresion" from "anon";

revoke update on table "public"."precios_impresion" from "anon";

revoke references on table "public"."precios_impresion" from "authenticated";

revoke trigger on table "public"."precios_impresion" from "authenticated";

revoke truncate on table "public"."precios_impresion" from "authenticated";

revoke delete on table "public"."precios_impresion" from "service_role";

revoke insert on table "public"."precios_impresion" from "service_role";

revoke references on table "public"."precios_impresion" from "service_role";

revoke select on table "public"."precios_impresion" from "service_role";

revoke trigger on table "public"."precios_impresion" from "service_role";

revoke truncate on table "public"."precios_impresion" from "service_role";

revoke update on table "public"."precios_impresion" from "service_role";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke delete on table "public"."profiles" from "service_role";

revoke insert on table "public"."profiles" from "service_role";

revoke references on table "public"."profiles" from "service_role";

revoke select on table "public"."profiles" from "service_role";

revoke trigger on table "public"."profiles" from "service_role";

revoke truncate on table "public"."profiles" from "service_role";

revoke update on table "public"."profiles" from "service_role";

revoke delete on table "public"."recetas_items" from "anon";

revoke insert on table "public"."recetas_items" from "anon";

revoke references on table "public"."recetas_items" from "anon";

revoke select on table "public"."recetas_items" from "anon";

revoke trigger on table "public"."recetas_items" from "anon";

revoke truncate on table "public"."recetas_items" from "anon";

revoke update on table "public"."recetas_items" from "anon";

revoke references on table "public"."recetas_items" from "authenticated";

revoke trigger on table "public"."recetas_items" from "authenticated";

revoke truncate on table "public"."recetas_items" from "authenticated";

revoke delete on table "public"."recetas_items" from "service_role";

revoke insert on table "public"."recetas_items" from "service_role";

revoke references on table "public"."recetas_items" from "service_role";

revoke select on table "public"."recetas_items" from "service_role";

revoke trigger on table "public"."recetas_items" from "service_role";

revoke truncate on table "public"."recetas_items" from "service_role";

revoke update on table "public"."recetas_items" from "service_role";

revoke delete on table "public"."reglas_costo" from "anon";

revoke insert on table "public"."reglas_costo" from "anon";

revoke references on table "public"."reglas_costo" from "anon";

revoke select on table "public"."reglas_costo" from "anon";

revoke trigger on table "public"."reglas_costo" from "anon";

revoke truncate on table "public"."reglas_costo" from "anon";

revoke update on table "public"."reglas_costo" from "anon";

revoke references on table "public"."reglas_costo" from "authenticated";

revoke trigger on table "public"."reglas_costo" from "authenticated";

revoke truncate on table "public"."reglas_costo" from "authenticated";

revoke delete on table "public"."reglas_costo" from "service_role";

revoke insert on table "public"."reglas_costo" from "service_role";

revoke references on table "public"."reglas_costo" from "service_role";

revoke select on table "public"."reglas_costo" from "service_role";

revoke trigger on table "public"."reglas_costo" from "service_role";

revoke truncate on table "public"."reglas_costo" from "service_role";

revoke update on table "public"."reglas_costo" from "service_role";

revoke delete on table "public"."stock_movimientos" from "anon";

revoke insert on table "public"."stock_movimientos" from "anon";

revoke references on table "public"."stock_movimientos" from "anon";

revoke select on table "public"."stock_movimientos" from "anon";

revoke trigger on table "public"."stock_movimientos" from "anon";

revoke truncate on table "public"."stock_movimientos" from "anon";

revoke update on table "public"."stock_movimientos" from "anon";

revoke references on table "public"."stock_movimientos" from "authenticated";

revoke trigger on table "public"."stock_movimientos" from "authenticated";

revoke truncate on table "public"."stock_movimientos" from "authenticated";

revoke delete on table "public"."stock_movimientos" from "service_role";

revoke insert on table "public"."stock_movimientos" from "service_role";

revoke references on table "public"."stock_movimientos" from "service_role";

revoke select on table "public"."stock_movimientos" from "service_role";

revoke trigger on table "public"."stock_movimientos" from "service_role";

revoke truncate on table "public"."stock_movimientos" from "service_role";

revoke update on table "public"."stock_movimientos" from "service_role";

revoke delete on table "public"."toner_modelos" from "anon";

revoke insert on table "public"."toner_modelos" from "anon";

revoke references on table "public"."toner_modelos" from "anon";

revoke select on table "public"."toner_modelos" from "anon";

revoke trigger on table "public"."toner_modelos" from "anon";

revoke truncate on table "public"."toner_modelos" from "anon";

revoke update on table "public"."toner_modelos" from "anon";

revoke references on table "public"."toner_modelos" from "authenticated";

revoke trigger on table "public"."toner_modelos" from "authenticated";

revoke truncate on table "public"."toner_modelos" from "authenticated";

revoke delete on table "public"."toner_modelos" from "service_role";

revoke insert on table "public"."toner_modelos" from "service_role";

revoke references on table "public"."toner_modelos" from "service_role";

revoke select on table "public"."toner_modelos" from "service_role";

revoke trigger on table "public"."toner_modelos" from "service_role";

revoke truncate on table "public"."toner_modelos" from "service_role";

revoke update on table "public"."toner_modelos" from "service_role";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_updated AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_updated();


