import { useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { CONFIG_LABELS } from "../../types/config";
import type { AppConfig } from "../../types/config";

interface ConfigPanelProps {
  settings: AppConfig;
  onSave: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

export function ConfigPanel({ settings, onSave, onClose }: ConfigPanelProps) {
  const [values, setValues] = useState<Record<string, string>>({ ...settings });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } catch {
      // Toast handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open title="Tarifas y Datos" onClose={onClose}>
      <div className="space-y-3 -mx-1">
        {Object.entries(values).map(([key, val]) => (
          <div
            key={key}
            className="bg-slate-50 p-3 rounded-xl border border-slate-100"
          >
            <label className="block text-[8px] font-black text-blue-600 uppercase mb-0.5 tracking-widest leading-none">
              {CONFIG_LABELS[key] || key}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={val}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [key]: e.target.value }))
              }
              className="w-full bg-white p-2.5 rounded-lg font-black text-slate-800 outline-none border border-slate-100 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        ))}
      </div>

      <div className="pt-4 sticky bottom-0 bg-white -mx-1 px-1 pb-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl cursor-pointer disabled:opacity-50 active:scale-95 transition-transform"
        >
          {saving ? (
            <>
              <i className="fas fa-circle-notch fa-spin mr-2" />
              Guardando...
            </>
          ) : (
            "Guardar Cambios"
          )}
        </button>
      </div>
    </BottomSheet>
  );
}
