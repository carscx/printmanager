import { useEffect, useState } from "react";
import { insumosApi } from "../../services/insumosApi";
import { preciosApi } from "../../services/preciosApi";
import { formatCurrency } from "../../utils/formatters";
import type { ProductoTarifaAfectada } from "../../types/insumoAfectado";

interface Props {
  insumoId: string;
}

export function ProductosAfectadosPanel({ insumoId }: Props) {
  const [rows, setRows] = useState<ProductoTarifaAfectada[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cfg = await preciosApi.fetchConfiguracionNegocio();
        const data = await insumosApi.fetchProductosTarifaAfectados(insumoId, cfg);
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [insumoId]);

  const impresion = rows.filter((r) => r.alcance === "IMPRESION" && r.precio_venta > 0);
  const otros = rows.filter((r) => r.alcance !== "IMPRESION" || r.precio_venta <= 0);

  if (loading) {
    return (
      <div className="rounded-sm border border-slate-100 bg-slate-50/80 p-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
          Tarifas afectadas
        </p>
        <p className="text-xs text-slate-400 font-semibold">
          <i className="fas fa-circle-notch fa-spin mr-2" />
          Calculando impacto en márgenes…
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-sm border border-slate-100 bg-slate-50/80 p-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
          Tarifas afectadas
        </p>
        <p className="text-xs text-slate-500 font-semibold">
          Este insumo no está en líneas de costo legacy vinculadas a tarifas de impresión.
          Si solo lo usás en Reglas de negocio, el impacto se ve al editar precios.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-violet-100 bg-violet-50/40 p-4 space-y-3">
      <p className="text-[10px] font-black text-violet-700 uppercase tracking-widest">
        Impacto en tarifas (estimado)
      </p>
      <p className="text-[9px] text-slate-500 font-semibold leading-snug">
        Vista basada en vínculos legacy a tarifas de impresión. Las{" "}
        <strong>reglas de negocio</strong> actualizan costos en el servidor al cambiar
        rendimiento o precio de compra del insumo.
      </p>

      {impresion.length > 0 && (
        <div className="overflow-x-auto rounded-sm border border-white bg-white/90">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 text-[9px] font-black uppercase text-slate-400">
                <th className="py-2 px-2">Tarifa</th>
                <th className="py-2 px-2">Venta / hoja</th>
                <th className="py-2 px-2">Costo real*</th>
                <th className="py-2 px-2">Margen</th>
              </tr>
            </thead>
            <tbody>
              {impresion.map((r) => (
                <tr key={r.receta_id} className="border-b border-slate-50">
                  <td className="py-2 px-2 font-bold text-slate-800">{r.etiqueta}</td>
                  <td className="py-2 px-2 font-black text-slate-700">
                    {formatCurrency(r.precio_venta)}
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    {formatCurrency(r.costo_real)}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`font-black ${
                        r.margen_pct == null
                          ? "text-slate-400"
                          : r.margen_pct < 10
                            ? "text-red-600"
                            : r.margen_pct < 20
                              ? "text-amber-600"
                              : "text-emerald-600"
                      }`}
                    >
                      {r.margen_pct != null ? `${r.margen_pct}%` : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {otros.length > 0 && (
        <ul className="text-[10px] text-slate-600 font-semibold space-y-1">
          {otros.map((r) => (
            <li key={r.receta_id}>
              <i className="fas fa-link text-violet-400 mr-1" />
              {r.etiqueta}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[8px] text-slate-400 font-semibold">
        *Costo real = costo directo tarifa + % desperdicio y mantenimiento (configuración
        negocio).
      </p>
    </div>
  );
}
