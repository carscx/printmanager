/** Fila del catálogo `toner_modelos` (referencia física para insumos tóner). */
export interface TonerModeloReferencia {
  id: string;
  codigo: string | null;
  nombre: string;
  notas: string | null;
  gramos_por_cartucho: number;
  mg_por_cara: number;
  activo: boolean;
  orden: number;
  created_at?: string;
}

/** Solo UUIDs reales de Supabase deben guardarse en `insumos.toner_modelo_id`. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function esTonerModeloIdPersistible(id: string): boolean {
  return UUID_RE.test(id);
}
