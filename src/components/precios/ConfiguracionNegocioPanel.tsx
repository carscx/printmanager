import { useState, useEffect } from "react";
import { preciosApi } from "../../services/preciosApi";
import { showToast } from "../ui/Toast";
import type { ConfiguracionNegocio } from "../../types/configuracionNegocio";

interface Props {
  onReload?: () => void;
}

export function ConfiguracionNegocioPanel({ onReload }: Props) {
  const [row, setRow] = useState<ConfiguracionNegocio | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ok = true;
    preciosApi
      .fetchConfiguracionNegocio()
      .then((r) => {
        if (ok) {
          setRow(r);
          setLoadError(null);
        }
      })
      .catch((e: unknown) => {
        if (ok) {
          setRow(null);
          setLoadError(
            e instanceof Error ? e.message : "No se pudo cargar la configuración."
          );
        }
      })
      .finally(() => {
        if (ok) setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, []);

  const guardar = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await preciosApi.updateConfiguracionNegocio({
        pct_desperdicio: row.pct_desperdicio,
        pct_mantenimiento_maquinas: row.pct_mantenimiento_maquinas,
        dias_vigencia_presupuesto: row.dias_vigencia_presupuesto,
        margen_objetivo_pct: row.margen_objetivo_pct
      });
      showToast("CONFIGURACIÓN DE NEGOCIO GUARDADA");
      await onReload?.();
    } catch {
      showToast("ERROR AL GUARDAR", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <i className="fas fa-circle-notch fa-spin text-2xl text-blue-600" />
      </div>
    );
  }

  if (loadError || !row) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-sm p-5 text-sm text-amber-900 max-w-lg">
        <p className="font-bold mb-1">No se pudo cargar la configuración</p>
        <p className="text-amber-800/90">
          {loadError ??
            "Revisá que exista la fila id=1 en configuracion_negocio y que tengas sesión iniciada."}
        </p>
      </div>
    );
  }

  const setNum = (key: keyof ConfiguracionNegocio, v: string) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return;
    setRow((r) => (r ? { ...r, [key]: n } : r));
  };

  return (
    <div className="bg-white rounded-sm shadow-sm border border-slate-100 p-5 space-y-5 max-w-lg">
      <div>
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic">
          Motor de costos (Épica 1)
        </h3>
        <p className="text-[10px] text-slate-400 font-semibold mt-2 leading-snug">
          El costo real en base usa: costo insumos × (1 + desperdicio) × (1 +
          mantenimiento). Los márgenes de la vista SQL y el semáforo usan estos
          valores.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
            % Desperdicio
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={row.pct_desperdicio}
            onChange={(e) => setNum("pct_desperdicio", e.target.value)}
            className="w-full mt-1 bg-slate-50 p-3 rounded-sm font-black text-slate-800 border border-slate-100"
          />
        </div>
        <div>
          <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
            % Mantenimiento máquinas
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={row.pct_mantenimiento_maquinas}
            onChange={(e) => setNum("pct_mantenimiento_maquinas", e.target.value)}
            className="w-full mt-1 bg-slate-50 p-3 rounded-sm font-black text-slate-800 border border-slate-100"
          />
        </div>
        <div>
          <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
            Días vigencia presupuesto
          </label>
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            value={row.dias_vigencia_presupuesto}
            onChange={(e) =>
              setRow((r) =>
                r
                  ? {
                      ...r,
                      dias_vigencia_presupuesto: parseInt(e.target.value, 10) || 7
                    }
                  : r
              )
            }
            className="w-full mt-1 bg-slate-50 p-3 rounded-sm font-black text-slate-800 border border-slate-100"
          />
        </div>
        <div>
          <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
            Margen objetivo % (semáforo)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={row.margen_objetivo_pct}
            onChange={(e) => setNum("margen_objetivo_pct", e.target.value)}
            className="w-full mt-1 bg-slate-50 p-3 rounded-sm font-black text-slate-800 border border-slate-100"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void guardar()}
        disabled={saving}
        className="w-full bg-slate-900 text-white py-4 rounded-sm font-black uppercase text-xs tracking-widest cursor-pointer disabled:opacity-50"
      >
        {saving ? (
          <>
            <i className="fas fa-circle-notch fa-spin mr-2" />
            Guardando…
          </>
        ) : (
          "Guardar"
        )}
      </button>
    </div>
  );
}
