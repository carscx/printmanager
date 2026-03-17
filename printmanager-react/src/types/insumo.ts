// Categorías de insumos
export const INSUMO_CATEGORIAS = [
  "espiral",
  "tapa_transparente",
  "tapa_color",
  "papel",
  "tinta",
  "toner",
  "bolsa",
  "bolsa_propileno",
  "clip",
  "otro"
] as const;

export type InsumoCategoria = (typeof INSUMO_CATEGORIAS)[number];

export const INSUMO_CATEGORIA_LABELS: Record<InsumoCategoria, string> = {
  espiral: "Espiral",
  tapa_transparente: "Tapa Transparente",
  tapa_color: "Tapa Color",
  papel: "Papel",
  tinta: "Tinta",
  toner: "Tóner",
  bolsa: "Bolsa",
  bolsa_propileno: "Bolsa Propileno",
  clip: "Clip",
  otro: "Otro"
};

// Unidades
export const INSUMO_UNIDADES = [
  "unidad",
  "litro",
  "resma",
  "cartucho",
  "paquete"
] as const;

export type InsumoUnidad = (typeof INSUMO_UNIDADES)[number];

export const INSUMO_UNIDAD_LABELS: Record<InsumoUnidad, string> = {
  unidad: "Unidad",
  litro: "Litro",
  resma: "Resma",
  cartucho: "Cartucho",
  paquete: "Paquete"
};

// Insumo principal
export interface Insumo {
  id: string;
  categoria: InsumoCategoria;
  nombre: string;
  unidad: InsumoUnidad;
  medida_mm: number | null;
  color: string | null;
  tipo_papel: string | null;
  rendimiento: number | null;
  hojas_por_unidad: number | null;
  precio_compra: number;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

// Para crear/editar (sin id ni timestamps)
export type InsumoInput = Omit<Insumo, "id" | "created_at" | "updated_at">;

// Movimientos de stock
export const STOCK_TIPOS = ["entrada", "salida", "ajuste"] as const;
export type StockTipo = (typeof STOCK_TIPOS)[number];

export const STOCK_MOTIVOS = [
  "compra",
  "pedido",
  "ajuste_manual",
  "devolucion",
  "cancelacion"
] as const;
export type StockMotivo = (typeof STOCK_MOTIVOS)[number];

export const STOCK_TIPO_LABELS: Record<StockTipo, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste"
};

export const STOCK_MOTIVO_LABELS: Record<StockMotivo, string> = {
  compra: "Compra",
  pedido: "Pedido",
  ajuste_manual: "Ajuste manual",
  devolucion: "Devolución",
  cancelacion: "Cancelación"
};

export interface StockMovimiento {
  id: string;
  insumo_id: string;
  tipo: StockTipo;
  cantidad: number;
  motivo: StockMotivo;
  referencia_pedido_id: string | null;
  notas: string | null;
  created_at: string;
  created_by: string | null;
}

// Historial de precios
export interface InsumoPrecioLog {
  id: string;
  insumo_id: string;
  precio_anterior: number;
  precio_nuevo: number;
  changed_at: string;
  changed_by: string | null;
}
