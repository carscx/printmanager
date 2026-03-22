import { useState, useEffect } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { ActionSheet, ActionSheetTrigger } from "../ui/ActionSheet";
import type {
  PlantillaWhatsapp,
  PlantillaWhatsappInput,
  EstadoDestinoWhatsapp
} from "../../types/whatsapp";
import {
  ESTADOS_DESTINO_WHATSAPP,
  ESTADO_DESTINO_LABELS,
  VARIABLES_PLANTILLA
} from "../../types/whatsapp";

interface PlantillaFormSheetProps {
  open: boolean;
  onClose: () => void;
  plantilla: PlantillaWhatsapp | null;
  onSave: (data: PlantillaWhatsappInput) => Promise<void>;
}

const ESTADO_OPTS = ESTADOS_DESTINO_WHATSAPP.map((est) => ({
  value: est,
  label: ESTADO_DESTINO_LABELS[est]
}));

const defaultForm: PlantillaWhatsappInput = {
  estado_destino: "presupuesto",
  nombre: "",
  cuerpo: "",
  incluir_datos_pago: false,
  activo: true,
  orden: 0
};

export function PlantillaFormSheet({
  open,
  onClose,
  plantilla,
  onSave
}: PlantillaFormSheetProps) {
  const [sheetEstado, setSheetEstado] = useState(false);
  const isEdit = !!plantilla;
  const [form, setForm] = useState<PlantillaWhatsappInput>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (plantilla) {
      setForm({
        estado_destino: plantilla.estado_destino as EstadoDestinoWhatsapp,
        nombre: plantilla.nombre,
        cuerpo: plantilla.cuerpo,
        incluir_datos_pago: plantilla.incluir_datos_pago,
        activo: plantilla.activo,
        orden: plantilla.orden
      });
    } else {
      setForm(defaultForm);
    }
    setError("");
  }, [plantilla, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!form.cuerpo.trim()) {
      setError("El cuerpo del mensaje es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError("No se pudo guardar. Revisá los datos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar plantilla" : "Nueva plantilla"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-red-600 text-sm font-bold bg-red-50 p-3 rounded-sm">
            {error}
          </p>
        )}

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Nombre
          </label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Presupuesto"
            className="w-full p-3 rounded-sm bg-slate-50 border border-slate-100 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>

        <ActionSheetTrigger
          label="Estado del pedido"
          displayValue={
            ESTADO_DESTINO_LABELS[
              form.estado_destino as EstadoDestinoWhatsapp
            ]
          }
          onClick={() => setSheetEstado(true)}
        />

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Cuerpo del mensaje
          </label>
          <textarea
            value={form.cuerpo}
            onChange={(e) => setForm((f) => ({ ...f, cuerpo: e.target.value }))}
            placeholder="Hola {{cliente}}, ..."
            rows={8}
            className="w-full p-3 rounded-sm bg-slate-50 border border-slate-100 font-mono text-sm text-slate-800 outline-none focus:ring-2 focus:ring-green-100 resize-y"
          />
          <p className="mt-1 text-[10px] text-slate-400 font-bold">
            Variables: {VARIABLES_PLANTILLA.join(", ")}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.incluir_datos_pago}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  incluir_datos_pago: e.target.checked
                }))
              }
              className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm font-bold text-slate-700">
              Incluir datos de pago (alias, CBU)
            </span>
          </label>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) =>
                setForm((f) => ({ ...f, activo: e.target.checked }))
              }
              className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm font-bold text-slate-700">Activa</span>
          </label>
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Orden (prioridad si hay varias para el mismo estado)
          </label>
          <input
            type="number"
            min={0}
            value={form.orden}
            onChange={(e) =>
              setForm((f) => ({ ...f, orden: parseInt(e.target.value, 10) || 0 }))
            }
            className="w-24 p-3 rounded-sm bg-slate-50 border border-slate-100 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 font-bold text-slate-500 bg-slate-100 rounded-sm cursor-pointer active:bg-slate-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-4 bg-green-600 text-white font-black rounded-sm shadow-lg uppercase text-[10px] tracking-widest cursor-pointer disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving ? (
              <i className="fas fa-circle-notch fa-spin" />
            ) : isEdit ? (
              "Guardar"
            ) : (
              "Crear plantilla"
            )}
          </button>
        </div>
      </form>
    </BottomSheet>
    <ActionSheet
      open={sheetEstado}
      onClose={() => setSheetEstado(false)}
      title="Estado del pedido"
      options={ESTADO_OPTS}
      value={form.estado_destino}
      onChange={(v) =>
        setForm((f) => ({
          ...f,
          estado_destino: v as EstadoDestinoWhatsapp
        }))
      }
    />
    </>
  );
}
