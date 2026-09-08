import { sb } from "../config/supabase";
import type { Producto, ProductoInsumo } from "../types/producto";

export const productosApi = {
  async fetchAll(soloActivos = false): Promise<Producto[]> {
    let q = sb
      .from("productos")
      .select("*, productos_insumos(*)")
      .order("nombre", { ascending: true });
    if (soloActivos) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Producto[];
  },

  async fetchById(id: string): Promise<Producto | null> {
    const { data, error } = await sb
      .from("productos")
      .select("*, productos_insumos(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as Producto) ?? null;
  },

  async updatePrecio(
    id: string,
    precioVenta: number
  ): Promise<void> {
    const { error } = await sb
      .from("productos")
      .update({
        precio_venta: precioVenta,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);
    if (error) throw error;
  },

  /**
   * Reemplaza el BOM del producto. Para Agenda Semanal: una fila de papel (hojas).
   */
  async replaceBom(
    productoId: string,
    lineas: { insumo_id: string; cantidad: number }[]
  ): Promise<ProductoInsumo[]> {
    const { error: delErr } = await sb
      .from("productos_insumos")
      .delete()
      .eq("producto_id", productoId);
    if (delErr) throw delErr;

    const validas = lineas.filter(
      (l) => l.insumo_id && Number(l.cantidad) > 0
    );
    if (validas.length === 0) return [];

    const { data, error } = await sb
      .from("productos_insumos")
      .insert(
        validas.map((l) => ({
          producto_id: productoId,
          insumo_id: l.insumo_id,
          cantidad: Number(l.cantidad)
        }))
      )
      .select();
    if (error) throw error;
    return (data ?? []) as ProductoInsumo[];
  }
};
