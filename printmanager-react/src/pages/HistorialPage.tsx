import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type { Pedido } from "../types/pedido";
import { formatCurrency, formatDate } from "../utils/formatters";
import { showToast } from "../components/ui/Toast";

type DatePreset = "hoy" | "semana" | "mes" | "custom";
type TipoTrabajo = "bn" | "color" | "anillado" | "todos";

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

function toISO(d: Date) {
  return d.toISOString();
}

function pedidosToCSV(pedidos: Pedido[]) {
  const headers = [
    "id",
    "cliente",
    "estado",
    "total",
    "sena",
    "fecha_entrega",
    "fecha_pago",
    "created_at",
    "observaciones",
    "items"
  ];
  const rows = pedidos.map((p) => {
    const items = (p.pedido_items || [])
      .map(
        (it) =>
          `${it.nombre_archivo} (${it.paginas}p${(it.copias ?? 1) > 1 ? ` x${it.copias}` : ""})`
      )
      .join(" | ");
    return [
      p.id,
      p.cliente,
      p.estado,
      String(p.total ?? p.total_pedido ?? 0),
      String(p.sena ?? 0),
      p.fecha_entrega ?? "",
      p.fecha_pago ?? "",
      p.created_at ?? "",
      (p.observaciones ?? "").replace(/\n/g, " "),
      items.replace(/\n/g, " ")
    ];
  });

  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join(
    "\n"
  );
}

