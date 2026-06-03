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

function esPapelComun(i: Insumo): boolean {
  if (i.categoria !== "papel") return false;

  const tipo = (i.tipo_papel ?? "").toLowerCase();
  const hojasPorResma = Number(i.hojas_por_unidad ?? i.rendimiento ?? 0);

  // Detecta papeles especiales por etiqueta explícita.
  const marcaEspecial =
    /matte|mate|glossy|satin|satinado|autoadhesivo|adhesivo|opalina|ilustracion|ilustración|couche|couché|cartulina|sulfito|kraft|etiqueta|vinilo|transparente/.test(
      tipo
    );
  if (marcaEspecial) return false;

  const marcaComun =
    /comun|común|obra|bond|blanco|copia|fotocopia|75g|80g/.test(tipo);
  if (marcaComun) return true;

  // Fallback operativo: papel común suele ser resma de 500 hojas.
  return hojasPorResma >= 400;
}

function umbralPreventivoAbsoluto(i: Insumo): boolean {
  const s = Number(i.stock_actual);
  if (i.categoria === "papel" && esPapelComun(i) && s < UMBRAL_PAPEL)
    return true;
  if (i.categoria === "toner" && s < UMBRAL_TONER_TINTA) return true;
  if (i.categoria === "tinta" && s < UMBRAL_TONER_TINTA) return true;
  return false;
}

function bajoMinimo(i: Insumo): boolean {
  return Number(i.stock_actual) <= Number(i.stock_minimo);
}

function esCritica(i: Insumo): boolean {
  return Number(i.stock_actual) <= 0 || bajoMinimo(i);
}

function esPreventiva(i: Insumo): boolean {
  return !esCritica(i) && umbralPreventivoAbsoluto(i);
}

export function StockAlertasCriticas({
  insumos,
  alertas = [],
  compact,
  className = ""
}: Props) {
  const navigate = useNavigate();

  const listas = useMemo(() => {
    if (insumos && insumos.length > 0) {
      const criticas = [...insumos]
        .filter(esCritica)
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
      const preventivas = [...insumos]
        .filter(esPreventiva)
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
      return { criticas, preventivas };
    }
    // Fallback legacy: `alertas` viene de bajo mínimo.
    return { criticas: alertas, preventivas: [] as Insumo[] };
  }, [insumos, alertas]);

  const total = listas.criticas.length + listas.preventivas.length;

  if (total === 0) return null;

  if (compact) {
    const criticos = listas.criticas.length;
    const preventivos = listas.preventivas.length;
    return (
      <button
        type="button"
        onClick={() => navigate("/insumos")}
        className={`w-full text-left rounded-sm border px-3 py-2.5 transition-colors cursor-pointer ${criticos > 0
            ? "border-red-300 bg-red-50 hover:bg-red-100/90 animate-alert-pulse"
            : "border-amber-200 bg-amber-50 hover:bg-amber-100/90"
          } ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <i
            className={`fas shrink-0 ${criticos > 0
                ? "fa-circle-exclamation text-red-600"
                : "fa-triangle-exclamation text-amber-600"
              }`}
          />
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 truncate">
            Stock: {total} alerta{total === 1 ? "" : "s"}
            {criticos > 0 ? ` · ${criticos} crít.` : ""}
            {preventivos > 0 ? ` · ${preventivos} prev.` : ""}
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
        Crítico: stock ≤ 0 o bajo mínimo configurado. Preventivo: papel común
        &lt; {UMBRAL_PAPEL} h., tóner &lt; {UMBRAL_TONER_TINTA} carillas, tinta &lt;{" "}
        {UMBRAL_TONER_TINTA} ml.
      </p>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {listas.criticas.length > 0 && (
          <>
            <p className="text-[10px] font-black uppercase tracking-wider text-red-700">
              Críticas ({listas.criticas.length})
            </p>
            <ul className="space-y-2">
              {listas.criticas.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 rounded-sm px-3 py-2 text-xs font-semibold bg-red-50 border border-red-200 text-red-900 animate-alert-pulse"
                >
                  <span className="truncate flex items-center gap-2 min-w-0">
                    <i className="fas fa-circle-exclamation text-red-600 shrink-0" />
                    <span className="truncate">{i.nombre}</span>
                    <span className="text-[9px] font-bold text-slate-400 shrink-0 uppercase">
                      {i.categoria}
                    </span>
                  </span>
                  <span className="shrink-0 font-black tabular-nums">
                    {stockFisicoTexto(i)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {listas.preventivas.length > 0 && (
          <>
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 mt-2">
              Preventivas ({listas.preventivas.length})
            </p>
            <ul className="space-y-2">
              {listas.preventivas.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 rounded-sm px-3 py-2 text-xs font-semibold bg-white/80 border border-amber-100 text-amber-900"
                >
                  <span className="truncate flex items-center gap-2 min-w-0">
                    <i className="fas fa-exclamation text-amber-600 shrink-0" />
                    <span className="truncate">{i.nombre}</span>
                    <span className="text-[9px] font-bold text-slate-400 shrink-0 uppercase">
                      {i.categoria}
                    </span>
                  </span>
                  <span className="shrink-0 font-black tabular-nums">
                    {stockFisicoTexto(i)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
