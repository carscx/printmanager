import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteTonerModelo,
  fetchTonerModelosTodos,
  insertTonerModelo,
  updateTonerModelo,
  type TonerModeloUpsert
} from "../services/tonerModelosApi";
import type { TonerModeloReferencia } from "../types/tonerModelo";
import { tonerPaginasPorCartuchoDesdeFisica } from "../services/bomCosto";
import { showToast } from "../components/ui/Toast";

const emptyForm = {
  codigo: "",
  nombre: "",
  notas: "",
  gramos: "60",
  mg: "60",
  orden: "0",
  activo: true
};

function toUpsert(form: typeof emptyForm): TonerModeloUpsert | null {
  const g = parseFloat(form.gramos.replace(",", "."));
  const mg = parseFloat(form.mg.replace(",", "."));
  const ord = parseInt(form.orden, 10);
  if (!form.nombre.trim()) return null;
  if (!Number.isFinite(g) || g <= 0 || g > 50_000) return null;
  if (!Number.isFinite(mg) || mg <= 0 || mg > 500_000) return null;
  const orden = Number.isFinite(ord) ? ord : 0;
  const cod = form.codigo.trim();
  return {
    codigo: cod ? cod : null,
    nombre: form.nombre.trim(),
    notas: form.notas.trim() ? form.notas.trim() : null,
    gramos_por_cartucho: g,
    mg_por_cara: mg,
    activo: form.activo,
    orden
  };
}

export function TonerModelosPage() {
  const [rows, setRows] = useState<TonerModeloReferencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTonerModelosTodos();
      setRows(data);
    } catch (e) {
      console.error(e);
      showToast("ERROR AL CARGAR PERFILES DE TÓNER", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const previewPaginas = useMemo(() => {
    const g = parseFloat(form.gramos.replace(",", ".")) || 0;
    const mg = parseFloat(form.mg.replace(",", ".")) || 0;
    if (g <= 0 || mg <= 0) return null;
    return tonerPaginasPorCartuchoDesdeFisica(g, mg);
  }, [form.gramos, form.mg]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = toUpsert(form);
    if (!payload) {
      showToast("REVISÁ NOMBRE, GRAMOS (1–50000) Y MG (1–500000)", "error");
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        await updateTonerModelo(editId, payload);
        showToast("PERFIL ACTUALIZADO");
      } else {
        await insertTonerModelo(payload);
        showToast("PERFIL CREADO");
      }
      resetForm();
      await cargar();
    } catch (err) {
      console.error(err);
      showToast(
        "ERROR AL GUARDAR (¿CÓDIGO DUPLICADO O SIN PERMISOS?)",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (m: TonerModeloReferencia) => {
    setEditId(m.id);
    setForm({
      codigo: m.codigo ?? "",
      nombre: m.nombre,
      notas: m.notas ?? "",
      gramos: String(m.gramos_por_cartucho),
      mg: String(m.mg_por_cara),
      orden: String(m.orden),
      activo: m.activo
    });
  };

  const onDelete = async (m: TonerModeloReferencia) => {
    if (
      !confirm(
        `¿Eliminar «${m.nombre}»? Los insumos que lo usaban quedarán sin referencia (valores g/mg se conservan).`
      )
    ) {
      return;
    }
    try {
      await deleteTonerModelo(m.id);
      showToast("ELIMINADO");
      if (editId === m.id) resetForm();
      await cargar();
    } catch (err) {
      console.error(err);
      showToast("ERROR AL ELIMINAR", "error");
    }
  };

  return (
    <section className="animate-fade-in max-w-3xl mx-auto pb-24 space-y-6 min-w-0">
      <header>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Administración
        </p>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          Perfiles de tóner
        </h1>
        <p className="text-xs text-slate-500 font-semibold mt-1">
          Solo administradores. Definís gramos por cartucho y mg por cara; en el
          alta de insumos tóner se elige un perfil para rellenar automáticamente.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="bg-white rounded-sm border border-slate-200 p-5 shadow-sm space-y-4"
      >
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {editId ? "Editar perfil" : "Nuevo perfil"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              value={form.nombre}
              onChange={(e) =>
                setForm((f) => ({ ...f, nombre: e.target.value }))
              }
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm"
              placeholder="Ej: Oficina / texto mixto"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Código interno (opcional, único)
            </label>
            <input
              value={form.codigo}
              onChange={(e) =>
                setForm((f) => ({ ...f, codigo: e.target.value }))
              }
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm"
              placeholder="oficina_mixta"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Orden en listas
            </label>
            <input
              type="number"
              step={1}
              value={form.orden}
              onChange={(e) =>
                setForm((f) => ({ ...f, orden: e.target.value }))
              }
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Gramos por cartucho <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form.gramos}
              onChange={(e) =>
                setForm((f) => ({ ...f, gramos: e.target.value }))
              }
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              mg por cara A4 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form.mg}
              onChange={(e) => setForm((f) => ({ ...f, mg: e.target.value }))}
              className="w-full p-3 rounded-sm border border-slate-200 font-bold text-sm tabular-nums"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
              Notas
            </label>
            <textarea
              value={form.notas}
              onChange={(e) =>
                setForm((f) => ({ ...f, notas: e.target.value }))
              }
              rows={2}
              className="w-full p-3 rounded-sm border border-slate-200 font-semibold text-sm resize-y min-h-[3rem]"
              placeholder="Cobertura de referencia, impresora, etc."
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
              Activo (visible al elegir insumo tóner)
            </label>
          </div>
          {previewPaginas != null && (
            <div className="sm:col-span-2 rounded-sm bg-slate-50 border border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-700">
              Derivado: <strong>≈ {previewPaginas} páginas</strong> por cartucho
              (g × 1000 ÷ mg/cara).
            </div>
          )}
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
            {rows.map((m) => {
              const pags = tonerPaginasPorCartuchoDesdeFisica(
                Number(m.gramos_por_cartucho),
                Number(m.mg_por_cara)
              );
              return (
                <li
                  key={m.id}
                  className={`px-4 py-3 flex flex-wrap items-center justify-between gap-2 ${!m.activo ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 truncate">
                      {m.nombre}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {m.gramos_por_cartucho} g · {m.mg_por_cara} mg/cara · ≈{" "}
                      {pags} pág/cartucho
                      {m.codigo ? ` · ${m.codigo}` : ""}
                      {!m.activo ? " · Inactivo" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEdit(m)}
                      className="p-2 rounded-sm border border-slate-200 text-slate-500 hover:bg-slate-50"
                      aria-label="Editar"
                    >
                      <i className="fas fa-pen" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(m)}
                      className="p-2 rounded-sm border border-slate-200 text-red-500 hover:bg-red-50"
                      aria-label="Eliminar"
                    >
                      <i className="fas fa-trash-alt" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
