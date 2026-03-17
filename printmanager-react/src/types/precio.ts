// ── Precios de impresión ─────────────────────────────────────────────────────

export const TIPO_IMPRESION = ["bn", "color"] as const;
export type TipoImpresion = (typeof TIPO_IMPRESION)[number];

export const TIPO_IMPRESION_LABELS: Record<TipoImpresion, string> = {
  bn: "B&N",
  color: "Color"
};

export interface PrecioImpresion {
  id: string;
  tipo: TipoImpresion;
  doble_faz: boolean;
  precio_venta: number;
  activo: boolean;
  updated_at: string;
  updated_by: string | null;
}

export type PrecioImpresionInput = Pick<
  PrecioImpresion,
  "tipo" | "doble_faz" | "precio_venta"
>;

// ── Precios de anillado ─────────────────────────────────────────────────────

export interface PrecioAnillado {
  id: string;
  medida_mm: number;
  paginas_max: number | null;
  precio_venta: number;
  activo: boolean;
  updated_at: string;
  updated_by: string | null;
}

export type PrecioAnilladoInput = Pick<
  PrecioAnillado,
  "medida_mm" | "paginas_max" | "precio_venta"
>;

// ── Config de costos ────────────────────────────────────────────────────────

export interface ConfigCosto {
  key: string;
  value: string;
  descripcion: string | null;
  updated_at: string;
  updated_by: string | null;
}

export const CONFIG_COSTO_LABELS: Record<string, string> = {
  markup_general: "Divisor Ganancia",
  comision_sobrina: "% Comisión Avru"
};

// ── Consumo congelado por item ──────────────────────────────────────────────

export interface PedidoItemInsumo {
  id: string;
  pedido_item_id: string;
  insumo_id: string;
  equipo_id: string | null;
  cantidad: number;
  costo_unitario_congelado: number;
  costo_total: number;
  created_at: string;
}

// ── Helpers para etiquetas en UI ────────────────────────────────────────────

export function labelPrecioImpresion(
  tipo: TipoImpresion,
  dobleFaz: boolean
): string {
  return `${TIPO_IMPRESION_LABELS[tipo]} ${dobleFaz ? "Doble Faz" : "Simple Faz"}`;
}

export function labelAnillado(
  medidaMm: number,
  paginasMax: number | null
): string {
  const hojas = paginasMax ? ` (hasta ${paginasMax} hjs)` : "";
  return `${medidaMm}mm${hojas}`;
}
