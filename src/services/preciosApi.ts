import { sb } from "../config/supabase";
import {
  CONFIG_COSTO_DESCRIPCIONES,
  mergeConfigCostosRows,
  type PrecioImpresion,
  type PrecioAnillado,
  type PrecioAnilladoInput,
  type ConfigCosto
} from "../types/precio";
import type { ConfiguracionNegocio } from "../types/configuracionNegocio";

/**
 * Columnas que PostgREST suele tener en caché desde el esquema original.
 * No incluimos `nombre` (31): si la caché de la API no se actualizó, `select=*`
 * o INSERT con `nombre` devuelve 400/PGRST204. El default en BD aplica para `nombre`.
 */
const PRECIOS_IMPRESION_SELECT =
  "id,tipo,doble_faz,precio_venta,activo,updated_at,updated_by,costo_insumo_directo" as const;

export const preciosApi = {
  // ── CONFIGURACIÓN DE NEGOCIO (Épica 1, single row) ───────────────────────

  /**
   * Lee la fila id=1. Usa maybeSingle (no .single) para evitar 406/PGRST116 si hay 0 filas.
   * Si el usuario está autenticado y falta la fila, inserta el seed { id: 1 } con defaults SQL.
   */
  async fetchConfiguracionNegocio(): Promise<ConfiguracionNegocio> {
    const load = () =>
      sb.from("configuracion_negocio").select("*").eq("id", 1).maybeSingle();

    let { data, error } = await load();
    if (error) throw error;
    if (data) return data as ConfiguracionNegocio;

    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) {
      throw new Error(
        "Iniciá sesión para ver la configuración de negocio (RLS requiere usuario autenticado)."
      );
    }

    const ins = await sb
      .from("configuracion_negocio")
      .insert({ id: 1 })
      .select("*")
      .maybeSingle();

    if (ins.error) {
      const again = await load();
      if (again.data) return again.data as ConfiguracionNegocio;
      throw ins.error;
    }
    if (ins.data) return ins.data as ConfiguracionNegocio;

    const final = await load();
    if (final.error) throw final.error;
    if (final.data) return final.data as ConfiguracionNegocio;

    throw new Error("No se pudo cargar configuracion_negocio.");
  },

  async updateConfiguracionNegocio(
    patch: Partial<
      Pick<
        ConfiguracionNegocio,
        | "pct_desperdicio"
        | "pct_mantenimiento_maquinas"
        | "dias_vigencia_presupuesto"
        | "margen_objetivo_pct"
      >
    >
  ): Promise<void> {
    const { error } = await sb
      .from("configuracion_negocio")
      .update({
        ...patch,
        updated_by: (await sb.auth.getUser()).data.user?.id
      })
      .eq("id", 1);
    if (error) throw error;
  },

  // ── PRECIOS IMPRESIÓN ───────────────────────────────────────────────────

  async fetchPreciosImpresion(
    soloActivos = true
  ): Promise<PrecioImpresion[]> {
    let q = sb
      .from("precios_impresion")
      .select(PRECIOS_IMPRESION_SELECT)
      .order("tipo")
      .order("doble_faz");
    if (soloActivos) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PrecioImpresion[];
  },

  async actualizarPrecioImpresion(
    id: string,
    precio_venta: number
  ): Promise<void> {
    const { error } = await sb
      .from("precios_impresion")
      .update({
        precio_venta,
        updated_by: (await sb.auth.getUser()).data.user?.id
      })
      .eq("id", id);
    if (error) throw error;
  },

  async crearPrecioImpresion(input: {
    tipo: PrecioImpresion["tipo"];
    doble_faz: boolean;
    precio_venta: number;
    activo?: boolean;
  }): Promise<PrecioImpresion> {
    const uid = (await sb.auth.getUser()).data.user?.id ?? null;
    const { data: conflict } = await sb
      .from("precios_impresion")
      .select("id")
      .eq("tipo", input.tipo)
      .eq("doble_faz", input.doble_faz)
      .eq("activo", true)
      .maybeSingle();
    let activo = input.activo !== false;
    if (conflict?.id && activo) {
      activo = false;
    }
    const payload = {
      tipo: input.tipo,
      doble_faz: input.doble_faz,
      precio_venta: input.precio_venta,
      activo,
      updated_by: uid
    };
    const res = await sb
      .from("precios_impresion")
      .insert(payload)
      .select(PRECIOS_IMPRESION_SELECT)
      .single();
    if (res.error) throw res.error;
    return res.data as PrecioImpresion;
  },

  async actualizarPrecioImpresionCompleto(
    id: string,
    patch: Partial<Pick<PrecioImpresion, "precio_venta" | "activo">>
  ): Promise<void> {
    const uid = (await sb.auth.getUser()).data.user?.id ?? null;
    const row: Record<string, unknown> = { updated_by: uid };
    if (patch.precio_venta !== undefined)
      row.precio_venta = patch.precio_venta;
    if (patch.activo !== undefined) row.activo = patch.activo;
    const upd = await sb
      .from("precios_impresion")
      .update(row)
      .eq("id", id)
      .select("id");
    if (upd.error) throw upd.error;
    const data = upd.data;
    if (!data?.length) {
      throw new Error(
        "No se guardó la tarifa (sin filas actualizadas). ¿Rol admin?"
      );
    }
  },

  async eliminarPrecioImpresion(id: string): Promise<void> {
    const { error } = await sb.from("precios_impresion").delete().eq("id", id);
    if (error) throw error;
  },

  async toggleImpresionActivo(id: string, activo: boolean): Promise<void> {
    if (activo) {
      const { data: row, error: e1 } = await sb
        .from("precios_impresion")
        .select("tipo, doble_faz")
        .eq("id", id)
        .single();
      if (e1) throw e1;
      if (row) {
        const { data: other } = await sb
          .from("precios_impresion")
          .select("id")
          .eq("tipo", row.tipo)
          .eq("doble_faz", row.doble_faz)
          .eq("activo", true)
          .neq("id", id)
          .maybeSingle();
        if (other) {
          throw new Error(
            "Ya hay otra tarifa activa para esta combinación. Desactivala primero."
          );
        }
      }
    }
    const { error } = await sb
      .from("precios_impresion")
      .update({
        activo,
        updated_by: (await sb.auth.getUser()).data.user?.id
      })
      .eq("id", id);
    if (error) throw error;
  },

  async ajustarPreciosImpresionPorcentaje(porcentaje: number): Promise<void> {
    const precios = await this.fetchPreciosImpresion(true);
    const factor = 1 + porcentaje / 100;
    for (const p of precios) {
      await this.actualizarPrecioImpresion(
        p.id,
        Math.round(p.precio_venta * factor)
      );
    }
  },

  // ── PRECIOS ANILLADO ────────────────────────────────────────────────────

  async fetchPreciosAnillado(soloActivos = true): Promise<PrecioAnillado[]> {
    let query = sb.from("precios_anillado").select("*").order("medida_mm");
    if (soloActivos) query = query.eq("activo", true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      nombre_categoria:
        (row as { nombre_categoria?: string }).nombre_categoria ?? "Mediano"
    })) as PrecioAnillado[];
  },

  async crearPrecioAnillado(
    input: PrecioAnilladoInput & { activo?: boolean }
  ): Promise<PrecioAnillado> {
    const uid = (await sb.auth.getUser()).data.user?.id ?? null;
    const { data, error } = await sb
      .from("precios_anillado")
      .insert({
        nombre_categoria: input.nombre_categoria,
        medida_mm: Math.round(input.medida_mm),
        paginas_max:
          input.paginas_max == null || Number.isNaN(input.paginas_max)
            ? null
            : Math.round(input.paginas_max),
        precio_venta: input.precio_venta,
        activo: input.activo !== false,
        updated_by: uid
      })
      .select()
      .single();
    if (error) throw error;
    return data as PrecioAnillado;
  },

  async actualizarPrecioAnillado(
    id: string,
    precio_venta: number
  ): Promise<void> {
    const { data, error } = await sb
      .from("precios_anillado")
      .update({
        precio_venta,
        updated_by: (await sb.auth.getUser()).data.user?.id
      })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data?.length) {
      throw new Error(
        "No se guardó el precio (sin filas actualizadas). ¿Tu usuario tiene rol admin en perfiles?"
      );
    }
  },

  async actualizarPrecioAnilladoCompleto(
    id: string,
    patch: Partial<
      Pick<
        PrecioAnillado,
        | "nombre_categoria"
        | "medida_mm"
        | "paginas_max"
        | "precio_venta"
        | "activo"
      >
    >
  ): Promise<void> {
    const uid = (await sb.auth.getUser()).data.user?.id ?? null;
    const row: Record<string, unknown> = { updated_by: uid };
    if (patch.nombre_categoria !== undefined)
      row.nombre_categoria = patch.nombre_categoria;
    if (patch.medida_mm !== undefined)
      row.medida_mm = Math.round(patch.medida_mm);
    if (patch.paginas_max !== undefined) {
      row.paginas_max =
        patch.paginas_max == null ? null : Math.round(patch.paginas_max);
    }
    if (patch.precio_venta !== undefined) row.precio_venta = patch.precio_venta;
    if (patch.activo !== undefined) row.activo = patch.activo;
    const { data, error } = await sb
      .from("precios_anillado")
      .update(row)
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data?.length) {
      throw new Error(
        "No se guardó la tarifa (sin filas actualizadas). ¿Tu usuario tiene rol admin en perfiles?"
      );
    }
  },

  async eliminarPrecioAnillado(id: string): Promise<void> {
    const { error } = await sb.from("precios_anillado").delete().eq("id", id);
    if (error) throw error;
  },

  async toggleAnilladoActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await sb
      .from("precios_anillado")
      .update({ activo })
      .eq("id", id);
    if (error) throw error;
  },

  async ajustarPreciosAnilladoPorcentaje(porcentaje: number): Promise<void> {
    const precios = await this.fetchPreciosAnillado(true);
    const factor = 1 + porcentaje / 100;
    for (const p of precios) {
      await this.actualizarPrecioAnillado(
        p.id,
        Math.round(p.precio_venta * factor)
      );
    }
  },

  // ── CONFIG COSTOS ───────────────────────────────────────────────────────

  async fetchConfigCostos(): Promise<ConfigCosto[]> {
    const { data, error } = await sb
      .from("config_costos")
      .select("*")
      .order("key");
    if (error) throw error;
    return mergeConfigCostosRows((data ?? []) as ConfigCosto[]);
  },

  async actualizarConfigCosto(key: string, value: string): Promise<void> {
    const uid = (await sb.auth.getUser()).data.user?.id;
    const { error } = await sb.from("config_costos").upsert(
      {
        key,
        value,
        descripcion: CONFIG_COSTO_DESCRIPCIONES[key] ?? null,
        updated_by: uid
      },
      { onConflict: "key" }
    );
    if (error) throw error;
  }
};
