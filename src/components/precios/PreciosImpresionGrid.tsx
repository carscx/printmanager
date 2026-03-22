import { useState, useMemo } from "react";
import { preciosApi } from "../../services/preciosApi";
import {
  costoVariablePorUnidadImpresion,
  margenSobreVenta,
  tieneCostoDirectoTarifaImpresion
} from "../../services/costEngine";
import { showToast } from "../ui/Toast";
import { formatCurrency } from "../../utils/formatters";
import { labelPrecioImpresion } from "../../types/precio";
import type { PrecioImpresion } from "../../types/precio";
import type { Insumo } from "../../types/insumo";
import type { Equipo } from "../../types/equipo";
import { MargenTarifaHint, type AvisoCostoTarifa } from "./MargenTarifaHint";

interface Props {
  precios: PrecioImpresion[];
  onReload: () => Promise<void>;
  onAjusteMasivo: () => void;
  insumos: Insumo[];
  equipos: Equipo[];
  costosListos: boolean;
}

export function PreciosImpresionGrid({
  precios,
  onReload,
  onAjusteMasivo,
  insumos: _insumos,
  equipos: _equipos,
  costosListos
}: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);

  const costoPorId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of precios) {
      m.set(p.id, costoVariablePorUnidadImpresion(p));
    }
    return m;
  }, [precios]);

  const iniciarEdicion = (p: PrecioImpresion) => {
    setEditando(p.id);
    setValor(String(p.precio_venta));
  };

  const guardar = async (id: string, precioAnterior: number) => {
    const num = parseFloat(valor);
    if (isNaN(num) || num < 0) return;
    const costo = costoPorId.get(id) ?? 0;
    const { margenPct: mAnt } = margenSobreVenta(precioAnterior, costo);
    const { margenPct: mNue, ganancia } = margenSobreVenta(num, costo);
    setSaving(true);
    try {
      await preciosApi.actualizarPrecioImpresion(id, num);
      if (ganancia < 0) {
        showToast(
          "PRECIO POR DEBAJO DEL COSTO VARIABLE ESTIMADO",
          "error"
        );
      } else if (
        mAnt != null &&
        mNue != null &&
        mNue < mAnt - 0.5
      ) {
        showToast(
          `Rentabilidad ${mAnt.toFixed(0)}% → ${mNue.toFixed(0)}% (${(mNue - mAnt).toFixed(1)} pts)`,
          "warning"
        );
      } else {
        showToast("PRECIO ACTUALIZADO");
      }
      setEditando(null);
      await onReload();
    } catch {
      showToast("ERROR AL GUARDAR", "error");
    } finally {
      setSaving(false);
    }
  };

  const cancelar = () => {
    setEditando(null);
    setValor("");
  };

  return (
    <div className="bg-white rounded-sm shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic leading-none">
            Precios por hoja (impresión)
          </h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-2 max-w-lg leading-snug">
            El costo variable viene de <strong>Reglas de negocio</strong> (más
            factor de seguridad en servidor). Si no cargaste reglas para una
            tarifa, el costo se muestra en $0 hasta que lo definas ahí.
          </p>
        </div>
        <button
          onClick={onAjusteMasivo}
          className="text-[10px] font-black text-blue-600 uppercase tracking-wider px-3 py-1.5 bg-blue-50 rounded-sm cursor-pointer active:scale-95 transition-transform"
        >
          <i className="fas fa-percent mr-1" />
          Ajuste masivo
        </button>
      </div>

      <div className="divide-y divide-slate-50">
        {precios.map((p) => {
          const costo = costoPorId.get(p.id) ?? 0;
          const avisoCosto: AvisoCostoTarifa =
            !tieneCostoDirectoTarifaImpresion(p) && costo < 0.005
              ? "sin_reglas"
              : null;
          const borrador =
            editando === p.id ? parseFloat(valor.replace(",", ".")) : NaN;
          return (
            <div
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 gap-3"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className={`w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0 ${
                    p.tipo === "bn"
                      ? "bg-slate-100 text-slate-500"
                      : "bg-gradient-to-br from-cyan-100 to-pink-100 text-pink-600"
                  }`}
                >
                  <i
                    className={`fas ${p.doble_faz ? "fa-layer-group" : "fa-file"} text-sm`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-700 leading-none truncate">
                    {labelPrecioImpresion(p.tipo, p.doble_faz)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                    por hoja cobrada
                  </p>
                  <MargenTarifaHint
                    precioVenta={Number(p.precio_venta)}
                    costoVariable={costo}
                    costosListos={costosListos}
                    avisoCosto={avisoCosto}
                    precioBorrador={
                      editando === p.id && !Number.isNaN(borrador)
                        ? borrador
                        : null
                    }
                  />
                </div>
              </div>

              {editando === p.id ? (
                <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        void guardar(p.id, Number(p.precio_venta));
                      if (e.key === "Escape") cancelar();
                    }}
                    autoFocus
                    className="w-24 p-2 bg-blue-50 rounded-sm font-black text-blue-700 text-right text-sm outline-none border border-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => void guardar(p.id, Number(p.precio_venta))}
                    disabled={saving}
                    className="w-9 h-9 rounded-sm bg-green-500 text-white flex items-center justify-center cursor-pointer active:scale-95"
                  >
                    <i className="fas fa-check text-xs" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelar}
                    className="w-9 h-9 rounded-sm bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer active:scale-95"
                  >
                    <i className="fas fa-times text-xs" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => iniciarEdicion(p)}
                  className="text-lg font-black text-blue-600 px-3 py-1 rounded-sm bg-blue-50/50 cursor-pointer active:scale-95 transition-transform self-end sm:self-center"
                >
                  {formatCurrency(p.precio_venta)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
