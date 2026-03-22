import { sb } from "../config/supabase";
import type { RecetaItem, RecetaItemInput } from "../types/receta";

export const recetasApi = {
  async fetchAll(): Promise<RecetaItem[]> {
    const { data, error } = await sb
      .from("recetas_items")
      .select("*, insumos(nombre)")
      .order("alcance")
      .order("precio_impresion_id");
    if (error) throw error;
    return (data ?? []) as RecetaItem[];
  },

  async insert(row: RecetaItemInput): Promise<void> {
    const { error } = await sb.from("recetas_items").insert([
      {
        alcance: row.alcance,
        precio_impresion_id: row.precio_impresion_id,
        insumo_id: row.insumo_id,
        modo_consumo: row.modo_consumo,
        cantidad: row.cantidad,
        es_espiral_auto: row.es_espiral_auto
      }
    ]);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await sb.from("recetas_items").delete().eq("id", id);
    if (error) throw error;
  }
};
