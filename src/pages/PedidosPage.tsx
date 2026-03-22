import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Pedido, EstadoPedido } from "../types/pedido";
import { usePedidos } from "../hooks/usePedidos";
import { PedidoList } from "../components/pedidos/PedidoList";
import { ConfirmSheet, useConfirmSheet } from "../components/ui/ConfirmSheet";
import { showToast } from "../components/ui/Toast";
import { SkeletonPedidoList } from "../components/ui/Skeleton";
import { useCartStore } from "../store/useCartStore";
import { api, type HistorialFiltros } from "../services/api";
import { normalizarEstadoPedido } from "../utils/pedidoEstado";
import { pedidosToCSV } from "../utils/pedidosCsv";
import { ActionSheet, ActionSheetTrigger } from "../components/ui/ActionSheet";

type DatePreset = "todo" | "hoy" | "semana" | "mes" | "custom";
type TipoTrabajo = "bn" | "color" | "anillado" | "todos";
type CobranzaFiltro = "todos" | "impago" | "pagado";

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

export function PedidosPage() {
  const navigate = useNavigate();
  const { borrar } = usePedidos();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [datePreset, setDatePreset] = useState<DatePreset>("todo");
  const [fromCustom, setFromCustom] = useState("");
  const [toCustom, setToCustom] = useState("");
  const [estado, setEstado] = useState<string>("todos");
  const [tipoTrabajo, setTipoTrabajo] = useState<TipoTrabajo>("todos");
  const [cobranza, setCobranza] = useState<CobranzaFiltro>("todos");
  const [clienteQuery, setClienteQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [openRango, setOpenRango] = useState(false);
  const [openEstado, setOpenEstado] = useState(false);
  const [openTipo, setOpenTipo] = useState(false);
  const [openCobranza, setOpenCobranza] = useState(false);

  const [page, setPage] = useState(0);
  const pageSize = 15;
  const [exportingAll, setExportingAll] = useState(false);

  const {
    state: confirmState,
    abrir: abrirConfirm,
    cerrar: cerrarConfirm
  } = useConfirmSheet();

  const presetOpts = useMemo(
    () =>
      [
        { value: "todo" as const, label: "Todo el período" },
        { value: "hoy" as const, label: "Hoy" },
        { value: "semana" as const, label: "Últimos 7 días" },
        { value: "mes" as const, label: "Este mes" },
        { value: "custom" as const, label: "Personalizado" }
      ] as const,
    []
  );
  const estadoOpts = useMemo(
    () =>
      [
        { value: "todos", label: "Todos" },
        { value: "presupuesto", label: "Presupuesto" },
        { value: "pendiente", label: "Pendiente" },
        { value: "listo", label: "Listo" },
        { value: "pagado", label: "Pagado" },
        { value: "entregado", label: "Entregado" },
        { value: "cancelado", label: "Cancelado" }
      ] as const,
    []
  );
  const tipoOpts = useMemo(
    () =>
      [
        { value: "todos" as const, label: "Todos" },
        { value: "bn" as const, label: "B&N" },
        { value: "color" as const, label: "Color" },
        { value: "anillado" as const, label: "Con anillado" }
      ] as const,
    []
  );
  const cobranzaOpts = useMemo(
    () =>
      [
        { value: "todos" as const, label: "Todos" },
        {
          value: "impago" as const,
          label: "Sin cobrar (presup. / taller / listo)"
        },
        { value: "pagado" as const, label: "Pagado o entregado" }
      ] as const,
    []
  );

  const dateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === "todo") {
      return { from: null as Date | null, to: null as Date | null };
    }
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
    const from = fromCustom ? startOfDay(new Date(fromCustom)) : null;
    const to = toCustom ? endOfDay(new Date(toCustom)) : null;
    return { from, to };
  }, [datePreset, fromCustom, toCustom]);

  const filtrosHistorial = useMemo((): HistorialFiltros => {
    return {
      fromDate: dateRange.from ? toISO(dateRange.from) : null,
      toDate: dateRange.to ? toISO(dateRange.to) : null,
      estado: estado === "todos" ? null : estado,
      clienteQuery: clienteQuery.trim() ? clienteQuery.trim() : null,
      searchQuery: searchQuery.trim() ? searchQuery.trim() : null,
      tipoTrabajo: tipoTrabajo === "todos" ? null : tipoTrabajo,
      cobranza: cobranza === "todos" ? null : cobranza
    };
  }, [
    dateRange.from,
    dateRange.to,
    estado,
    clienteQuery,
    searchQuery,
    tipoTrabajo,
    cobranza
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { pedidos: data, total: totalCount } = await api.fetchHistorial({
        ...filtrosHistorial,
        page,
        pageSize
      });
      setPedidos(data);
      setTotal(totalCount);
    } catch (err) {
      console.error("Error loading pedidos:", err);
      showToast("ERROR AL CARGAR PEDIDOS", "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filtrosHistorial]);

  useEffect(() => {
    setPage(0);
  }, [
    datePreset,
    fromCustom,
    toCustom,
    estado,
    tipoTrabajo,
    cobranza,
    clienteQuery,
    searchQuery
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const handleBorrar = (id: string) => {
    abrirConfirm(
      "danger",
      "¿Borrar pedido?",
      "Se eliminará permanentemente.",
      async () => {
        await borrar(id);
        showToast("PEDIDO ELIMINADO");
        await refresh();
      }
    );
  };

  const handleEditar = async (p: Pedido) => {
    try {
      const full = await api.fetchPedidoById(p.id);
      if (!full) {
        showToast("No se encontró el pedido", "error");
        return;
      }
      useCartStore.getState().hydrateFromPedido(full);
      navigate("/nuevo-pedido");
    } catch (e) {
      console.error(e);
      showToast("Error al cargar el pedido para editar", "error");
    }
  };

  const handleTransition = async (p: Pedido, nuevo: EstadoPedido) => {
    const act = normalizarEstadoPedido(p.estado);
    const totalP = Number(p.total ?? p.total_pedido ?? 0);

    try {
      if (nuevo === "cancelado") {
        await api.cambiarEstadoPedido(p.id, "cancelado");
        showToast("PEDIDO CANCELADO");
        await refresh();
        return;
      }

      if (nuevo === "pendiente" && act === "presupuesto") {
        await api.rpcConvertirPresupuestoAPedido(p.id);
        showToast("PEDIDO CONFIRMADO");
        await refresh();
        return;
      }

      if (nuevo === "listo") {
        if (act !== "pendiente") {
          showToast("Solo se puede marcar listo desde pendiente", "error");
          return;
        }
        await api.updatePedidoPatch(p.id, { estado: "listo" });
        showToast("LISTO EN TALLER");
        await refresh();
        return;
      }

      if (nuevo === "pagado") {
        await api.updatePedidoPatch(p.id, {
          estado: "pagado",
          sena: totalP
        });
        showToast("PAGO REGISTRADO");
        await refresh();
        return;
      }

      if (nuevo === "entregado") {
        if (act !== "pagado") {
          showToast("Solo se puede entregar si está pagado", "error");
          return;
        }
        await api.updatePedidoPatch(p.id, {
          estado: "entregado",
          entregado: true,
          fecha_pago: new Date().toISOString()
        });
        showToast("ENTREGADO");
        await refresh();
        return;
      }

      showToast("TRANSICIÓN NO PERMITIDA", "error");
    } catch (e) {
      console.error(e);
      showToast("NO SE PUDO ACTUALIZAR EL PEDIDO", "error");
    }
  };

  const handleWA = (p: Pedido) => {
    navigate(`/pedido/${p.id}/whatsapp`);
  };

  const triggerDownload = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    triggerDownload(pedidosToCSV(pedidos), `pedidos_p${page + 1}.csv`);
  };

  const handleExportTodos = async () => {
    if (total === 0) return;
    setExportingAll(true);
    try {
      const todos = await api.fetchHistorialTodos(filtrosHistorial);
      if (todos.length === 0) {
        showToast("No hay pedidos para exportar", "error");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      triggerDownload(
        pedidosToCSV(todos),
        `pedidos_completos_${stamp}.csv`
      );
      showToast(`${todos.length} pedidos exportados`);
    } catch (e) {
      console.error(e);
      showToast("ERROR AL EXPORTAR", "error");
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <section className="animate-fade-in min-w-0 pb-24 lg:pb-10 lg:max-w-5xl lg:mx-auto space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-black uppercase tracking-tighter text-slate-900">
            Pedidos
          </h1>
          <p className="text-xs text-slate-400 font-bold">
            {total} pedidos · página {page + 1}/{totalPages}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={pedidos.length === 0 || exportingAll}
            className="px-4 py-3 rounded-sm bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            <i className="fas fa-file-csv" />
            CSV esta página
          </button>
          <button
            type="button"
            onClick={() => void handleExportTodos()}
            disabled={total === 0 || exportingAll || loading}
            className="px-4 py-3 rounded-sm bg-emerald-700 text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            {exportingAll ? (
              <>
                <i className="fas fa-spinner fa-spin" />
                Exportando…
              </>
            ) : (
              <>
                <i className="fas fa-download" />
                CSV todos ({total})
              </>
            )}
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-sm border border-slate-100 shadow-sm space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <ActionSheetTrigger
            label="Período"
            displayValue={
              presetOpts.find((o) => o.value === datePreset)?.label ?? ""
            }
            onClick={() => setOpenRango(true)}
          />
          <ActionSheetTrigger
            label="Estado"
            displayValue={
              estadoOpts.find((o) => o.value === estado)?.label ?? ""
            }
            onClick={() => setOpenEstado(true)}
          />
          <ActionSheetTrigger
            label="Cobranza"
            displayValue={
              cobranzaOpts.find((o) => o.value === cobranza)?.label ?? ""
            }
            onClick={() => setOpenCobranza(true)}
          />
          <ActionSheetTrigger
            label="Tipo trabajo"
            displayValue={
              tipoOpts.find((o) => o.value === tipoTrabajo)?.label ?? ""
            }
            onClick={() => setOpenTipo(true)}
          />

          <div className="space-y-1 col-span-2 lg:col-span-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Cliente
            </label>
            <input
              value={clienteQuery}
              onChange={(e) => setClienteQuery(e.target.value)}
              placeholder="Nombre…"
              className="w-full p-3 rounded-sm bg-slate-50 border border-slate-100 font-bold text-xs outline-none focus:ring-2 focus:ring-blue-100"
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
                className="w-full p-3 rounded-sm bg-slate-50 border border-slate-100 font-bold text-xs"
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
                className="w-full p-3 rounded-sm bg-slate-50 border border-slate-100 font-bold text-xs"
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
            Búsqueda (cliente, observaciones, archivo)
          </label>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ej: Juan, urgente, archivo.pdf…"
            className="w-full p-3 rounded-sm bg-slate-50 border border-slate-100 font-bold text-xs outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="min-w-0">
        {loading ? (
          <SkeletonPedidoList count={6} />
        ) : (
          <PedidoList
            pedidos={pedidos}
            onBorrar={handleBorrar}
            onEditar={handleEditar}
            onTransition={handleTransition}
            onWA={handleWA}
          />
        )}
      </div>

      <div className="flex items-center justify-between bg-white p-3 rounded-sm border border-slate-100 shadow-sm">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || loading}
          className={`px-4 py-3 rounded-sm text-[10px] font-black uppercase tracking-[0.2em] ${
            page === 0 || loading
              ? "bg-slate-50 text-slate-300"
              : "bg-slate-100 text-slate-700 cursor-pointer"
          }`}
        >
          Anterior
        </button>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          {total === 0 ? "—" : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} de ${total}`}
        </p>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1 || loading || total === 0}
          className={`px-4 py-3 rounded-sm text-[10px] font-black uppercase tracking-[0.2em] ${
            page >= totalPages - 1 || loading || total === 0
              ? "bg-slate-50 text-slate-300"
              : "bg-slate-100 text-slate-700 cursor-pointer"
          }`}
        >
          Siguiente
        </button>
      </div>

      <ActionSheet
        open={openRango}
        onClose={() => setOpenRango(false)}
        title="Período"
        options={[...presetOpts]}
        value={datePreset}
        onChange={(v) => setDatePreset(v as DatePreset)}
      />
      <ActionSheet
        open={openEstado}
        onClose={() => setOpenEstado(false)}
        title="Estado del pedido"
        options={[...estadoOpts]}
        value={estado}
        onChange={setEstado}
      />
      <ActionSheet
        open={openCobranza}
        onClose={() => setOpenCobranza(false)}
        title="Cobranza"
        options={[...cobranzaOpts]}
        value={cobranza}
        onChange={(v) => setCobranza(v as CobranzaFiltro)}
      />
      <ActionSheet
        open={openTipo}
        onClose={() => setOpenTipo(false)}
        title="Tipo de trabajo"
        options={[...tipoOpts]}
        value={tipoTrabajo}
        onChange={(v) => setTipoTrabajo(v as TipoTrabajo)}
      />

      <ConfirmSheet {...confirmState} onClose={cerrarConfirm} />
    </section>
  );
}
