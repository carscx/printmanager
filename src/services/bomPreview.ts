import type { ConfiguracionNegocio } from "../types/configuracionNegocio";

/** Alineado a SQL fn_costo_total_real_insumos */
export function fnCostoTotalRealInsumos(
  costoInsumos: number,
  cn: ConfiguracionNegocio
): number {
  const d = Number(cn.pct_desperdicio) / 100;
  const m = Number(cn.pct_mantenimiento_maquinas) / 100;
  if (!Number.isFinite(costoInsumos) || costoInsumos < 0) return 0;
  return Math.round(costoInsumos * (1 + d) * (1 + m) * 10000) / 10000;
}
