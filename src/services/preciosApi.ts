import { sb } from "../config/supabase";
import {
  CONFIG_COSTO_DESCRIPCIONES,
  mergeConfigCostosRows,
  type PerfilTintaImpresion,
  type PrecioImpresion,
  type PrecioAnillado,
  type PrecioAnilladoInput,
  type ConfigCosto
} from "../types/precio";
import type { ConfiguracionNegocio } from "../types/configuracionNegocio";

/**
 * Columnas por versión de esquema:
 * - `nombre` → migración 31
 * - `perfil_tinta` → migración 47
 * PostgREST puede fallar (schema cache) si el cliente pide columnas que no ve.
 */
const PRECIOS_IMPRESION_SELECT_FULL =
  "id,tipo,doble_faz,nombre,perfil_tinta,precio_venta,activo,updated_at,updated_by,costo_insumo_directo,equipo_id" as const;

/** Sin `nombre` (31), con `perfil_tinta` (47). */
const PRECIOS_IMPRESION_SELECT_SIN_NOMBRE =
  "id,tipo,doble_faz,perfil_tinta,precio_venta,activo,updated_at,updated_by,costo_insumo_directo,equipo_id" as const;

/** Sin `nombre` ni `perfil_tinta` (solo columnas “clásicas” + costo/equipo). */
const PRECIOS_IMPRESION_SELECT_SIN_NOMBRE_NI_PERFIL =
  "id,tipo,doble_faz,precio_venta,activo,updated_at,updated_by,costo_insumo_directo,equipo_id" as const;

/** Mínimo para listar si el esquema va muy desfasado. */
const PRECIOS_IMPRESION_SELECT_MINIMAL =
  "id,tipo,doble_faz,precio_venta,activo" as const;

/** Error típico: columna inexistente o caché de PostgREST desactualizada. */
function esErrorEsquemaColumna(error: unknown): boolean {
  const e = error as { code?: string; message?: string; details?: string };
  const msg = `${e.message ?? ""} ${e.details ?? ""}`;
  return (
    e.code === "PGRST204" ||
    e.code === "42703" ||
    /perfil_tinta|nombre|equipo_id|costo_insumo/i.test(msg) ||
    /Could not find|column .* does not exist|schema cache/i.test(msg)
  );
}

/** Normaliza una fila de `precios_impresion` (completa o mínima) para la UI. */
export function normalizarFilaPrecioImpresion(raw: unknown): PrecioImpresion {
  const r = raw as Record<string, unknown>;
  const tipo = String(r.tipo ?? "").trim() || "bn";
  const pv = Number(r.precio_venta);
  const perfil: PerfilTintaImpresion =
    r.perfil_tinta === "bn" || r.perfil_tinta === "color"
      ? r.perfil_tinta
      : tipo === "bn"
        ? "bn"
        : "color";
  return {
    id: String(r.id ?? ""),
    tipo,
    doble_faz: Boolean(r.doble_faz),
    nombre: r.nombre != null && String(r.nombre).trim() !== "" ? String(r.nombre) : null,
    perfil_tinta: perfil,
    equipo_id: r.equipo_id != null ? String(r.equipo_id) : null,
    precio_venta: Number.isFinite(pv) ? pv : 0,
    costo_insumo_directo:
      r.costo_insumo_directo != null &&
      Number.isFinite(Number(r.costo_insumo_directo))
        ? Number(r.costo_insumo_directo)
        : null,
    activo: r.activo !== false,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
    updated_by: r.updated_by != null ? String(r.updated_by) : null
  };
}

