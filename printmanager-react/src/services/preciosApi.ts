import { sb } from "../config/supabase";
import type {
  PrecioImpresion,
  PrecioAnillado,
  ConfigCosto
} from "../types/precio";

export const preciosApi = {
  // ── PRECIOS IMPRESIÓN ───────────────────────────────────────────────────

  async fetchPreciosImpresion(): Promise<PrecioImpresion[]> {
    const { data, error } = await sb
      .from("precios_impresion")
      .select("*")
      .eq("activo", true)
      .order("tipo")
      .order("doble_faz");
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

  async ajustarPreciosImpresionPorcentaje(porcentaje: number): Promise<void> {
    const precios = await this.fetchPreciosImpresion();
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
    return (data ?? []) as PrecioAnillado[];
  },

  async actualizarPrecioAnillado(
    id: string,
    precio_venta: number
  ): Promise<void> {
    const { error } = await sb
      .from("precios_anillado")
      .update({
        precio_venta,
        updated_by: (await sb.auth.getUser()).data.user?.id
      })
      .eq("id", id);
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
    const precios = await this.fetchPreciosAnillado();
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
    return (data ?? []) as ConfigCosto[];
  },

  async actualizarConfigCosto(key: string, value: string): Promise<void> {
    const { error } = await sb
      .from("config_costos")
      .update({ value, updated_by: (await sb.auth.getUser()).data.user?.id })
      .eq("key", key);
    if (error) throw error;
  }
};
