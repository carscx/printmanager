import { formatCurrency } from "../../utils/formatters";

/** Margen sobre ventas asumido para cubrir gastos fijos (objetivo operativo). */
export const MARGEN_OBJETIVO_EQUILIBRIO = 0.665;

interface PuntoDeEquilibrioCardProps {
  totalGastosFijosMes: number;
  /** Suma de ganancia_neta del mes (v_estadisticas_diarias, mes actual hasta hoy). */
  margenAcumuladoMes: number;
  loading?: boolean;
}

export function PuntoDeEquilibrioCard({
  totalGastosFijosMes,
  margenAcumuladoMes,
  loading = false
}: PuntoDeEquilibrioCardProps) {
  const ventasNecesarias =
    totalGastosFijosMes > 0 && MARGEN_OBJETIVO_EQUILIBRIO > 0
      ? totalGastosFijosMes / MARGEN_OBJETIVO_EQUILIBRIO
      : 0;

  const pctCubierto =
    totalGastosFijosMes > 0
      ? Math.min(100, (margenAcumuladoMes / totalGastosFijosMes) * 100)
      : margenAcumuladoMes > 0
        ? 100
        : 0;

  return (
    <div className="rounded-sm border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            Punto de equilibrio (mes)
          </h2>
          <p className="text-[10px] text-slate-500 font-semibold mt-1 max-w-xl leading-relaxed">
            Gastos fijos activos vs margen acumulado del mes (ganancia diaria en
            vista). Ventas necesarias asume margen objetivo{" "}
            {(MARGEN_OBJETIVO_EQUILIBRIO * 100).toFixed(1)}% sobre ingresos.
          </p>
        </div>
        {loading ? (
          <span className="text-slate-300 font-black">…</span>
        ) : (
          <div className="text-right shrink-0">
            <p className="text-[9px] font-black text-slate-400 uppercase">
              Ingresos necesarios (estim.)
            </p>
            <p className="text-lg font-black text-indigo-900 tabular-nums">
              {formatCurrency(ventasNecesarias)}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <div className="rounded-sm bg-white/80 border border-indigo-100 px-3 py-2">
          <p className="text-[9px] font-black text-slate-400 uppercase">
            Gastos fijos / mes
          </p>
          <p className="font-black text-slate-900 tabular-nums">
            {loading ? "—" : formatCurrency(totalGastosFijosMes)}
          </p>
        </div>
        <div className="rounded-sm bg-white/80 border border-indigo-100 px-3 py-2">
          <p className="text-[9px] font-black text-slate-400 uppercase">
            Margen acumulado (mes)
          </p>
          <p className="font-black text-emerald-700 tabular-nums">
            {loading ? "—" : formatCurrency(margenAcumuladoMes)}
          </p>
        </div>
        <div className="rounded-sm bg-white/80 border border-indigo-100 px-3 py-2">
          <p className="text-[9px] font-black text-slate-400 uppercase">
            Cobertura
          </p>
          <p className="font-black text-indigo-800 tabular-nums">
            {loading ? "—" : `${pctCubierto.toFixed(0)}%`}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
          <span>Margen vs gastos fijos del mes</span>
          <span>
            {loading
              ? "—"
              : `${formatCurrency(margenAcumuladoMes)} / ${formatCurrency(totalGastosFijosMes)}`}
          </span>
        </div>
        <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all duration-500"
            style={{ width: `${Math.min(100, pctCubierto)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
