import { useState } from "react";
import { preciosApi } from "../../services/preciosApi";
import { showToast } from "../ui/Toast";
import { CONFIG_COSTO_LABELS } from "../../types/precio";
import type { ConfigCosto } from "../../types/precio";

interface Props {
  configCostos: ConfigCosto[];
  onReload: () => Promise<void>;
}

export function ConfigCostosPanel({ configCostos, onReload }: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);

  const iniciarEdicion = (c: ConfigCosto) => {
    setEditando(c.key);
    setValor(String(c.value));
  };

  const guardar = async (key: string) => {
    setSaving(true);
    try {
      await preciosApi.actualizarConfigCosto(key, valor);
      showToast("CONFIGURACIÓN ACTUALIZADA");
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
      <div className="p-4">
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic leading-none">
          Configuración de Costos
        </h3>
      </div>

      <div className="divide-y divide-slate-50">
        {configCostos.map((c) => (
          <div
            key={c.key}
            className="flex items-center justify-between px-4 py-3 gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-700 leading-none truncate">
                {CONFIG_COSTO_LABELS[c.key] || c.key}
              </p>
              {c.descripcion && (
                <p className="text-[10px] text-slate-400 mt-0.5 leading-none truncate">
                  {c.descripcion}
                </p>
              )}
            </div>

            {editando === c.key ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="text"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") guardar(c.key);
                    if (e.key === "Escape") cancelar();
                  }}
                  autoFocus
                  className="w-32 p-2 bg-slate-100 rounded-sm font-black text-slate-700 text-right text-sm outline-none border border-slate-200"
                />
                <button
                  onClick={() => guardar(c.key)}
                  disabled={saving}
                  className="w-9 h-9 rounded-sm bg-green-500 text-white flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <i className="fas fa-check text-xs" />
                </button>
                <button
                  onClick={cancelar}
                  className="w-9 h-9 rounded-sm bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <i className="fas fa-times text-xs" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => iniciarEdicion(c)}
                className="text-lg font-black text-slate-600 px-3 py-1 rounded-sm bg-slate-50 cursor-pointer active:scale-95 transition-transform"
              >
                {c.value}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
