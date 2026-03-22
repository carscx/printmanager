import type { AlcanceReceta } from "./receta";

/** Fila para UI: tarifas legacy que referencian el insumo (margen estimado). */
export interface ProductoTarifaAfectada {
  receta_id: string;
  alcance: AlcanceReceta;
  etiqueta: string;
  precio_venta: number;
  costo_directo_tarifa: number | null;
  costo_real: number;
  margen_pct: number | null;
}
