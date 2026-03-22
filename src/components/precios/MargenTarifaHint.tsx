import { formatCurrency } from "../../utils/formatters";
import { margenSobreVenta } from "../../services/costEngine";

/** Sin costo directo cargado (reglas de negocio / motor SQL). */
export type AvisoCostoTarifa = "sin_reglas" | null;

interface Props {
  precioVenta: number;
  costoVariable: number;
  costosListos: boolean;
  precioBorrador?: number | null;
  avisoCosto?: AvisoCostoTarifa;
}

function colorMargen(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  if (pct < 0) return "text-red-600";
  if (pct < 15) return "text-amber-600";
  return "text-emerald-600";
}

export function MargenTarifaHint({
  precioVenta,
  costoVariable,
  costosListos,
  precioBorrador,
  avisoCosto
}: Props) {
  if (!costosListos) {
    return (
      <p className="text-[10px] text-slate-400 font-semibold mt-1 leading-snug">
        Cargando costos…
      </p>
    );
  }

  const costo = Number(costoVariable) || 0;
  const sinCosto = costo < 0.005;

  const vigente = margenSobreVenta(precioVenta, costo);
  const borrador =
    precioBorrador != null && Number.isFinite(precioBorrador)
      ? margenSobreVenta(precioBorrador, costo)
      : null;

  if (sinCosto) {
    if (avisoCosto === "sin_reglas") {
      return (
        <p className="text-[10px] text-amber-800 font-bold mt-1 leading-snug">
          Costo: {formatCurrency(0)} — Definí componentes en{" "}
          <span className="font-black">Precios → Reglas de negocio</span> para
          esta tarifa (o revisá rendimiento de insumos).
        </p>
      );
    }
    return (
      <p className="text-[10px] text-amber-700/90 font-bold mt-1 leading-snug">
        Sin costo variable estimado · revisá reglas de negocio e insumos
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-[10px] text-slate-500 font-semibold leading-none">
        Costo var. {formatCurrency(costo)} · Margen{" "}
        <span className={colorMargen(vigente.margenPct)}>
          {vigente.margenPct != null
            ? `${vigente.margenPct.toFixed(1)}%`
            : "—"}
        </span>
      </p>
      {borrador &&
        precioBorrador != null &&
        precioBorrador !== precioVenta &&
        borrador.margenPct != null &&
        vigente.margenPct != null && (
          <p
            className={`text-[10px] font-black uppercase tracking-wide ${colorMargen(borrador.margenPct)}`}
          >
            Con {formatCurrency(precioBorrador)}:{" "}
            {borrador.margenPct.toFixed(1)}% rentabilidad
            {borrador.margenPct < vigente.margenPct - 0.05 && (
              <span className="text-slate-600 font-bold normal-case ml-1">
                (↓ {(vigente.margenPct - borrador.margenPct).toFixed(1)} pts)
              </span>
            )}
          </p>
        )}
    </div>
  );
}
