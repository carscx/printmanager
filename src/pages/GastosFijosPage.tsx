import { useCallback, useEffect, useState } from "react";
import {
  fetchGastosFijos,
  insertGastoFijo,
  updateGastoFijo,
  deleteGastoFijo
} from "../services/gastosFijosApi";
import type { CategoriaGastoFijo, GastoFijo } from "../types/gastoFijo";
import { CATEGORIA_GASTO_LABEL } from "../types/gastoFijo";
import { formatCurrency } from "../utils/formatters";
import { showToast } from "../components/ui/Toast";

const CATEGORIAS: CategoriaGastoFijo[] = [
  "impuestos",
  "servicios",
  "amortizacion",
  "sueldo_personal"
];

const emptyForm = {
  concepto: "",
  monto: "",
  categoria: "servicios" as CategoriaGastoFijo,
  dia_vencimiento: "" as string,
  activo: true
};

export function GastosFijosPage() {
  const [rows, setRows] = useState<GastoFijo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchGastosFijos();
      setRows(data);
    } catch (e) {
      console.error(e);
      showToast("ERROR AL CARGAR GASTOS FIJOS", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseFloat(form.monto.replace(",", "."));
    if (!form.concepto.trim()) {
      showToast("COMPLETÁ EL CONCEPTO", "error");
      return;
    }
    if (!Number.isFinite(m) || m < 0) {
      showToast("MONTO INVÁLIDO", "error");
      return;
    }
    const dv = form.dia_vencimiento.trim()
      ? parseInt(form.dia_vencimiento, 10)
      : null;
    if (dv != null && (dv < 1 || dv > 28)) {
      showToast("DÍA DE VENCIMIENTO: 1 A 28", "error");
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        await updateGastoFijo(editId, {
          concepto: form.concepto.trim(),
          monto: m,
          categoria: form.categoria,
          dia_vencimiento: dv,
          activo: form.activo
        });
        showToast("GASTO ACTUALIZADO");
      } else {
        await insertGastoFijo({
          concepto: form.concepto.trim(),
          monto: m,
          categoria: form.categoria,
          dia_vencimiento: dv,
          activo: form.activo
        });
        showToast("GASTO CARGADO");
      }
      resetForm();
      await cargar();
    } catch (err) {
      console.error(err);
      showToast("ERROR AL GUARDAR", "error");
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (g: GastoFijo) => {
    setEditId(g.id);
    setForm({
      concepto: g.concepto,
      monto: String(g.monto),
      categoria: g.categoria,
      dia_vencimiento: g.dia_vencimiento != null ? String(g.dia_vencimiento) : "",
      activo: g.activo
    });
  };

  const onDelete = async (g: GastoFijo) => {
    if (!confirm(`¿Eliminar «${g.concepto}»?`)) return;
    try {
      await deleteGastoFijo(g.id);
      showToast("ELIMINADO");
      if (editId === g.id) resetForm();
      await cargar();
    } catch (err) {
      console.error(err);
      showToast("ERROR AL ELIMINAR", "error");
    }
  };

  const totalActivos = rows
    .filter((r) => r.activo)
    .reduce((s, r) => s + Number(r.monto), 0);

  return (
    <section className="animate-fade-in max-w-3xl mx-auto pb-24 space-y-6 min-w-0">
      <header>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Administración
        </p>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          Gastos fijos
        </h1>
        <p className="text-xs text-slate-500 font-semibold mt-1">
          Solo administradores. Se usan en el panel (punto de equilibrio, EBITDA)
          y en el retiro sugerido del reporte.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="bg-white rounded-sm border border-slate-200 p-5 shadow-sm space-y-4"
      >
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {editId ? "Editar gasto" : "Nuevo gasto"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Concepto
            </label>
            <input
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm"
              placeholder="Ej: Monotributo"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Monto mensual ($)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form.monto}
              onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm tabular-nums"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Categoría
            </label>
            <select
              value={form.categoria}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  categoria: e.target.value as CategoriaGastoFijo
                }))
              }
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm bg-white"
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_GASTO_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Día vencimiento (1–28)
            </label>
            <input
              type="number"
              min={1}
              max={28}
              value={form.dia_vencimiento}
              onChange={(e) =>
                setForm((f) => ({ ...f, dia_vencimiento: e.target.value }))
              }
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm"
              placeholder="Opcional"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, activo: e.target.checked }))
                }
                className="w-4 h-4 rounded border-slate-300"
              />
              Activo
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-sm bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Guardando…" : editId ? "Actualizar" : "Guardar"}
          </button>
          {editId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2.5 rounded-sm border border-slate-200 text-[10px] font-black uppercase text-slate-600"
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      <div className="bg-slate-900 text-white rounded-sm p-4 flex justify-between items-center">
        <span className="text-[10px] font-black uppercase text-slate-400">
          Total mensual (activos)
        </span>
        <span className="text-xl font-black tabular-nums">
          {loading ? "…" : formatCurrency(totalActivos)}
        </span>
      </div>

      <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm">
        <h2 className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
          Listado
        </h2>
        {loading ? (
          <p className="p-6 text-sm text-slate-400">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-400 italic">Sin registros</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((g) => (
              <li
                key={g.id}
                className={`px-4 py-3 flex flex-wrap items-center justify-between gap-2 ${!g.activo ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <p className="font-black text-slate-900 truncate">{g.concepto}</p>
                  <p className="text-[10px] font-bold text-slate-500">
                    {CATEGORIA_GASTO_LABEL[g.categoria]}
                    {g.dia_vencimiento != null ? ` · Vence ${g.dia_vencimiento}` : ""}
                    {!g.activo ? " · Inactivo" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-black text-slate-900 tabular-nums">
                    {formatCurrency(Number(g.monto))}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(g)}
                    className="p-2 rounded-sm border border-slate-200 text-slate-500 hover:bg-slate-50"
                    aria-label="Editar"
                  >
                    <i className="fas fa-pen" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(g)}
                    className="p-2 rounded-sm border border-slate-200 text-red-500 hover:bg-red-50"
                    aria-label="Eliminar"
                  >
                    <i className="fas fa-trash-alt" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
