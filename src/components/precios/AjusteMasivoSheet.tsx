import { useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";

interface Props {
  tipo: "impresion" | "anillado";
  onAjustar: (porcentaje: number) => Promise<void>;
  onClose: () => void;
}

const PRESETS = [
  { label: "-10%", value: -10 },
  { label: "-5%", value: -5 },
  { label: "+5%", value: 5 },
  { label: "+10%", value: 10 },
  { label: "+15%", value: 15 },
  { label: "+20%", value: 20 }
];

export function AjusteMasivoSheet({ tipo, onAjustar, onClose }: Props) {
  const [porcentaje, setPorcentaje] = useState<number | "">(10);
  const [saving, setSaving] = useState(false);

  const handleAjustar = async () => {
    if (porcentaje === "" || porcentaje === 0) return;
    setSaving(true);
    await onAjustar(Number(porcentaje));
    setSaving(false);
  };

  return (
    <BottomSheet
      open
      title={`Ajuste masivo — ${tipo === "impresion" ? "Impresión" : "Anillado"}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Ajusta todos los precios de{" "}
          {tipo === "impresion" ? "impresión" : "anillado"} por un porcentaje.
          Los valores se redondean al entero más cercano.
        </p>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPorcentaje(p.value)}
              className={`px-4 py-2.5 rounded-sm text-xs font-black cursor-pointer transition-all active:scale-95 ${
                porcentaje === p.value
                  ? p.value < 0
                    ? "bg-red-500 text-white"
                    : "bg-green-500 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom */}
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            value={porcentaje}
            onChange={(e) =>
              setPorcentaje(
                e.target.value === "" ? "" : parseFloat(e.target.value)
              )
            }
            className="flex-1 p-3.5 bg-slate-50 rounded-sm font-black text-xl text-center outline-none border border-slate-100 focus:ring-2 focus:ring-blue-100"
            placeholder="0"
          />
          <span className="text-2xl font-black text-slate-300">%</span>
        </div>

        <button
          onClick={handleAjustar}
          disabled={saving || porcentaje === "" || porcentaje === 0}
          className="w-full bg-slate-900 text-white py-4 rounded-sm font-black uppercase text-xs tracking-[0.2em] shadow-xl cursor-pointer active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? (
            <>
              <i className="fas fa-circle-notch fa-spin mr-2" />
              Ajustando...
            </>
          ) : (
            `Aplicar ${porcentaje !== "" && porcentaje > 0 ? "+" : ""}${porcentaje || 0}%`
          )}
        </button>
      </div>
    </BottomSheet>
  );
}
