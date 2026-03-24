import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPedidosParaFacturacion,
  getFacturacionUltimaExportHasta,
  marcarPedidosFacturados,
  setFacturacionUltimaExportHasta
} from "../services/facturacionApi";
import type { Pedido } from "../types/pedido";
import {
  armarLineasFacturacion,
  UMBRAL_ALERTA_DNI
} from "../utils/facturacionBatching";
import { descargarFacturacionExcel } from "../utils/facturacionExcel";
import { formatCurrency } from "../utils/formatters";
import { totalVentaPedido } from "../utils/pedidoTotalVenta";
import { showToast } from "../components/ui/Toast";

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonthISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}

function addDaysYYYYMMDD(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function fechaPagoCorta(p: Pedido): string {
  const raw = p.fecha_pago ?? p.created_at;
  if (!raw) return "—";
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR");
}

export function FacturacionPage() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [datesReady, setDatesReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const ultima = await getFacturacionUltimaExportHasta();
        const hoy = todayISO();
        if (!alive) return;
        if (ultima) {
          setDesde(addDaysYYYYMMDD(ultima, 1));
        } else {
          setDesde(firstDayOfMonthISO());
        }
        setHasta(hoy);
        setDatesReady(true);
      } catch (e) {
        console.error(e);
        setDesde(firstDayOfMonthISO());
        setHasta(todayISO());
        setDatesReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const lineas = useMemo(() => armarLineasFacturacion(pedidos), [pedidos]);

  const totalArs = useMemo(
    () => pedidos.reduce((s, p) => s + totalVentaPedido(p), 0),
    [pedidos]
  );

  const alertasDni = useMemo(
    () => lineas.filter((l) => l.requiereDni),
    [lineas]
  );

  const cargar = useCallback(async () => {
    if (!desde || !hasta) {
      showToast("DEFINÍ DESDE Y HASTA", "error");
      return;
    }
    if (desde > hasta) {
      showToast("LA FECHA DESDE NO PUEDE SER POSTERIOR A HASTA", "error");
      return;
    }
    setLoading(true);
    try {
      const data = await fetchPedidosParaFacturacion(desde, hasta);
      setPedidos(data);
      showToast(
        data.length === 0
          ? "NO HAY PEDIDOS EN ESE RANGO"
          : `${data.length} PEDIDO(S) ENCONTRADO(S)`
      );
    } catch (e) {
      console.error(e);
      showToast("ERROR AL CARGAR PEDIDOS", "error");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  const exportarYMarcar = async () => {
    if (lineas.length === 0) return;
    setSaving(true);
    try {
      const ids = [...new Set(lineas.flatMap((l) => l.pedidoIds))];
      const nombre = `facturacion-${hasta}`;
      descargarFacturacionExcel(lineas, nombre);
      await marcarPedidosFacturados(ids);
      await setFacturacionUltimaExportHasta(hasta);
      showToast("EXCEL DESCARGADO Y PEDIDOS MARCADOS COMO FACTURADOS");
      setPedidos([]);
    } catch (e) {
      console.error(e);
      showToast("ERROR AL MARCAR FACTURADOS (REVISÁ SI EL EXCEL SE BAJÓ)", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!datesReady) {
    return (
      <section className="animate-fade-in max-w-xl mx-auto pb-24 px-1">
        <p className="text-sm text-slate-400 font-bold">Cargando…</p>
      </section>
    );
  }

  return (
    <section className="animate-fade-in max-w-xl mx-auto pb-24 px-1 space-y-5">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
          Monotributo · ARCA
        </p>
        <h1 className="text-xl font-black uppercase tracking-tighter text-slate-900">
          Facturación
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
          Cobro total por transferencia, pedidos entregados y pendientes de facturar en el rango.
          El efectivo no se incluye.
        </p>
      </header>

      <div className="rounded-sm border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Desde
            </label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full p-2 rounded-sm border border-slate-200 text-sm font-bold bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full p-2 rounded-sm border border-slate-200 text-sm font-bold bg-slate-50"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={loading}
          className="w-full py-2.5 rounded-sm bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? (
            <>
              <i className="fas fa-spinner fa-spin mr-2" />
              Buscando…
            </>
          ) : (
            <>
              <i className="fas fa-search mr-2" />
              Armar borrador
            </>
          )}
        </button>
      </div>

      {pedidos.length > 0 && (
        <>
          <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
            <span className="font-black text-slate-900">{pedidos.length}</span> pedido
            {pedidos.length !== 1 ? "s" : ""} · Total{" "}
            <span className="font-black">{formatCurrency(totalArs)}</span>
          </div>

          {alertasDni.length > 0 && (
            <div
              className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950"
              role="alert"
            >
              <i className="fas fa-triangle-exclamation mr-1.5" />
              {alertasDni.length} línea(s) &gt; {formatCurrency(UMBRAL_ALERTA_DNI)}:{" "}
              <strong>DNI/CUIT</strong> en ARCA.
            </div>
          )}

          <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
            <h2 className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 border-b border-slate-100">
              Pedidos a facturar
            </h2>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-white border-b border-slate-100 text-[9px] font-black uppercase text-slate-400">
                  <tr>
                    <th className="py-2 pl-3 pr-2 text-left">Pedido</th>
                    <th className="py-2 px-2 text-right">Importe</th>
                    <th className="py-2 pl-2 pr-3 text-right">Fecha pago</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pl-3 pr-2 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {p.numero_publico != null ? `#${p.numero_publico}` : p.id.slice(0, 8)}
                      </td>
                      <td className="py-2 px-2 text-right font-bold tabular-nums text-slate-900">
                        {formatCurrency(totalVentaPedido(p))}
                      </td>
                      <td className="py-2 pl-2 pr-3 text-right text-slate-500 whitespace-nowrap">
                        {fechaPagoCorta(p)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Al exportar se generan{" "}
            <strong className="text-slate-800">{lineas.length}</strong> línea(s) de comprobante
            (lotes según reglas). El detalle completo (descripciones e importes por línea) va en el
            Excel.
          </p>

          <button
            type="button"
            onClick={() => void exportarYMarcar()}
            disabled={saving || lineas.length === 0}
            className="w-full py-3 rounded-sm bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin" />
                Procesando…
              </>
            ) : (
              <>
                <i className="fas fa-file-excel" />
                Descargar Excel y marcar facturados
              </>
            )}
          </button>
        </>
      )}
    </section>
  );
}
