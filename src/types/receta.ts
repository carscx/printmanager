export const ALCANCE_RECETA = [
  "IMPRESION",
  "SOLO_ANILLADO",
  "ANILLADO_EXTRA"
] as const;
export type AlcanceReceta = (typeof ALCANCE_RECETA)[number];

export const MODO_CONSUMO = [
  "POR_CARA",
  "POR_HOJA_FISICA",
  "POR_TRABAJO"
] as const;
export type ModoConsumo = (typeof MODO_CONSUMO)[number];

export interface RecetaItem {
  id: string;
  alcance: AlcanceReceta;
  precio_impresion_id: string | null;
  insumo_id: string | null;
  modo_consumo: ModoConsumo;
  cantidad: number;
  es_espiral_auto: boolean;
  /** Snapshot costo unitario insumo (SQL 19); se sincroniza al editar costo_base/contenido. */
  costo_unitario_reposicion?: number | null;
  created_at?: string;
  insumos?: { nombre: string } | null;
}

export type RecetaItemInput = Omit<
  RecetaItem,
  "id" | "created_at" | "insumos"
> & {
  insumo_id: string | null;
};
