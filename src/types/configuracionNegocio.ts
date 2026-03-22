/** Fila única id=1 en tabla configuracion_negocio (Supabase). */
export interface ConfiguracionNegocio {
  id: number;
  pct_desperdicio: number;
  pct_mantenimiento_maquinas: number;
  dias_vigencia_presupuesto: number;
  margen_objetivo_pct: number;
  updated_at?: string;
  updated_by?: string | null;
}
