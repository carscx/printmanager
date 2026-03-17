import { useState } from "react";
import { preciosApi } from "../../services/preciosApi";
import { showToast } from "../ui/Toast";
import { formatCurrency } from "../../utils/formatters";
import { labelPrecioImpresion } from "../../types/precio";
import type { PrecioImpresion } from "../../types/precio";

interface Props {
  precios: PrecioImpresion[];
  onReload: () => Promise<void>;
  onAjusteMasivo: () => void;
}

export function PreciosImpresionGrid({
  precios,
  onReload,
  onAjusteMasivo
}: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);

  const iniciarEdicion = (p: PrecioImpresion) => {
    setEditando(p.id);
    setValor(String(p.precio_venta));
  };

  const guardar = async (id: string) => {
    const num = parseFloat(valor);
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    try {
      await preciosApi.actualizarPrecioImpresion(id, num);
      showToast("PRECIO ACTUALIZADO");
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
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic leading-none">
          Precios por Hoja
        </h3>
        <button
          onClick={onAjusteMasivo}
          className="text-[10px] font-black text-blue-600 uppercase tracking-wider px-3 py-1.5 bg-blue-50 rounded-lg cursor-pointer active:scale-95 transition-transform"
        >
          <i className="fas fa-percent mr-1" />
          Ajuste masivo
        </button>
      </div>

      <div className="divide-y divide-slate-50">
        {precios.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between px-4 py-3 gap-3"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  p.tipo === "bn"
                    ? "bg-slate-100 text-slate-500"
                    : "bg-gradient-to-br from-cyan-100 to-pink-100 text-pink-600"
                }`}
              >
                <i
                  className={`fas ${p.doble_faz ? "fa-layer-group" : "fa-file"} text-sm`}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-700 leading-none truncate">
                  {labelPrecioImpresion(p.tipo, p.doble_faz)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                  por hoja
                </p>
              </div>
            </div>

            {editando === p.id ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  inputMode="numeric"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") guardar(p.id);
                    if (e.key === "Escape") cancelar();
                  }}
                  autoFocus
                  className="w-20 p-2 bg-blue-50 rounded-lg font-black text-blue-700 text-right text-sm outline-none border border-blue-200"
                />
                <button
                  onClick={() => guardar(p.id)}
                  disabled={saving}
                  className="w-9 h-9 rounded-lg bg-green-500 text-white flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <i className="fas fa-check text-xs" />
                </button>
                <button
                  onClick={cancelar}
                  className="w-9 h-9 rounded-lg bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <i className="fas fa-times text-xs" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => iniciarEdicion(p)}
                className="text-lg font-black text-blue-600 px-3 py-1 rounded-lg bg-blue-50/50 cursor-pointer active:scale-95 transition-transform"
              >
                {formatCurrency(p.precio_venta)}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
