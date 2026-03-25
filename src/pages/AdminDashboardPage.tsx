/**
 * Dashboard Épica 4 — KPIs: `v_estadisticas_diarias`; ranking: `v_rendimiento_vendedores`;
 * gráfico 7 días: facturación vs costo total (insumos + comisiones).
 * Stock: alertas sobre `insumos` + umbrales papel/tóner; badge sidebar = bajo mínimo (`v_insumos_alerta_stock`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { insumosApi } from "../services/insumosApi";
import type { Insumo } from "../types/insumo";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { dashboardApi } from "../services/dashboardApi";
import type {
  EstadisticaDiaria,
  FiltroDashboardTiempo,
  RankingVendedor,
  TopProductoMargen
} from "../types/dashboard";
import { useStockBajo } from "../hooks/useInsumos";
import { StockAlertasCriticas } from "../components/dashboard/StockAlertasCriticas";
import { formatCurrency } from "../utils/formatters";
import { toDateStringAR } from "../utils/dateAr";
import { PuntoDeEquilibrioCard } from "../components/dashboard/PuntoDeEquilibrioCard";
import {
  fetchGastosFijosActivos,
  sumaMontosActivos
} from "../services/gastosFijosApi";
import { gastosFijosDevengadosHastaHoy } from "../utils/financialMonth";

function ultimos7DiasRango(): { desde: string; hasta: string } {
  const hasta = new Date();
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 6);
  return { desde: toDateStringAR(desde), hasta: toDateStringAR(hasta) };
}

function rellenarDias(
  rows: EstadisticaDiaria[],
  desde: string,
  hasta: string
): {
  dia: string;
  total_ingresos: number;
  ingresos_transferencia: number;
  ingresos_efectivo: number;
  ingresos_sin_forma: number;
  total_insumos: number;
  total_comisiones: number;
}[] {
  const map = new Map(rows.map((r) => [r.dia, r]));
  const out: {
    dia: string;
    total_ingresos: number;
    ingresos_transferencia: number;
    ingresos_efectivo: number;
    ingresos_sin_forma: number;
    total_insumos: number;
    total_comisiones: number;
  }[] = [];
  const cur = new Date(desde + "T12:00:00");
  const end = new Date(hasta + "T12:00:00");
  while (cur <= end) {
    const key = toDateStringAR(cur);
    const row = map.get(key);
    out.push({
      dia: key.slice(5),
      total_ingresos: row ? Number(row.total_ingresos) : 0,
      ingresos_transferencia: row
        ? Number(row.ingresos_transferencia ?? 0)
        : 0,
      ingresos_efectivo: row ? Number(row.ingresos_efectivo ?? 0) : 0,
      ingresos_sin_forma: row ? Number(row.ingresos_sin_forma ?? 0) : 0,
      total_insumos: row ? Number(row.total_insumos) : 0,
      total_comisiones: row
        ? Number((row as EstadisticaDiaria).total_comisiones ?? 0)
        : 0
    });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const FILTRO_LABEL: Record<FiltroDashboardTiempo, string> = {
  hoy: "Hoy",
  "7dias": "Últimos 7 días",
  mes: "Mes actual"
};

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { alertas: stockAlertas, reload: reloadStock } = useStockBajo(true);
  const [filtro, setFiltro] = useState<FiltroDashboardTiempo>("hoy");
  const [kpis, setKpis] = useState({
    totalFacturado: 0,
    ingresosTransferencia: 0,
    ingresosEfectivo: 0,
    ingresosSinForma: 0,
    costoInsumos: 0,
    costoComision: 0,
    gananciaNeta: 0,
    pctMargen: 0
  });
  const [insumosActivos, setInsumosActivos] = useState<Insumo[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [serie7, setSerie7] = useState<
    {
      dia: string;
      total_ingresos: number;
      ingresos_transferencia: number;
      ingresos_efectivo: number;
      ingresos_sin_forma: number;
      total_insumos: number;
      total_comisiones: number;
    }[]
  >([]);
  const [top3, setTop3] = useState<TopProductoMargen[]>([]);
  const [ranking, setRanking] = useState<RankingVendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [totalGastosFijosMes, setTotalGastosFijosMes] = useState(0);
  const [margenAcumuladoMes, setMargenAcumuladoMes] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const k = await dashboardApi.fetchKpisRango(filtro);
      setKpis({
        totalFacturado: k.totalFacturado,
        ingresosTransferencia: k.ingresosTransferencia,
        ingresosEfectivo: k.ingresosEfectivo,
        ingresosSinForma: k.ingresosSinForma,
        costoInsumos: k.costoInsumos,
        costoComision: k.costoComision,
        gananciaNeta: k.gananciaNeta,
        pctMargen: k.pctMargen
      });
      const p = await dashboardApi.fetchPedidosPendientes();
      setPendientes(p);

      const { desde: d7, hasta: h7 } = ultimos7DiasRango();
      const rows7 = await dashboardApi.fetchEstadisticasDiarias(d7, h7);
      setSerie7(rellenarDias(rows7, d7, h7));

      const { desde: ft, hasta: ht } = dashboardApi.rangoFiltro(filtro);
      const { desde: mesDesde, hasta: mesHasta } = dashboardApi.rangoFiltro("mes");
      const [top, rank, insList, gastosRows, statsMes] = await Promise.all([
        dashboardApi.fetchTopProductos(ft, ht, 3),
        dashboardApi.fetchRendimientoVendedores(),
        insumosApi.fetchAll(true).catch(() => [] as Insumo[]),
        fetchGastosFijosActivos().catch(() => []),
        dashboardApi.fetchEstadisticasDiarias(mesDesde, mesHasta)
      ]);
      setTotalGastosFijosMes(sumaMontosActivos(gastosRows));
      setMargenAcumuladoMes(
        statsMes.reduce((s, r) => s + Number(r.ganancia_neta ?? 0), 0)
      );
      setTop3(top);
      setRanking(rank);
      setInsumosActivos(insList);
      await reloadStock();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al cargar el panel";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [filtro, reloadStock]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const periodoVentas = useMemo(() => FILTRO_LABEL[filtro], [filtro]);

  const gastosDevengadosMes = useMemo(
    () => gastosFijosDevengadosHastaHoy(totalGastosFijosMes),
    [totalGastosFijosMes]
  );

  const gananciaRealEbitda = useMemo(
    () => kpis.gananciaNeta - gastosDevengadosMes,
    [kpis.gananciaNeta, gastosDevengadosMes]
  );

  const chartData = useMemo(
    () =>
      serie7.map((s) => ({
        dia: s.dia,
        ingreso_transf: s.ingresos_transferencia,
        ingreso_efectivo: s.ingresos_efectivo,
        ingreso_sin_forma: s.ingresos_sin_forma,
        costo_total: s.total_insumos + s.total_comisiones
      })),
    [serie7]
  );

  return (
    <section className="animate-fade-in space-y-5 pb-24 lg:pb-10 min-w-0 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">
            Panel de ganancias
          </h1>
          <p className="text-xs text-slate-500 font-semibold">
            Ingresos − insumos − comisiones · {periodoVentas}
          </p>
          <p className="text-[10px] text-slate-400 font-semibold mt-0.5 max-w-md">
            Desglose por forma de cobro (transferencia / efectivo)
            coincide con la vista diaria.{" "}
            <span className="text-slate-500">
              Facturación ARCA (pantalla Facturación): solo entregados con cobro
              total en transferencia.
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["hoy", "7dias", "mes"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                filtro === f
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {FILTRO_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 font-semibold">
          {err}
        </div>
      )}

      <StockAlertasCriticas insumos={insumosActivos} alertas={stockAlertas} />

      <PuntoDeEquilibrioCard
        totalGastosFijosMes={totalGastosFijosMes}
        margenAcumuladoMes={margenAcumuladoMes}
        loading={loading}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          title={`Ventas (${periodoVentas})`}
          value={formatCurrency(kpis.totalFacturado)}
          sub={
            kpis.totalFacturado > 0
              ? `Transf. ${formatCurrency(kpis.ingresosTransferencia)} · Efect. ${formatCurrency(kpis.ingresosEfectivo)}` +
                (kpis.ingresosSinForma > 0
                  ? ` · Sin dato ${formatCurrency(kpis.ingresosSinForma)}`
                  : "")
              : undefined
          }
          icon="fa-arrow-trend-up"
          tone="blue"
          loading={loading}
        />
        <KpiCard
          title={`Transferencia (${periodoVentas})`}
          sub="Base para facturación electrónica (pedidos con forma registrada)"
          value={formatCurrency(kpis.ingresosTransferencia)}
          icon="fa-building-columns"
          tone="violet"
          loading={loading}
        />
        <KpiCard
          title={`Efectivo (${periodoVentas})`}
          sub="No entra en export ARCA"
          value={formatCurrency(kpis.ingresosEfectivo)}
          icon="fa-money-bill-wave"
          tone="amber"
          loading={loading}
        />
        <KpiCard
          title={`Costo insumos (${periodoVentas})`}
          sub="Consumos registrados"
          value={formatCurrency(kpis.costoInsumos)}
          icon="fa-boxes-stacked"
          tone="slate"
          loading={loading}
        />
        <KpiCard
          title={`Comisiones (${periodoVentas})`}
          value={formatCurrency(kpis.costoComision)}
          icon="fa-hand-holding-dollar"
          tone="violet"
          loading={loading}
        />
        <KpiCard
          title={`Ganancia operativa (${periodoVentas})`}
          value={formatCurrency(kpis.gananciaNeta)}
          sub={`Ingresos − insumos − comisiones · Margen ${kpis.pctMargen.toFixed(1)}%`}
          icon="fa-sack-dollar"
          tone="emerald"
          loading={loading}
        />
        <KpiCard
          title="Ganancia real (EBITDA)"
          value={formatCurrency(gananciaRealEbitda)}
          sub={`Operativa − gastos fijos devengados (${formatCurrency(gastosDevengadosMes)} del mes)`}
          icon="fa-balance-scale"
          tone="slate"
          loading={loading}
        />
        <KpiCard
          title="Pedidos pendientes"
          value={loading ? "—" : String(pendientes)}
          icon="fa-hourglass-half"
          tone="amber"
          loading={loading}
        />
        <KpiCard
          title="Insumos bajo mínimo"
          value={loading ? "—" : String(stockAlertas.length)}
          icon="fa-triangle-exclamation"
          tone={stockAlertas.some((i) => Number(i.stock_actual) <= 0) ? "red" : "amber"}
          loading={loading}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-sm border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
            Ingresos por forma de cobro vs costo total · últimos 7 días
          </h2>
          <div className="h-64 w-full min-h-[16rem]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Cargando gráfico…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(value) =>
                      formatCurrency(typeof value === "number" ? value : Number(value))
                    }
                    labelFormatter={(l) => `Día ${l}`}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="ingreso_transf"
                    stackId="ing"
                    name="Transferencia"
                    fill="#2563eb"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="ingreso_efectivo"
                    stackId="ing"
                    name="Efectivo"
                    fill="#ca8a04"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="ingreso_sin_forma"
                    stackId="ing"
                    name="Sin forma"
                    fill="#94a3b8"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="costo_total"
                    stackId="cost"
                    name="Costo total (insumos + comisiones)"
                    fill="#64748b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-sm border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
            Top 3 · margen real ({periodoVentas})
          </h2>
          {loading ? (
            <p className="text-sm text-slate-400">Cargando…</p>
          ) : top3.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Sin datos en el período</p>
          ) : (
            <ol className="space-y-3">
              {top3.map((t, idx) => (
                <li
                  key={`${t.producto}-${idx}`}
                  className="rounded-sm bg-slate-50 border border-slate-100 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-black text-blue-600 shrink-0">
                      #{idx + 1}
                    </span>
                    <p className="text-xs font-bold text-slate-800 text-right flex-1 min-w-0 line-clamp-2">
                      {t.producto}
                    </p>
                  </div>
                  <p className="text-sm font-black text-emerald-700 mt-1 tabular-nums">
                    {formatCurrency(t.margen_neto)}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Venta {formatCurrency(t.venta_total)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="rounded-sm border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
          Ranking de vendedores
        </h2>
        <p className="text-[10px] text-slate-400 mb-3 font-semibold leading-relaxed">
          Vista acumulada (pedidos señado / pagado / listo / entregado). Solo el rol
          vendedor (externo) suma comisión; socios/admin pueden aparecer con $0.
        </p>
        {loading ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-slate-400 italic">
            Sin filas en la vista (sin vendedores cerrados o sin datos aún)
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                  <th className="pb-2 pr-4">Vendedor</th>
                  <th className="pb-2 pr-4 text-right">Pedidos</th>
                  <th className="pb-2 pr-4 text-right">Total facturado</th>
                  <th className="pb-2 text-right">Comisión acumulada</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr
                    key={r.vendedor_id}
                    className="border-b border-slate-50 font-semibold text-slate-800"
                  >
                    <td className="py-2.5 pr-4">{r.nombre}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {r.pedidos}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {formatCurrency(r.ventas_totales)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-violet-700">
                      {formatCurrency(r.comision_acumulada)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate("/pedidos")}
          className="px-4 py-3 rounded-sm bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-slate-800"
        >
          <i className="fas fa-clipboard-list mr-2" />
          Pedidos
        </button>
        <button
          type="button"
          onClick={() => navigate("/reportes")}
          className="px-4 py-3 rounded-sm border border-slate-200 bg-white text-slate-700 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-slate-50"
        >
          <i className="fas fa-chart-line mr-2" />
          Reportes
        </button>
        <button
          type="button"
          onClick={() => navigate("/admin/gastos")}
          className="px-4 py-3 rounded-sm border border-slate-200 bg-white text-slate-700 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-slate-50"
        >
          <i className="fas fa-receipt mr-2" />
          Gastos fijos
        </button>
      </div>
    </section>
  );
}

function KpiCard({
  title,
  value,
  sub,
  icon,
  tone,
  loading
}: {
  title: string;
  value: string;
  sub?: string;
  icon: string;
  tone: "blue" | "emerald" | "amber" | "red" | "violet" | "slate";
  loading: boolean;
}) {
  const ring =
    tone === "blue"
      ? "border-blue-100 bg-blue-50/50"
      : tone === "emerald"
        ? "border-emerald-100 bg-emerald-50/50"
        : tone === "red"
          ? "border-red-100 bg-red-50/50"
          : tone === "violet"
            ? "border-violet-100 bg-violet-50/50"
            : tone === "slate"
              ? "border-slate-200 bg-slate-50/80"
              : "border-amber-100 bg-amber-50/50";
  const ic =
    tone === "blue"
      ? "text-blue-600"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "red"
          ? "text-red-600"
          : tone === "violet"
            ? "text-violet-600"
            : tone === "slate"
              ? "text-slate-600"
              : "text-amber-600";

  return (
    <div className={`rounded-sm border p-4 shadow-sm ${ring}`}>
      <div className="flex items-center gap-2 mb-2">
        <i className={`fas ${icon} ${ic} text-sm`} />
        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 leading-tight">
          {title}
        </span>
      </div>
      <p className="text-lg font-black text-slate-900 tabular-nums truncate">
        {loading ? <span className="text-slate-300">…</span> : value}
      </p>
      {sub && !loading && (
        <p className="text-[10px] font-bold text-slate-500 mt-0.5">{sub}</p>
      )}
    </div>
  );
}