const HistorialPage = () => {
  const [loading, setLoading] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);

  // filtros
  const [datePreset, setDatePreset] = useState<DatePreset>("mes");
  const [fromCustom, setFromCustom] = useState("");
  const [toCustom, setToCustom] = useState("");
  const [estado, setEstado] = useState<string>("todos");
  const [tipoTrabajo, setTipoTrabajo] = useState<TipoTrabajo>("todos");
  const [clienteQuery, setClienteQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // paginación
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const dateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === "hoy") {
      return { from: startOfDay(now), to: endOfDay(now) };
    }
    if (datePreset === "semana") {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 7);
      return { from, to: endOfDay(now) };
    }
    if (datePreset === "mes") {
      const from = startOfDay(now);
      from.setDate(1);
      return { from, to: endOfDay(now) };
    }
    // custom
    const from = fromCustom ? startOfDay(new Date(fromCustom)) : null;
    const to = toCustom ? endOfDay(new Date(toCustom)) : null;
    return { from, to };
  }, [datePreset, fromCustom, toCustom]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { pedidos: data, total: totalCount } = await api.fetchHistorial({
        page,
        pageSize,
        fromDate: dateRange.from ? toISO(dateRange.from) : null,
        toDate: dateRange.to ? toISO(dateRange.to) : null,
        estado: estado === "todos" ? null : estado,
        clienteQuery: clienteQuery.trim() ? clienteQuery.trim() : null,
        searchQuery: searchQuery.trim() ? searchQuery.trim() : null,
        tipoTrabajo: tipoTrabajo === "todos" ? null : tipoTrabajo
      });
      setPedidos(data);
      setTotal(totalCount);
    } catch (err) {
      console.error("Error loading historial:", err);
      showToast("ERROR AL CARGAR HISTORIAL", "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, dateRange.from, dateRange.to, estado, clienteQuery, searchQuery, tipoTrabajo]);

  // reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [datePreset, fromCustom, toCustom, estado, tipoTrabajo, clienteQuery, searchQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExportCSV = () => {
    const csv = pedidosToCSV(pedidos);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial_pedidos_page_${page + 1}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="animate-fade-in space-y-4 pb-24 lg:max-w-5xl lg:mx-auto">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-black uppercase tracking-tighter text-slate-900">
            Historial
          </h1>
          <p className="text-xs text-slate-400 font-bold">
            {total} pedidos encontrados
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCSV}
          className="px-4 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 cursor-pointer"
        >
          <i className="fas fa-file-csv" />
          Exportar CSV
        </button>
      </header>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Rango
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-xs"
            >
              <option value="hoy">Hoy</option>
              <option value="semana">Últimos 7 días</option>
              <option value="mes">Este mes</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Estado
            </label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-xs"
            >
              <option value="todos">Todos</option>
              <option value="presupuesto">Presupuesto</option>
              <option value="pendiente">Pendiente</option>
              <option value="señado">Señado</option>
              <option value="pagado">Pagado</option>
              <option value="entregado">Entregado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Tipo trabajo
            </label>
            <select
              value={tipoTrabajo}
              onChange={(e) => setTipoTrabajo(e.target.value as TipoTrabajo)}
              className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-xs"
            >
              <option value="todos">Todos</option>
              <option value="bn">B&N</option>
              <option value="color">Color</option>
              <option value="anillado">Con anillado</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Cliente
            </label>
            <input
              value={clienteQuery}
              onChange={(e) => setClienteQuery(e.target.value)}
              placeholder="Buscar por cliente…"
              className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-xs outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {datePreset === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                Desde
              </label>
              <input
                type="date"
                value={fromCustom}
                onChange={(e) => setFromCustom(e.target.value)}
                className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                Hasta
              </label>
              <input
                type="date"
                value={toCustom}
                onChange={(e) => setToCustom(e.target.value)}
                className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-xs"
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
            Búsqueda libre (cliente, observaciones, nombre de archivo)
          </label>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ej: 'Juan', 'urgente', 'tp_final.pdf'…"
            className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 font-bold text-xs outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* Resultados */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-16 text-slate-300 italic text-sm">
            Cargando historial...
          </div>
        ) : pedidos.length === 0 ? (
          <div className="text-center py-16 text-slate-300 italic text-sm">
            No se encontraron pedidos con esos filtros.
          </div>
        ) : (
          pedidos.map((p) => {
            const totalP = Number(p.total ?? p.total_pedido ?? 0);
            const senaP = Number(p.sena ?? 0);
            return (
              <div
                key={p.id}
                className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                      {p.estado}
                    </p>
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-tighter leading-none">
                      {p.cliente}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-bold mt-1">
                      {p.fecha_pago ? `Pago: ${formatDate(p.fecha_pago)}` : ""}
                      {p.created_at ? ` · Creado: ${formatDate(p.created_at)}` : ""}
                    </p>
                  </div>
                  <div className="text-right leading-none">
                    <p className="text-xl font-black text-slate-900">
                      {formatCurrency(totalP)}
                    </p>
                    {senaP > 0 && senaP < totalP && (
                      <p className="text-[10px] text-slate-400 font-bold mt-1">
                        Seña: {formatCurrency(senaP)}
                      </p>
                    )}
                  </div>
                </div>

                {(p.observaciones || "").trim() && (
                  <p className="mt-3 text-[11px] font-bold text-amber-700 bg-amber-50 p-3 rounded-2xl border border-amber-100">
                    <i className="fas fa-sticky-note mr-2" />
                    {p.observaciones}
                  </p>
                )}

                <div className="mt-3 space-y-1 opacity-80">
                  {(p.pedido_items || []).map((it) => (
                    <p
                      key={it.id ?? it.nombre_archivo}
                      className="text-[11px] font-bold text-slate-600"
                    >
                      • {it.nombre_archivo} — {it.paginas} pág
                      {(it.copias ?? 1) > 1 ? ` ×${it.copias}` : ""} —{" "}
                      {it.tipo_impresion || "MIGRADO"}
                      {it.anillado ? ` + ${it.anillado}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || loading}
          className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] ${
            page === 0 || loading
              ? "bg-slate-50 text-slate-300"
              : "bg-slate-100 text-slate-700 cursor-pointer"
          }`}
        >
          Anterior
        </button>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          Página {page + 1} de {totalPages}
        </p>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1 || loading}
          className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] ${
            page >= totalPages - 1 || loading
              ? "bg-slate-50 text-slate-300"
              : "bg-slate-100 text-slate-700 cursor-pointer"
          }`}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
};

export default HistorialPage;
