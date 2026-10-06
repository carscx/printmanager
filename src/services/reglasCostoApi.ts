import { apiDelete, apiGet, apiPatch, apiPost } from "../config/apiClient";
import type { ReglaCosto, ReglaCostoInput } from "../types/reglaCosto";

export type TipoTarifaRegla = "impresion" | "anillado";

export const reglasCostoApi = {
  async fetchByTarifa(
    tipo: TipoTarifaRegla,
    tarifaId: string
  ): Promise<ReglaCosto[]> {
    return apiGet(
      `/reglas-costo?tipo=${tipo}&tarifaId=${encodeURIComponent(tarifaId)}`
    );
  },

  async fetchTodasAnillado(): Promise<ReglaCosto[]> {
    return apiGet("/reglas-costo?todas=anillado");
  },

  async fetchTodasImpresion(): Promise<ReglaCosto[]> {
    return apiGet("/reglas-costo?todas=impresion");
  },

  async fetchByPrecioImpresion(
    precioImpresionId: string
  ): Promise<ReglaCosto[]> {
    return this.fetchByTarifa("impresion", precioImpresionId);
  },

  async insert(row: ReglaCostoInput): Promise<ReglaCosto> {
    return apiPost("/reglas-costo", {
      precio_impresion_id: row.precio_impresion_id,
      precio_anillado_id: row.precio_anillado_id,
      insumo_id: row.insumo_id,
      cantidad_usada: row.cantidad_usada,
      activo: row.activo
    });
  },

  async update(
    id: string,
    patch: Partial<Pick<ReglaCosto, "insumo_id" | "cantidad_usada" | "activo">>
  ): Promise<void> {
    await apiPatch(`/reglas-costo/${id}`, patch);
  },

  async delete(id: string): Promise<void> {
    await apiDelete(`/reglas-costo/${id}`);
  }
};
