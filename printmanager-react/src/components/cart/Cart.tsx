import { ItemRow } from "../pedidos/ItemRow";
import { useCartStore } from "../../store/useCartStore";
import { formatCurrency } from "../../utils/formatters";
import { PAGO_LABELS } from "../../utils/constants";
import type { TipoPago } from "../../types/pedido";
import { useState } from "react";

const PAGO_OPTIONS: TipoPago[] = [
  "sin_pago",
  "sena_50",
  "sena_libre",
  "pago_total"
];
const PAGO_SHORT: Record<TipoPago, string> = {
  sin_pago: "Sin pago",
  sena_50: "50%",
  sena_libre: "Libre",
  pago_total: "Total"
};

interface CartProps {
  onFinalize: () => void;
  saving: boolean;
}

export function Cart({ onFinalize, saving }: CartProps) {
  const {
    items,
    tipoPago,
    senaLibreMonto,
    observaciones,
    removeItem,
    setTipoPago,
    setSenaLibreMonto,
    setObservaciones,
    getTotal,
    getSena,
    descRecGlobalTipo,
    descRecGlobalModo,
    descRecGlobalValor,
    setDescRecGlobalTipo,
    setDescRecGlobalModo,
    setDescRecGlobalValor
  } = useCartStore();

  const [showDescRecGlobal, setShowDescRecGlobal] = useState(false);

  // Calcular total con descuento/recargo global
  let total = getTotal();
  let descRecGlobalLabel = "";
  if (showDescRecGlobal && descRecGlobalValor) {
    const val = Number(descRecGlobalValor);
    if (descRecGlobalTipo === "descuento") {
      if (descRecGlobalModo === "porcentaje") {
        descRecGlobalLabel = `- ${val}%`;
        total -= Math.round(total * (val / 100));
      } else {
        descRecGlobalLabel = `- $${val}`;
        total -= val;
      }
    } else {
      if (descRecGlobalModo === "porcentaje") {
        descRecGlobalLabel = `+ ${val}%`;
        total += Math.round(total * (val / 100));
      } else {
        descRecGlobalLabel = `+ $${val}`;
        total += val;
      }
    }
  }
  const sena = getSena();
  const resta = total - sena;
  const canSave = items.length > 0 && !saving;

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col">
        <h2 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] mb-4 italic leading-none">
          Items del Pedido Actual
        </h2>

        {/* Items list */}
        <div className="space-y-3 flex-1 overflow-y-auto max-h-[40vh] mb-6">
          {items.length === 0 ? (
            <div className="text-center py-10 text-slate-300 italic text-sm">
              Aún no hay archivos sumados
            </div>
          ) : (
            items.map((item, idx) => (
              <ItemRow
                key={idx}
                item={item}
                index={idx}
                onRemove={removeItem}
              />
            ))
          )}
        </div>

        {/* Descuento/Recargo global */}
        <div className="mb-4">
          {!showDescRecGlobal ? (
            <button
              type="button"
              className="w-full bg-blue-50 text-blue-600 py-2 rounded-xl font-black uppercase text-xs tracking-widest shadow-sm border border-blue-100 hover:bg-blue-100 active:scale-95 transition mb-2"
              onClick={() => setShowDescRecGlobal(true)}
            >
              <i className="fas fa-percent mr-2" />
              Agregar descuento o recargo global
            </button>
          ) : (
            <div className="flex flex-col lg:flex-row gap-2 items-center mb-2">
              {/* Switch tipo */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`px-3 py-1 rounded-l-xl font-bold text-xs border ${descRecGlobalTipo === "descuento" ? "bg-green-100 text-green-700 border-green-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                  onClick={() => setDescRecGlobalTipo("descuento")}
                >
                  Descuento
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 rounded-r-xl font-bold text-xs border ${descRecGlobalTipo === "recargo" ? "bg-red-100 text-red-700 border-red-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                  onClick={() => setDescRecGlobalTipo("recargo")}
                >
                  Recargo
                </button>
              </div>
              {/* Switch modo */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`px-3 py-1 rounded-l-xl font-bold text-xs border ${descRecGlobalModo === "porcentaje" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                  onClick={() => setDescRecGlobalModo("porcentaje")}
                >
                  %
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 rounded-r-xl font-bold text-xs border ${descRecGlobalModo === "monto" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                  onClick={() => setDescRecGlobalModo("monto")}
                >
                  $ fijo
                </button>
              </div>
              {/* Input valor */}
              <input
                type="number"
                min="0"
                value={descRecGlobalValor}
                onChange={(e) => setDescRecGlobalValor(e.target.value)}
                placeholder={descRecGlobalModo === "porcentaje" ? "%" : "$"}
                className="w-24 p-2 rounded-xl border border-slate-200 text-center font-black text-blue-700 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-red-500 ml-2"
                onClick={() => {
                  setShowDescRecGlobal(false);
                  setDescRecGlobalValor("");
                }}
              >
                <i className="fas fa-times-circle" />
              </button>
            </div>
          )}
        </div>

        {/* Payment section */}
        <div className="p-6 bg-slate-900 rounded-3xl text-white shadow-xl mt-auto">
          <div className="flex justify-between items-center mb-4 leading-none">
            <span className="text-slate-500 font-black text-[10px] uppercase tracking-widest">
              Total Pedido
            </span>
            <div className="flex flex-col items-end">
              {descRecGlobalLabel && (
                <span className="text-xs font-bold text-blue-500 mb-0.5">
                  {descRecGlobalTipo === "descuento" ? "Descuento" : "Recargo"}{" "}
                  global: {descRecGlobalLabel}
                </span>
              )}
              <span className="text-3xl font-black text-green-400">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1 bg-slate-800 p-1 rounded-xl mb-3">
            {PAGO_OPTIONS.map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setTipoPago(tipo)}
                className={`py-2 rounded-lg text-[8px] font-black uppercase tracking-wider cursor-pointer ${
                  tipoPago === tipo
                    ? "bg-white/10 text-white"
                    : "text-slate-500"
                }`}
              >
                {PAGO_SHORT[tipo]}
              </button>
            ))}
          </div>

          {tipoPago === "sena_libre" && (
            <div className="mb-3">
              <input
                type="number"
                value={senaLibreMonto || ""}
                onChange={(e) =>
                  setSenaLibreMonto(parseInt(e.target.value) || 0)
                }
                placeholder="Monto de seña"
                className="w-full p-3 bg-slate-800 rounded-xl text-white font-black text-center border border-slate-700 outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-white/10 leading-none">
            <span className="text-slate-500 font-bold text-xs uppercase tracking-tighter">
              {PAGO_LABELS[tipoPago] || "Seña"}
            </span>
            <span className="font-black text-blue-400">
              {formatCurrency(sena)}
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 leading-none">
            <span className="text-slate-500 font-bold text-xs uppercase tracking-tighter">
              Resta
            </span>
            <span className="font-black text-amber-400">
              {formatCurrency(resta)}
            </span>
          </div>
        </div>

        {/* Observations */}
        <div className="mt-4 space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-widest text-center block">
            Observaciones Generales
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ej: Trae hojas propias, entregar urgente..."
            className="w-full p-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-green-100 font-bold border border-slate-100 transition-all text-xs h-20 resize-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={onFinalize}
          disabled={!canSave}
          className={`w-full mt-4 bg-green-500 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-green-600 active:scale-95 transition-all cursor-pointer ${
            !canSave ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {saving ? (
            <>
              <i className="fas fa-circle-notch fa-spin mr-2" />
              Guardando...
            </>
          ) : (
            "Cerrar y Guardar Pedido"
          )}
        </button>
      </div>
    </div>
  );
}
