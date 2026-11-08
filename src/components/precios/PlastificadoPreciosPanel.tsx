import { useEffect, useMemo, useState } from "react";
import type { ConfigCosto } from "../../types/precio";
import {
  PLASTIFICADO_COSTO_POUCH_KEY,
  PLASTIFICADO_PRECIO_VENTA_KEY
} from "../../types/precio";
import type { Insumo } from "../../types/insumo";
import { preciosApi } from "../../services/preciosApi";
import { insumosApi } from "../../services/insumosApi";
import { showToast } from "../ui/Toast";
import { formatCurrency } from "../../utils/formatters";
import {
  costoPouchEfectivo,
  pouchActivo,
  precioVentaPlastificado
} from "../../utils/plastificado";

interface Props {
  configCostos: ConfigCosto[];
  insumos: Insumo[];
  onReload: () => Promise<void>;
}

function parseMonto(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function PlastificadoPreciosPanel({
  configCostos,
  insumos,
  onReload
}: Props) {
  const [insumosLocal, setInsumosLocal] = useState(insumos);
  const ventaActual = precioVentaPlastificado(configCostos);
  const costoActual = costoPouchEfectivo(insumosLocal, configCostos);
  const pouch = useMemo(() => pouchActivo(insumosLocal), [insumosLocal]);
  const [venta, setVenta] = useState(String(ventaActual));
  const [costo, setCosto] = useState(String(Math.round(costoActual)));
  const [saving, setSaving] = useState<"venta" | "costo" | null>(null);

  useEffect(() => {
    setInsumosLocal(insumos);
  }, [insumos]);

  useEffect(() => {
    setVenta(String(ventaActual));
  }, [ventaActual]);

  useEffect(() => {
    setCosto(String(Math.round(costoActual)));
  }, [costoActual]);

  const guardarVenta = async () => {
    const n = parseMonto(venta);
    if (n == null || n <= 0) {
      showToast("EL PRECIO TIENE QUE SER MAYOR A 0", "error");
      return;
    }
    setSaving("venta");
    try {
      await preciosApi.actualizarConfigCosto(
        PLASTIFICADO_PRECIO_VENTA_KEY,
        String(n)
      );
      showToast("PRECIO DE PLASTIFICADO ACTUALIZADO");
      await onReload();
    } catch {
      showToast("ERROR AL GUARDAR", "error");
    } finally {
      setSaving(null);
    }
  };

  const guardarCosto = async () => {
    const n = parseMonto(costo);
    if (n == null) {
      showToast("EL COSTO NO ES VÁLIDO", "error");
      return;
    }
    setSaving("costo");
    try {
      await preciosApi.actualizarConfigCosto(
        PLASTIFICADO_COSTO_POUCH_KEY,
        String(n)
      );
      if (pouch) {
        const actualizado = await insumosApi.actualizar(pouch.id, {
          precio_compra: n,
          costo_compra: n,
          costo_base: n,
          unidad_venta_equivalente: 1,
          unidades_por_compra: 1,
          rendimiento: null
        });
        setInsumosLocal((prev) =>
          prev.map((i) => (i.id === actualizado.id ? actualizado : i))
        );
      }
      showToast(
        pouch
          ? "COSTO DEL POUCH ACTUALIZADO"
          : "COSTO GUARDADO. FALTA EL INSUMO POUCH"
      );
      await onReload();
    } catch {
      showToast("ERROR AL GUARDAR", "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-white rounded-sm shadow-sm border border-slate-100 overflow-hidden max-w-xl">
      <div className="p-4 space-y-1">
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] italic leading-none">
          Plastificado
        </h3>
        <p className="text-[10px] text-slate-400 leading-snug">
          Cada unidad plastificada se suma al presupuesto y descuenta un pouch
          del stock al confirmar el pedido.
        </p>
      </div>

      <div className="divide-y divide-slate-50">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-700 leading-none">
              Precio de venta
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Por unidad. Hoy {formatCurrency(ventaActual)}.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={1}
              step={1}
              value={venta}
              onChange={(e) => setVenta(e.target.value)}
              className="w-28 p-2 bg-slate-100 rounded-sm font-black text-slate-700 text-right text-sm outline-none border border-slate-200"
            />
            <button
              type="button"
              onClick={() => void guardarVenta()}
              disabled={saving != null}
              className="px-3 h-9 rounded-sm bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {saving === "venta" ? "..." : "Guardar"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-700 leading-none">
              Costo del pouch
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {pouch
                ? `${pouch.nombre} · stock ${Number(pouch.stock_actual) || 0}`
                : "No hay pouch activo. Aplicá sql/63_plastificado.sql o crealo en Insumos."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={0}
              step={1}
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              className="w-28 p-2 bg-slate-100 rounded-sm font-black text-slate-700 text-right text-sm outline-none border border-slate-200"
            />
            <button
              type="button"
              onClick={() => void guardarCosto()}
              disabled={saving != null}
              className="px-3 h-9 rounded-sm bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {saving === "costo" ? "..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
