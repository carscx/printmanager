// Tipos de equipo
export const EQUIPO_TIPOS = ["inkjet", "laser"] as const;
export type EquipoTipo = (typeof EQUIPO_TIPOS)[number];

export const EQUIPO_TIPO_LABELS: Record<EquipoTipo, string> = {
  inkjet: "Inyección de tinta",
  laser: "Láser"
};

export const EQUIPO_TIPO_ICONS: Record<EquipoTipo, string> = {
  inkjet: "fa-droplet",
  laser: "fa-bolt"
};

export interface Equipo {
  id: string;
  nombre: string;
  tipo: EquipoTipo;
  costo_adquisicion: number;
  fecha_adquisicion: string | null;
  vida_util_meses: number;
  costo_mantenimiento_mensual: number;
  paginas_mes_estimadas: number;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type EquipoInput = Omit<Equipo, "id" | "created_at" | "updated_at">;

/** Costo de amortización + mantenimiento por página impresa */
export function calcularCostoPorPagina(equipo: Equipo): number {
  if (equipo.paginas_mes_estimadas <= 0) return 0;
  const amortMensual =
    equipo.vida_util_meses > 0
      ? equipo.costo_adquisicion / equipo.vida_util_meses
      : 0;
  return (
    (amortMensual + equipo.costo_mantenimiento_mensual) /
    equipo.paginas_mes_estimadas
  );
}
