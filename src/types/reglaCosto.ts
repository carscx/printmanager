export interface ReglaCosto {
  id: string;
  precio_impresion_id: string | null;
  precio_anillado_id: string | null;
  insumo_id: string | null;
  cantidad_usada: number;
  activo: boolean;
  created_at?: string;
}

export type ReglaCostoInput = Omit<ReglaCosto, "id" | "created_at">;
