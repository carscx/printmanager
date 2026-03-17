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
  // Descuentos y recargos
  descuento_porcentaje?: number | null;
  descuento_monto?: number | null;
  recargo_porcentaje?: number | null;
  recargo_monto?: number | null;
  // Campos en memoria (no persisten en DB)
  _sobrina?: boolean;
  _anillado_costo?: number;
}

export interface Pedido {
  id: string;
  cliente: string;
  estado: string;
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
  recargo_global_porcentaje?: number | null;
  // Alias legacy
  total_pedido?: number;
  // Relación
  pedido_items: PedidoItem[];
}

export type PedidoCabecera = Omit<Pedido, "id" | "pedido_items" | "created_at">;

export type TipoPago = "sin_pago" | "sena_50" | "sena_libre" | "pago_total";

export type EstadoPedido =
  | "presupuesto"
  | "pendiente"
  | "señado"
  | "pagado"
  | "entregado"
  | "cancelado";

export type VistaTab = "taller" | "historial";
