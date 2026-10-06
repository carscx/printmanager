import { apiDelete, apiGet, apiPost } from "../config/apiClient";
import type { RecetaItem, RecetaItemInput } from "../types/receta";

export const recetasApi = {
  async fetchAll(): Promise<RecetaItem[]> {
    return apiGet("/recetas");
  },

  async insert(row: RecetaItemInput): Promise<void> {
    await apiPost("/recetas", {
      alcance: row.alcance,
      precio_impresion_id: row.precio_impresion_id,
      insumo_id: row.insumo_id,
      modo_consumo: row.modo_consumo,
      cantidad: row.cantidad,
      es_espiral_auto: row.es_espiral_auto
    });
  },

  async delete(id: string): Promise<void> {
    await apiDelete(`/recetas/${id}`);
  }
};
