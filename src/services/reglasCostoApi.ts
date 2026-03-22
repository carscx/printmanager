import { sb } from "../config/supabase";
import type { ReglaCosto, ReglaCostoInput } from "../types/reglaCosto";

export type TipoTarifaRegla = "impresion" | "anillado";

export const reglasCostoApi = {
  async fetchByTarifa(
    tipo: TipoTarifaRegla,
    tarifaId: string
  ): Promise<ReglaCosto[]> {
    let q = sb.from("reglas_costo").select("*").order("created_at", {
      ascending: true
    });
    if (tipo === "impresion") {
      q = q.eq("precio_impresion_id", tarifaId).is("precio_anillado_id", null);
    } else {
      q = q.eq("precio_anillado_id", tarifaId).is("precio_impresion_id", null);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ReglaCosto[];
  },

  /** Todas las líneas de `reglas_costo` vinculadas a tarifas de anillado (para costeo en grid). */
  async fetchTodasAnillado(): Promise<ReglaCosto[]> {
    const { data, error } = await sb
      .from("reglas_costo")
      .select("*")
      .not("precio_anillado_id", "is", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ReglaCosto[];
  },

  /** @deprecated usar fetchByTarifa */
  async fetchByPrecioImpresion(
    precioImpresionId: string
  ): Promise<ReglaCosto[]> {
    return this.fetchByTarifa("impresion", precioImpresionId);
  },

  async insert(row: ReglaCostoInput): Promise<ReglaCosto> {
    const { data, error } = await sb
      .from("reglas_costo")
      .insert([
        {
          precio_impresion_id: row.precio_impresion_id,
          precio_anillado_id: row.precio_anillado_id,
          insumo_id: row.insumo_id,
          cantidad_usada: row.cantidad_usada,
          activo: row.activo
        }
      ])
      .select()
      .single();
    if (error) throw error;
    return data as ReglaCosto;
  },

  async update(
    id: string,
    patch: Partial<Pick<ReglaCosto, "insumo_id" | "cantidad_usada" | "activo">>
  ): Promise<void> {
    const { error } = await sb.from("reglas_costo").update(patch).eq("id", id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await sb.from("reglas_costo").delete().eq("id", id);
    if (error) throw error;
  }
};
