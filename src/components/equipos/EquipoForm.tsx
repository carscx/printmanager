import { useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import type { Equipo, EquipoInput, EquipoTipo } from "../../types/equipo";
import { EQUIPO_TIPOS, EQUIPO_TIPO_LABELS } from "../../types/equipo";

interface EquipoFormProps {
  equipo?: Equipo | null;
  onSave: (data: EquipoInput) => Promise<void>;
  onClose: () => void;
}

export function EquipoForm({ equipo, onSave, onClose }: EquipoFormProps) {
  const isEdit = !!equipo;

  const [nombre, setNombre] = useState(equipo?.nombre ?? "");
  const [tipo, setTipo] = useState<EquipoTipo>(equipo?.tipo ?? "inkjet");
  const [costoAdq, setCostoAdq] = useState(
    equipo?.costo_adquisicion?.toString() ?? "0"
  );
  const [fechaAdq, setFechaAdq] = useState(equipo?.fecha_adquisicion ?? "");
  const [vidaUtil, setVidaUtil] = useState(
    equipo?.vida_util_meses?.toString() ?? "36"
  );
  const [costoMant, setCostoMant] = useState(
    equipo?.costo_mantenimiento_mensual?.toString() ?? "0"
  );
  const [paginasMes, setPaginasMes] = useState(
    equipo?.paginas_mes_estimadas?.toString() ?? "3000"
  );
  const [notas, setNotas] = useState(equipo?.notas ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    setSaving(true);
    try {
      await onSave({
        nombre: nombre.trim(),
        tipo,
        costo_adquisicion: parseFloat(costoAdq) || 0,
        fecha_adquisicion: fechaAdq || null,
        vida_util_meses: parseInt(vidaUtil) || 36,
        costo_mantenimiento_mensual: parseFloat(costoMant) || 0,
        paginas_mes_estimadas: parseInt(paginasMes) || 3000,
        activo: equipo?.activo ?? true,
        notas: notas.trim() || null
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title={isEdit ? "Editar Equipo" : "Nuevo Equipo"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nombre */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Nombre del equipo
          </label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Epson L3250, Pantum P2509w..."
            required
            className="w-full p-3.5 bg-slate-50 rounded-sm font-bold border border-slate-100 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        {/* Tipo - tabs */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Tipo de impresora
          </label>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPO_TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`py-3 rounded-sm text-xs font-bold cursor-pointer transition-colors active:scale-95 ${
                  tipo === t
                    ? "bg-blue-600 text-white shadow"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <i
                  className={`fas ${t === "inkjet" ? "fa-droplet" : "fa-bolt"} mr-1.5`}
                />
                {EQUIPO_TIPO_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Costo adquisición + Fecha */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Costo adquisición ($)
            </label>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={costoAdq}
              onChange={(e) => setCostoAdq(e.target.value)}
              className="w-full p-3.5 bg-slate-50 rounded-sm font-black text-green-700 border border-slate-100 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Fecha de compra
            </label>
            <input
              type="date"
              value={fechaAdq}
              onChange={(e) => setFechaAdq(e.target.value)}
              className="w-full p-3.5 bg-slate-50 rounded-sm font-bold border border-slate-100 outline-none"
            />
          </div>
        </div>

        {/* Vida útil + Mantenimiento + Páginas/mes */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Vida útil (meses)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={vidaUtil}
              onChange={(e) => setVidaUtil(e.target.value)}
              className="w-full p-3.5 bg-slate-50 rounded-sm font-black border border-slate-100 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Mant. mensual ($)
            </label>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={costoMant}
              onChange={(e) => setCostoMant(e.target.value)}
              className="w-full p-3.5 bg-slate-50 rounded-sm font-black border border-slate-100 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
              Págs/mes est.
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={paginasMes}
              onChange={(e) => setPaginasMes(e.target.value)}
              className="w-full p-3.5 bg-slate-50 rounded-sm font-black border border-slate-100 outline-none"
            />
          </div>
        </div>

        {/* Notas */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">
            Notas (opcional)
          </label>
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ubicación, estado, observaciones..."
            className="w-full p-3.5 bg-slate-50 rounded-sm font-semibold text-sm border border-slate-100 outline-none"
          />
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 font-bold text-slate-400 text-sm cursor-pointer bg-slate-50 rounded-sm active:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !nombre.trim()}
            className="flex-1 py-4 bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest rounded-sm shadow-lg cursor-pointer disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving ? (
              <>
                <i className="fas fa-circle-notch fa-spin mr-2" />
                Guardando...
              </>
            ) : isEdit ? (
              "Guardar Cambios"
            ) : (
              "Crear Equipo"
            )}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
