import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Insumo } from "../../types/insumo";
import { stockFisicoTexto } from "../../utils/insumoStockHuman";

interface Props {
  /**
   * Lista completa de insumos activos (recomendado en dashboard).
   * Si no se pasa, se usa `alertas` (solo bajo mínimo).
   */
  insumos?: Insumo[];
  /** Fallback: filas de `v_insumos_alerta_stock` o equivalente */
  alertas?: Insumo[];
  compact?: boolean;
  className?: string;
}

/** Umbral absoluto: papel (hojas) < 1000 */
const UMBRAL_PAPEL = 1000;
/** Tóner: carillas (págs.) &lt; 200; tinta: stock en ml &lt; 200 */
const UMBRAL_TONER_TINTA = 200;

function umbralCriticoAbsoluto(i: Insumo): boolean {
  const s = Number(i.stock_actual);
  if (i.categoria === "papel" && s < UMBRAL_PAPEL) return true;
  if (i.categoria === "toner" && s < UMBRAL_TONER_TINTA) return true;
  if (i.categoria === "tinta" && s < UMBRAL_TONER_TINTA) return true;
  return false;
}

function bajoMinimo(i: Insumo): boolean {
  return Number(i.stock_actual) <= Number(i.stock_minimo);
}

function necesitaAlerta(i: Insumo): boolean {
  return bajoMinimo(i) || umbralCriticoAbsoluto(i);
}

function esRojo(i: Insumo): boolean {
  return Number(i.stock_actual) <= 0 || umbralCriticoAbsoluto(i);
}

export function StockAlertasCriticas({
  insumos,
  alertas = [],
  compact,
  className = ""
}: Props) {
  const navigate = useNavigate();

  const lista = useMemo(() => {
    if (insumos && insumos.length > 0) {
      return [...insumos]
        .filter(necesitaAlerta)
        .sort((a, b) => {
          const ra = esRojo(a) ? 0 : 1;
          const rb = esRojo(b) ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return (a.nombre || "").localeCompare(b.nombre || "");
        });
    }
    return alertas;
  }, [insumos, alertas]);

  if (lista.length === 0) return null;

  if (compact) {
    const criticos = lista.filter(esRojo).length;
    return (
      <button
        type="button"
        onClick={() => navigate("/insumos")}
        className={`w-full text-left rounded-sm border px-3 py-2.5 transition-colors cursor-pointer ${
          criticos > 0
            ? "border-red-300 bg-red-50 hover:bg-red-100/90 animate-alert-pulse"
            : "border-amber-200 bg-amber-50 hover:bg-amber-100/90"
        } ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <i
            className={`fas shrink-0 ${
              criticos > 0
                ? "fa-circle-exclamation text-red-600"
                : "fa-triangle-exclamation text-amber-600"
            }`}
          />
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 truncate">
            Stock: {lista.length} alerta{lista.length === 1 ? "" : "s"}
            {criticos > 0 ? ` · ${criticos} crít.` : ""}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`rounded-sm border border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <i className="fas fa-boxes-stacked text-amber-600" />
          <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
            Alertas de stock
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/insumos")}
          className="text-[10px] font-bold text-blue-600 hover:underline shrink-0"
        >
          Ver insumos
        </button>
      </div>
      <p className="text-[10px] text-slate-500 mb-2 font-semibold">
        Rojo: stock ≤ 0, papel &lt; {UMBRAL_PAPEL} h., tóner &lt;{" "}
        {UMBRAL_TONER_TINTA} carillas, tinta &lt; {UMBRAL_TONER_TINTA} ml, o bajo
        mínimo configurado.
      </p>
      <ul className="space-y-2 max-h-48 overflow-y-auto">
        {lista.map((i) => {
          const rojo = esRojo(i);
          return (
            <li
              key={i.id}
              className={`flex items-center justify-between gap-2 rounded-sm px-3 py-2 text-xs font-semibold ${
                rojo
                  ? "bg-red-50 border border-red-200 text-red-900 animate-alert-pulse"
                  : "bg-white/80 border border-amber-100 text-amber-900"
              }`}
            >
              <span className="truncate flex items-center gap-2 min-w-0">
                {rojo ? (
                  <i className="fas fa-circle-exclamation text-red-600 shrink-0" />
                ) : (
                  <i className="fas fa-exclamation text-amber-600 shrink-0" />
                )}
                <span className="truncate">{i.nombre}</span>
                <span className="text-[9px] font-bold text-slate-400 shrink-0 uppercase">
                  {i.categoria}
                </span>
              </span>
              <span className="shrink-0 font-black tabular-nums">
                {stockFisicoTexto(i)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
