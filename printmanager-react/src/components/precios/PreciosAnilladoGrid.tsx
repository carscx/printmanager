import { useState } from "react";
import { preciosApi } from "../../services/preciosApi";
import { showToast } from "../ui/Toast";
import { formatCurrency } from "../../utils/formatters";
import type { PrecioAnillado } from "../../types/precio";

interface Props {
  precios: PrecioAnillado[];
  onReload: () => Promise<void>;
  onAjusteMasivo: () => void;
}

export function PreciosAnilladoGrid({
  precios,
  onReload,
  onAjusteMasivo
}: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);

  const iniciarEdicion = (p: PrecioAnillado) => {
    setEditando(p.id);
    setValor(String(p.precio_venta));
  };

  const guardar = async (id: string) => {
    const num = parseFloat(valor);
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    try {
      await preciosApi.actualizarPrecioAnillado(id, num);
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

  const handleToggle = async (p: PrecioAnillado) => {
    try {
      await preciosApi.toggleAnilladoActivo(p.id, !p.activo);
      showToast(p.activo ? "DESACTIVADO" : "ACTIVADO");
      await onReload();
    } catch {
      showToast("ERROR", "error");
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic leading-none">
          Precios Anillado
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
            className={`flex items-center justify-between px-4 py-3 gap-3 ${
              !p.activo ? "opacity-40" : ""
            }`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-black text-amber-600">
                  {p.medida_mm}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-700 leading-none">
                  {p.medida_mm}mm
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                  {p.paginas_max
                    ? `hasta ${p.paginas_max} hojas`
                    : "sin límite"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {editando === p.id ? (
                <>
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
                    className="w-20 p-2 bg-amber-50 rounded-lg font-black text-amber-700 text-right text-sm outline-none border border-amber-200"
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
                </>
              ) : (
                <>
                  <button
                    onClick={() => iniciarEdicion(p)}
                    className="text-lg font-black text-amber-600 px-3 py-1 rounded-lg bg-amber-50/50 cursor-pointer active:scale-95 transition-transform"
                  >
                    {formatCurrency(p.precio_venta)}
                  </button>
                  <button
                    onClick={() => handleToggle(p)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                      p.activo
                        ? "bg-green-50 text-green-500"
                        : "bg-red-50 text-red-400"
                    }`}
                  >
                    <i
                      className={`fas ${p.activo ? "fa-eye" : "fa-eye-slash"} text-xs`}
                    />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
