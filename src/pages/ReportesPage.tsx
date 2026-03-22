import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { insumosApi } from "../services/insumosApi";
import { agregarDescuentosRecargos } from "../services/descuentosReport";
import {
  calcularRentabilidad,
  type RentabilidadResultado,
  type SerieDiaria
} from "../services/rentabilidadReport";
import {
  fetchSerieDiariaVista,
  fetchTotalesOperacionRango
} from "../services/reportesApi";
import type { TotalesOperacion } from "../services/reportesApi";
import { formatCurrency } from "../utils/formatters";
import { toDateStringAR } from "../utils/dateAr";
import { showToast } from "../components/ui/Toast";
import { useAuth } from "../hooks/useAuth";
import { EvolucionRentabilidadChart } from "../components/reportes/EvolucionRentabilidadChart";
import { stockHumanoTexto } from "../utils/insumoStockHuman";
import type { Pedido, PedidoItem } from "../types/pedido";

type Preset = "hoy" | "semana" | "mes" | "custom";
type Tab = "rentabilidad" | "descuentos";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

const ReportesPage = () => {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("rentabilidad");
  const [preset, setPreset] = useState<Preset>("mes");
  const [fromCustom, setFromCustom] = useState("");
  const [toCustom, setToCustom] = useState("");
  const [incluirCancelados, setIncluirCancelados] = useState(false);
  const [loadingDesc, setLoadingDesc] = useState(false);
  const [loadingRent, setLoadingRent] = useState(false);
  const [agregado, setAgregado] = useState<ReturnType<
    typeof agregarDescuentosRecargos
  > | null>(null);
  const [rent, setRent] = useState<RentabilidadResultado | null>(null);
  const [stockBajo, setStockBajo] = useState<
    Awaited<ReturnType<typeof insumosApi.fetchStockBajo>>
  >([]);
  const [subidasPrecio, setSubidasPrecio] = useState<
    Awaited<ReturnType<typeof insumosApi.fetchSubidasPrecioFuertes>>
  >([]);
  const [totalesVista, setTotalesVista] = useState<TotalesOperacion | null>(
    null
  );
  const [serieVista, setSerieVista] = useState<SerieDiaria[]>([]);
  const [loadingVista, setLoadingVista] = useState(true);

  const rango = useMemo(() => {
    const now = new Date();
    if (preset === "hoy") {
      return { from: startOfDay(now), to: endOfDay(now) };
    }
    if (preset === "semana") {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 7);
      return { from, to: endOfDay(now) };
    }
    if (preset === "mes") {
      const from = startOfDay(now);
      from.setDate(1);
      return { from, to: endOfDay(now) };
    }
    const from = fromCustom ? startOfDay(new Date(fromCustom)) : startOfDay(now);
    const to = toCustom ? endOfDay(new Date(toCustom)) : endOfDay(now);
    return { from, to };
  }, [preset, fromCustom, toCustom]);

  const rangoAr = useMemo(
    () => ({
      desde: toDateStringAR(rango.from),
      hasta: toDateStringAR(rango.to)
    }),
    [rango.from, rango.to]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingVista(true);
    (async () => {
      try {
        const [t, s] = await Promise.all([
          fetchTotalesOperacionRango(rangoAr.desde, rangoAr.hasta),
          fetchSerieDiariaVista(rangoAr.desde, rangoAr.hasta)
        ]);
        if (!cancelled) {
          setTotalesVista(t);
          setSerieVista(s);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setTotalesVista(null);
          setSerieVista([]);
          showToast("ERROR AL CARGAR MÉTRICAS (VISTA DIARIA)", "error");
        }
      } finally {
        if (!cancelled) setLoadingVista(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangoAr.desde, rangoAr.hasta]);

  const loadDescuentos = useCallback(async () => {
    setLoadingDesc(true);
    try {
      const pedidos = await api.fetchPedidosPorPeriodo(
        rango.from.toISOString(),
        rango.to.toISOString(),
        { incluirCancelados }
      );
      setAgregado(agregarDescuentosRecargos(pedidos));
    } catch (e) {
      console.error(e);
      showToast("ERROR AL CARGAR DESCUENTOS", "error");
      setAgregado(null);
    } finally {
      setLoadingDesc(false);
    }
  }, [rango.from, rango.to, incluirCancelados]);

  const loadRentabilidad = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingRent(true);
    try {
      const [pedidos, insumosList, bajo, subidas] = await Promise.all([
        api.fetchPedidosPorPeriodo(
          rango.from.toISOString(),
          rango.to.toISOString(),
          { incluirCancelados: true, limite: 5000 }
        ),
        insumosApi.fetchAll(false),
        insumosApi.fetchStockBajo(),
        insumosApi.fetchSubidasPrecioFuertes(15, 45).catch(() => [])
      ]);
      const nombres = new Map(insumosList.map((i) => [i.id, i.nombre]));
      const itemIds = pedidos.flatMap((p: Pedido) =>
        (p.pedido_items || []).map((it: PedidoItem) => it.id).filter(Boolean)
      ) as string[];
      const consumos = await api.fetchConsumoInsumosPorItemIds(itemIds);
      setRent(calcularRentabilidad(pedidos, consumos, nombres));
      setStockBajo(bajo);
      setSubidasPrecio(
        subidas.map((s) => ({
          ...s,
          nombre: nombres.get(s.insumo_id) || s.insumo_id.slice(0, 8)
        }))
      );
    } catch (e) {
      console.error(e);
      showToast("ERROR AL CARGAR RENTABILIDAD", "error");
      setRent(null);
    } finally {
      setLoadingRent(false);
    }
  }, [rango.from, rango.to, isAdmin]);

  useEffect(() => {
    loadDescuentos();
  }, [loadDescuentos]);

  useEffect(() => {
    if (isAdmin && tab === "rentabilidad") loadRentabilidad();
  }, [loadRentabilidad, isAdmin, tab]);

  useEffect(() => {
    if (!isAdmin && tab === "rentabilidad") setTab("descuentos");
  }, [isAdmin, tab]);

  const a = agregado;
  const totalDesc = (a?.descuentoItems ?? 0) + (a?.descuentoGlobal ?? 0);
  const totalRec = (a?.recargoItems ?? 0) + (a?.recargoGlobal ?? 0);

  const pctMargenVista = useMemo(() => {
    if (!totalesVista || totalesVista.totalIngresos <= 0) return null;
    return (
      Math.round(
        (totalesVista.gananciaNeta / totalesVista.totalIngresos) * 1000
      ) / 10
    );
  }, [totalesVista]);

  return (
    <section className="animate-fade-in space-y-4 pb-24 lg:max-w-5xl lg:mx-auto min-w-0 px-1">
      <header>
        <h1 className="text-lg font-black uppercase tracking-tighter text-slate-900">
          Centro de ventas y rentabilidad
        </h1>
        <p className="text-xs text-slate-400 font-bold mt-1">
          Totales desde <code className="text-slate-500">v_estadisticas_diarias</code>{" "}
          (AR)
        </p>
      </header>

      <div className="flex gap-2 p-1 bg-white rounded-sm border border-slate-100 shadow-sm">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setTab("rentabilidad")}
            className={`flex-1 py-3 rounded-sm text-[10px] font-black uppercase tracking-wider ${
              tab === "rentabilidad"
                ? "bg-slate-900 text-white"
                : "text-slate-500"
            }`}
          >
            Rentabilidad
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab("descuentos")}
          className={`flex-1 py-3 rounded-sm text-[10px] font-black uppercase tracking-wider ${
            tab === "descuentos"
              ? "bg-slate-900 text-white"
              : "text-slate-500"
          }`}
        >
          Descuentos / recargos
        </button>
      </div>

      <div className="bg-white rounded-sm border border-slate-100 p-4 space-y-3 shadow-sm">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
          Período
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              ["hoy", "Hoy"],
              ["semana", "7 días"],
              ["mes", "Este mes"],
              ["custom", "Personalizado"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              className={`py-3 rounded-sm text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                preset === id
                  ? "bg-blue-600 text-white"
                  : "bg-slate-50 text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <input
              type="date"
              value={fromCustom}
              onChange={(e) => setFromCustom(e.target.value)}
              className="p-3 rounded-sm bg-slate-50 border border-slate-100 text-sm font-bold"
            />
            <input
              type="date"
              value={toCustom}
              onChange={(e) => setToCustom(e.target.value)}
              className="p-3 rounded-sm bg-slate-50 border border-slate-100 text-sm font-bold"
            />
          </div>
        )}
        {tab === "descuentos" && (
          <label className="flex items-center gap-3 cursor-pointer py-2">
            <input
              type="checkbox"
              checked={incluirCancelados}
              onChange={(e) => setIncluirCancelados(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300"
            />
            <span className="text-sm font-bold text-slate-600">
              Incluir cancelados (solo pestaña descuentos)
            </span>
          </label>
        )}
      </div>

      {loadingVista ? (
        <div className="flex justify-center py-8">
          <i className="fas fa-circle-notch fa-spin fa-2x text-blue-500" />
        </div>
      ) : totalesVista ? (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-sm p-6 shadow-lg border border-slate-700/50">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
            Total facturado (período)
          </p>
          <p className="text-3xl sm:text-4xl font-black tracking-tight">
            {formatCurrency(totalesVista.totalIngresos)}
          </p>
          <p className="text-[10px] text-slate-500 mt-2 font-semibold">
            Suma de <span className="text-slate-400">total_ingresos</span> por día
            · pedidos señado, pagado, listo o entregado
          </p>
        </div>
      ) : null}

      {tab === "rentabilidad" && (
        <>
          {loadingRent ? (
            <div className="flex justify-center py-20">
              <i className="fas fa-circle-notch fa-spin fa-2x text-blue-500" />
            </div>
          ) : rent ? (
            <>
              {totalesVista && <BalanceOperacion t={totalesVista} />}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniKpi
                  label="Margen (vista)"
                  value={
                    pctMargenVista != null
                      ? `${pctMargenVista}%`
                      : "—"
                  }
                />
                <MiniKpi
                  label="Pedidos"
                  value={String(rent.pedidosTotal - rent.pedidosCancelados)}
                />
                <MiniKpi
                  label="Cancelados"
                  value={String(rent.pedidosCancelados)}
                />
                <MiniKpi
                  label="Descuentos $"
                  value={formatCurrency(rent.totalDescuentosOtorgados)}
                />
              </div>

              <div className="bg-white rounded-sm border border-slate-100 p-4 shadow-sm">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Evolución diaria (v_estadisticas_diarias · día AR)
                </h2>
                <EvolucionRentabilidadChart data={serieVista} />
              </div>

              <div className="bg-white rounded-sm border border-slate-100 p-4 shadow-sm overflow-x-auto">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Desglose por tipo de trabajo (referencia por ítems)
                </h2>
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-left text-[10px] font-black text-slate-400 uppercase border-b">
                      <th className="pb-2">Segmento</th>
                      <th className="pb-2 text-right">Ingresos</th>
                      <th className="pb-2 text-right">Costos</th>
                      <th className="pb-2 text-right">Ganancia</th>
                      <th className="pb-2 text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rent.desglose.map((row) => (
                      <tr
                        key={row.key}
                        className="border-b border-slate-50 font-bold"
                      >
                        <td className="py-2 pr-2">{row.label}</td>
                        <td className="py-2 text-right">
                          {formatCurrency(row.ingresos)}
                        </td>
                        <td className="py-2 text-right text-red-600">
                          {formatCurrency(row.costos)}
                        </td>
                        <td
                          className={`py-2 text-right ${row.ganancia < 0 ? "text-red-600" : "text-green-600"}`}
                        >
                          {formatCurrency(row.ganancia)}
                        </td>
                        <td className="py-2 text-right">{row.margenPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-sm border border-slate-100 p-4 shadow-sm">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Insumos más consumidos (costo $)
                </h2>
                <ul className="space-y-2">
                  {rent.rankingInsumos.length === 0 ? (
                    <li className="text-slate-400 text-sm">
                      Sin consumos registrados en el período (materiales /
                      stock).
                    </li>
                  ) : (
                    rent.rankingInsumos.map((r, i) => (
                      <li
                        key={r.insumo_id}
                        className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0"
                      >
                        <span className="font-bold text-slate-700 truncate pr-2">
                          <span className="text-slate-300 mr-2">{i + 1}.</span>
                          {r.nombre}
                        </span>
                        <span className="text-xs font-black text-slate-500 shrink-0">
                          {r.cantidad.toLocaleString("es-AR")} u ·{" "}
                          {formatCurrency(r.costoTotal)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="space-y-3">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Alertas
                </h2>
                {stockBajo.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-sm p-4">
                    <p className="text-[10px] font-black text-amber-700 uppercase mb-2">
                      <i className="fas fa-triangle-exclamation mr-1" />
                      Stock bajo ({stockBajo.length})
                    </p>
                    <ul className="text-xs text-amber-900 font-semibold space-y-1">
                      {stockBajo.slice(0, 5).map((i) => (
                        <li key={i.id}>
                          {i.nombre}: {stockHumanoTexto(i)} (mín.{" "}
                          {stockHumanoTexto({
                            ...i,
                            stock_actual: i.stock_minimo
                          })}
                          )
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {rent.bucketsMargenNegativo.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-sm p-4">
                    <p className="text-[10px] font-black text-red-700 uppercase mb-2">
                      Margen negativo por segmento
                    </p>
                    <p className="text-xs text-red-800">
                      {rent.bucketsMargenNegativo.join(" · ")} — revisá precios
                      de venta o costos de esos trabajos.
                    </p>
                  </div>
                )}
                {subidasPrecio.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-sm p-4">
                    <p className="text-[10px] font-black text-blue-700 uppercase mb-2">
                      Insumos con subida de compra ≥15% (45 días)
                    </p>
                    <ul className="text-xs text-blue-900 space-y-1">
                      {subidasPrecio.slice(0, 8).map((s, idx) => (
                        <li key={`${s.insumo_id}-${idx}`}>
                          <strong>{s.nombre}</strong>: +{s.pct}% (
                          {formatCurrency(s.anterior)} →{" "}
                          {formatCurrency(s.nuevo)})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {stockBajo.length === 0 &&
                  rent.bucketsMargenNegativo.length === 0 &&
                  subidasPrecio.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">
                      Sin alertas en este momento.
                    </p>
                  )}
              </div>

              <p className="text-[10px] text-slate-400 text-center">
                Detalle por pedido: hasta 5000 filas. KPI y gráfico: vista diaria en
                BD (ingresos y costos de insumos alineados con estados operativos).
              </p>
            </>
          ) : null}
        </>
      )}

      {tab === "descuentos" && (
        <>
          {loadingDesc ? (
            <div className="flex justify-center py-16">
              <i className="fas fa-circle-notch fa-spin fa-2x text-blue-500" />
            </div>
          ) : a ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-100 rounded-sm p-4">
                  <p className="text-[9px] font-black text-green-600 uppercase mb-1">
                    Descuentos ítems
                  </p>
                  <p className="text-2xl font-black text-green-800">
                    {formatCurrency(a.descuentoItems)}
                  </p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-sm p-4">
                  <p className="text-[9px] font-black text-red-600 uppercase mb-1">
                    Recargos ítems
                  </p>
                  <p className="text-2xl font-black text-red-800">
                    {formatCurrency(a.recargoItems)}
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-sm p-4">
                  <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">
                    Descuento global
                  </p>
                  <p className="text-2xl font-black text-emerald-800">
                    {formatCurrency(a.descuentoGlobal)}
                  </p>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-sm p-4">
                  <p className="text-[9px] font-black text-orange-600 uppercase mb-1">
                    Recargo global
                  </p>
                  <p className="text-2xl font-black text-orange-800">
                    {formatCurrency(a.recargoGlobal)}
                  </p>
                </div>
              </div>
              <div className="bg-slate-900 text-white rounded-sm p-5 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-300">Total descuentos</span>
                  <span className="font-black text-green-400">
                    {formatCurrency(totalDesc)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-300">Total recargos</span>
                  <span className="font-black text-orange-300">
                    {formatCurrency(totalRec)}
                  </span>
                </div>
                <div className="border-t border-slate-700 pt-3 flex justify-between">
                  <span className="font-black">Impacto neto</span>
                  <span
                    className={`text-xl font-black ${
                      totalRec - totalDesc >= 0
                        ? "text-orange-300"
                        : "text-green-400"
                    }`}
                  >
                    {totalRec - totalDesc >= 0 ? "+" : ""}
                    {formatCurrency(totalRec - totalDesc)}
                  </span>
                </div>
              </div>
              <p className="text-center text-[11px] text-slate-400 font-bold">
                {a.pedidosTotal} pedidos · {a.pedidosConAjuste} con ajuste
              </p>
              {totalesVista && (
                <div className="pt-2">
                  <BalanceOperacion t={totalesVista} />
                </div>
              )}
            </>
          ) : null}
        </>
      )}
    </section>
  );
};

function BalanceOperacion({ t }: { t: TotalesOperacion }) {
  return (
    <div className="bg-white rounded-sm border border-slate-100 p-5 shadow-sm space-y-3">
      <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
        Balance de operación
      </h2>
      <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
        Suma de <span className="text-slate-500">total_ingresos</span>,{" "}
        <span className="text-slate-500">total_insumos</span>,{" "}
        <span className="text-slate-500">total_comisiones</span> y{" "}
        <span className="text-slate-500">ganancia_neta</span> en el período (misma
        vista que la tarjeta superior).
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between font-bold text-slate-800">
          <span>Total facturado</span>
          <span>{formatCurrency(t.totalIngresos)}</span>
        </div>
        <div className="flex justify-between font-bold text-red-600">
          <span>− Costo insumos</span>
          <span>−{formatCurrency(t.totalInsumos)}</span>
        </div>
        <div className="flex justify-between font-bold text-purple-700">
          <span>− Comisiones</span>
          <span>−{formatCurrency(t.totalComisiones)}</span>
        </div>
        <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
          <span className="font-black text-slate-900">= Ganancia neta</span>
          <span className="font-black text-green-600 text-lg">
            {formatCurrency(t.gananciaNeta)}
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-100 rounded-sm p-3 text-center">
      <p className="text-[9px] font-black text-slate-400 uppercase">{label}</p>
      <p className="text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

export default ReportesPage;
