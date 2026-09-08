export interface ProductoInsumo {
  id: string;
  producto_id: string;
  insumo_id: string;
  cantidad: number;
}

export interface Producto {
  id: string;
  nombre: string;
  slug: string;
  precio_venta: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  productos_insumos?: ProductoInsumo[];
}

/** Precio > 0 y al menos un insumo con cantidad: se puede vender. */
export function productoListoParaVender(p: Producto): boolean {
  const precio = Number(p.precio_venta) || 0;
  const bom = p.productos_insumos ?? [];
  return (
    p.activo !== false &&
    precio > 0 &&
    bom.some((i) => Boolean(i.insumo_id) && Number(i.cantidad) > 0)
  );
}
