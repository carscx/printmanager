export interface PedidoItem {
  id?: string;
  pedido_id?: string;
  nombre_archivo: string;
  paginas: number;
  copias: number;
  tipo_impresion: string;
  anillado: string | null;
  precio_unitario: number;
  observaciones: string;
  created_at?: string;
  /** BOM / Supabase */
  solo_anillado?: boolean;
  precio_impresion_id?: string | null;
  precio_anillado_id?: string | null;
  anillado_medida_mm?: number | null;
  doble_faz?: boolean;
  // Descuentos y recargos
  descuento_porcentaje?: number | null;
  descuento_monto?: number | null;
  recargo_porcentaje?: number | null;
  recargo_monto?: number | null;
  _anillado_costo?: number;
}

export interface Pedido {
  id: string;
  /** Número legible #1024 (Épica 3) */
  numero_publico?: number | null;
  cliente: string;
  estado: string;
  /** presupuesto | pedido — presupuesto tiene fecha_vencimiento */
  modalidad?: "presupuesto" | "pedido";
  fecha_vencimiento?: string | null;
  total: number;
  sena: number;
  fecha_entrega: string | null;
  observaciones: string;
  entregado: boolean;
  pagado?: boolean;
  fecha_pago: string | null;
  created_at: string;
  // Descuentos y recargos globales
  descuento_global_porcentaje?: number | null;
  descuento_global_monto?: number | null;
  recargo_global_porcentaje?: number | null;
  recargo_global_monto?: number | null;
  // Alias legacy
  total_pedido?: number;
  /** Vendedor asignado (profiles.id) */
  vendedor_id?: string | null;
  /** Comisión calculada (venta × comision_pct del vendedor) */
  comision_monto?: number | null;
  // Relación
  pedido_items: PedidoItem[];
}

export type PedidoCabecera = Omit<Pedido, "id" | "pedido_items" | "created_at">;

export type TipoPago = "sin_pago" | "sena_50" | "sena_libre" | "pago_total";

export type EstadoPedido =
  | "presupuesto"
  | "pendiente"
  | "listo"
  | "pagado"
  | "entregado"
  | "cancelado";