function mapPrecioImpresionRows(rows: unknown[] | null): PrecioImpresion[] {
  return (rows ?? []).map((row) => normalizarFilaPrecioImpresion(row));
}

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
    const ejecutar = (select: string) => {
      let q = sb
        .from("precios_impresion")
        .select(select)
        .order("tipo", { ascending: true })
        .order("doble_faz", { ascending: true });
      if (soloActivos) q = q.eq("activo", true);
      return q;
    };

    let { data, error } = await ejecutar(PRECIOS_IMPRESION_SELECT_FULL);
    if (error) {
      const r1 = await ejecutar(PRECIOS_IMPRESION_SELECT_SIN_NOMBRE);
      data = r1.data;
      error = r1.error;
    }
    if (error) {
      const r2 = await ejecutar(PRECIOS_IMPRESION_SELECT_SIN_NOMBRE_NI_PERFIL);
      data = r2.data;
      error = r2.error;
    }
    if (error) {
      const r3 = await ejecutar(PRECIOS_IMPRESION_SELECT_MINIMAL);
      data = r3.data;
      error = r3.error;
    }
    if (error) throw error;
    return mapPrecioImpresionRows(data ?? []);
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
    /** Etiqueta opcional (misma semántica que migración 31). */
    nombre?: string | null;
    /** Tóner vs tintas color (migración 47). */
    perfil_tinta: PerfilTintaImpresion;
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
    const payload: Record<string, unknown> = {
      tipo: input.tipo,
      doble_faz: input.doble_faz,
      precio_venta: input.precio_venta,
      perfil_tinta: input.perfil_tinta,
      activo,
      updated_by: uid
    };
    if (input.nombre != null && String(input.nombre).trim() !== "") {
      payload.nombre = String(input.nombre).trim();
    }
    const insertar = (
      pl: Record<string, unknown>,
      sel: string
    ) =>
      sb.from("precios_impresion").insert(pl).select(sel).single();

    let res = await insertar(payload, PRECIOS_IMPRESION_SELECT_FULL);
    if (res.error && esErrorEsquemaColumna(res.error)) {
      const { nombre: _n, ...sinNombre } = payload;
      res = await insertar(sinNombre, PRECIOS_IMPRESION_SELECT_SIN_NOMBRE);
    }
    if (res.error && esErrorEsquemaColumna(res.error)) {
      const { nombre: _n2, perfil_tinta: _pt, ...sinNombreNiPerfil } = payload;
      res = await insertar(
        sinNombreNiPerfil,
        PRECIOS_IMPRESION_SELECT_SIN_NOMBRE_NI_PERFIL
      );
    }
    if (res.error && esErrorEsquemaColumna(res.error)) {
      const min: Record<string, unknown> = {
        tipo: payload.tipo,
        doble_faz: payload.doble_faz,
        precio_venta: payload.precio_venta,
        activo: payload.activo,
        updated_by: payload.updated_by
      };
      res = await insertar(min, PRECIOS_IMPRESION_SELECT_MINIMAL);
    }
    if (res.error) throw res.error;
    const row = res.data as PrecioImpresion | null;
    if (!row) throw new Error("Sin datos tras crear tarifa de impresión.");
    return mapPrecioImpresionRows([row])[0] as PrecioImpresion;
  },

  async actualizarPrecioImpresionCompleto(
    id: string,
    patch: Partial<
      Pick<
        PrecioImpresion,
        "precio_venta" | "activo" | "equipo_id" | "perfil_tinta"
      >
    >
  ): Promise<void> {
    const uid = (await sb.auth.getUser()).data.user?.id ?? null;
    const row: Record<string, unknown> = { updated_by: uid };
    if (patch.precio_venta !== undefined)
      row.precio_venta = patch.precio_venta;
    if (patch.activo !== undefined) row.activo = patch.activo;
    if (patch.equipo_id !== undefined) row.equipo_id = patch.equipo_id;
    if (patch.perfil_tinta !== undefined)
      row.perfil_tinta = patch.perfil_tinta;
    let upd = await sb
      .from("precios_impresion")
      .update(row)
      .eq("id", id)
      .select("id");
    if (upd.error && esErrorEsquemaColumna(upd.error) && "perfil_tinta" in row) {
      const { perfil_tinta: _p, ...rowSinPerfil } = row;
      upd = await sb
        .from("precios_impresion")
        .update(rowSinPerfil)
        .eq("id", id)
        .select("id");
    }
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
