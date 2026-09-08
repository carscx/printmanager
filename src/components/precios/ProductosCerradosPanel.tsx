import { useEffect, useMemo, useState } from "react";
import { productosApi } from "../../services/productosApi";
import { showToast } from "../ui/Toast";
import type { Insumo } from "../../types/insumo";
import type { Producto } from "../../types/producto";
import { productoListoParaVender } from "../../types/producto";
import { formatCurrency } from "../../utils/formatters";

interface Props {
  insumos: Insumo[];
}

interface DraftProducto {
  precio: string;
  insumoId: string;
  hojas: string;
}

function draftFromProducto(p: Producto): DraftProducto {
  const bom = p.productos_insumos?.[0];
  return {
    precio: String(Number(p.precio_venta) || 0),
    insumoId: bom?.insumo_id ?? "",
    hojas: bom ? String(Number(bom.cantidad) || "") : ""
  };
}

export function ProductosCerradosPanel({ insumos }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftProducto>>({});

  const papeles = useMemo(
    () =>
      insumos.filter(
        (i) => i.categoria === "papel" && i.activo !== false
      ),
    [insumos]
  );

  const load = async () => {
    setLoading(true);
    try {
      const rows = await productosApi.fetchAll(false);
      setProductos(rows);
      setDrafts(Object.fromEntries(rows.map((p) => [p.id, draftFromProducto(p)])));
    } catch (e) {
      console.error(e);
      showToast("ERROR AL CARGAR PRODUCTOS", "error");
      setProductos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const patchDraft = (id: string, patch: Partial<DraftProducto>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch }
    }));
  };

  const guardar = async (p: Producto) => {
    const d = drafts[p.id];
    if (!d) return;
    const precio = Number(d.precio);
    const hojas = Number(d.hojas);
    if (!Number.isFinite(precio) || precio < 0) {
      showToast("EL PRECIO NO ES VÁLIDO", "error");
      return;
    }
    if (d.insumoId && (!Number.isFinite(hojas) || hojas <= 0)) {
      showToast("INDICÁ CUÁNTAS HOJAS CONSUME", "error");
      return;
    }
    setSavingId(p.id);
    try {
      await productosApi.updatePrecio(p.id, precio);
      await productosApi.replaceBom(
        p.id,
        d.insumoId && hojas > 0
          ? [{ insumo_id: d.insumoId, cantidad: hojas }]
          : []
      );
      showToast("PRODUCTO ACTUALIZADO");
      await load();
    } catch (e) {
      console.error(e);
      showToast("ERROR AL GUARDAR EL PRODUCTO", "error");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <i className="fas fa-circle-notch fa-spin text-xl text-blue-600" />
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <p className="text-[11px] font-semibold text-slate-500 leading-relaxed max-w-lg">
        No hay productos cerrados. Ejecutá en Supabase el script{" "}
        <span className="font-mono">61_productos_cerrados.sql</span> para crear
        Agenda Semanal.
      </p>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl pb-24">
      <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
        Precio único al cliente y hojas de papel que descuenta el stock al
        confirmar el presupuesto. El insumo se elige entre papeles de Insumos
        (mate, etc.).
      </p>

      {productos.map((p) => {
        const d = drafts[p.id] ?? draftFromProducto(p);
        const listo = productoListoParaVender({
          ...p,
          precio_venta: Number(d.precio) || 0,
          productos_insumos: d.insumoId
            ? [
                {
                  id: "",
                  producto_id: p.id,
                  insumo_id: d.insumoId,
                  cantidad: Number(d.hojas) || 0
                }
              ]
            : []
        });
        return (
          <div
            key={p.id}
            className="bg-white rounded-sm border border-slate-100 p-4 space-y-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">
                  {p.nombre}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                  {p.slug}
                </p>
              </div>
              <span
                className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-sm ${
                  listo
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {listo ? "Listo para vender" : "Falta precio u hojas"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">
                  Precio de venta
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={d.precio}
                  onChange={(e) => patchDraft(p.id, { precio: e.target.value })}
                  className="mt-1 w-full p-2.5 rounded-sm border border-slate-200 font-black text-sm"
                />
                <p className="text-[10px] text-slate-400 font-semibold mt-1">
                  {formatCurrency(Number(d.precio) || 0)}
                </p>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">
                  Papel (insumo)
                </label>
                <select
                  value={d.insumoId}
                  onChange={(e) => patchDraft(p.id, { insumoId: e.target.value })}
                  className="mt-1 w-full p-2.5 rounded-sm border border-slate-200 font-bold text-sm text-slate-800 bg-white"
                >
                  <option value="">Elegir papel…</option>
                  {papeles.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                      {i.tipo_papel ? ` · ${i.tipo_papel}` : ""}
                    </option>
                  ))}
                </select>
                {papeles.length === 0 && (
                  <p className="text-[10px] text-amber-700 font-semibold mt-1">
                    No hay insumos de papel activos. Crealos en Insumos.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">
                  Hojas por unidad
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={d.hojas}
                  onChange={(e) => patchDraft(p.id, { hojas: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full p-2.5 rounded-sm border border-slate-200 font-black text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={savingId === p.id}
              onClick={() => void guardar(p)}
              className="px-4 py-2.5 rounded-sm bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {savingId === p.id ? "Guardando…" : "Guardar"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
