import { apiGet, apiPatch, apiPost } from "../config/apiClient";
import type { Producto, ProductoInsumo } from "../types/producto";

export const productosApi = {
  async fetchAll(soloActivos = false): Promise<Producto[]> {
    return apiGet(`/productos?soloActivos=${soloActivos}`);
  },

  async fetchById(id: string): Promise<Producto | null> {
    return apiGet(`/productos/${id}`);
  },

  async updatePrecio(id: string, precioVenta: number): Promise<void> {
    await apiPatch(`/productos/${id}/precio`, { precio_venta: precioVenta });
  },

  async replaceBom(
    productoId: string,
    lineas: { insumo_id: string; cantidad: number }[]
  ): Promise<ProductoInsumo[]> {
    return apiPost(`/productos/${productoId}/bom`, { lineas });
  }
};
