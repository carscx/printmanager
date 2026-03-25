import { dashboardApi } from "./dashboardApi";
import type { EstadisticaDiaria } from "../types/dashboard";
import type { SerieDiaria } from "./rentabilidadReport";
import { toDateStringAR } from "../utils/dateAr";

export interface TotalesOperacion {
  totalIngresos: number;
  ingresosTransferencia: number;
  ingresosEfectivo: number;
  ingresosSinForma: number;
  totalInsumos: number;
  totalComisiones: number;
  gananciaNeta: number;
}

/**
 * Filas de `v_estadisticas_diarias` en rango (fecha AR YYYY-MM-DD).
 * Totales = suma de columnas por día (sin recalcular fórmulas en cliente).
 */
export async function fetchEstadisticasDiariasRango(
  desde: string,
  hasta: string
): Promise<EstadisticaDiaria[]> {
  return dashboardApi.fetchEstadisticasDiarias(desde, hasta);
}

export async function fetchTotalesOperacionRango(
  desde: string,
  hasta: string
): Promise<TotalesOperacion> {
  const rows = await fetchEstadisticasDiariasRango(desde, hasta);
  let totalIngresos = 0;
  let ingresosTransferencia = 0;
  let ingresosEfectivo = 0;
  let ingresosSinForma = 0;
  let totalInsumos = 0;
  let totalComisiones = 0;
  let gananciaNeta = 0;
  for (const r of rows) {
    totalIngresos += Number(r.total_ingresos);
    ingresosTransferencia += Number(r.ingresos_transferencia ?? 0);
    ingresosEfectivo += Number(r.ingresos_efectivo ?? 0);
    ingresosSinForma += Number(r.ingresos_sin_forma ?? 0);
    totalInsumos += Number(r.total_insumos);
    totalComisiones += Number(r.total_comisiones);
    gananciaNeta += Number(r.ganancia_neta);
  }
  return {
    totalIngresos,
    ingresosTransferencia,
    ingresosEfectivo,
    ingresosSinForma,
    totalInsumos,
    totalComisiones,
    gananciaNeta
  };
}

/** Serie diaria desde la vista: costos = insumos + comisiones por día (columnas DB). */
export async function fetchSerieDiariaVista(
  desde: string,
  hasta: string
): Promise<SerieDiaria[]> {
  const rows = await fetchEstadisticasDiariasRango(desde, hasta);
  const map = new Map(rows.map((r) => [r.dia, r]));
  const out: SerieDiaria[] = [];
  const cur = new Date(desde + "T12:00:00");
  const end = new Date(hasta + "T12:00:00");
  while (cur <= end) {
    const key = toDateStringAR(cur);
    const row = map.get(key);
    const ing = row ? Number(row.total_ingresos) : 0;
    const ins = row ? Number(row.total_insumos) : 0;
    const com = row ? Number(row.total_comisiones) : 0;
    out.push({
      fecha: key,
      ingresos: ing,
      costos: ins + com,
      ganancia: row ? Number(row.ganancia_neta) : 0
    });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
