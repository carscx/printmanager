import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Pedido, VistaTab } from "../types/pedido";
import type { AppConfig } from "../types/config";
import { usePedidos } from "../hooks/usePedidos";
import { useDescontarStock } from "../hooks/useDescontarStock";
import { useResumen } from "../hooks/useResumen";
import { useStockBajo } from "../hooks/useInsumos";
import { ResumenDiario } from "../components/pedidos/ResumenDiario";
import { PedidoList } from "../components/pedidos/PedidoList";
import { ConfirmSheet, useConfirmSheet } from "../components/ui/ConfirmSheet";
import { showToast } from "../components/ui/Toast";
import { useCartStore } from "../store/useCartStore";
import { formatCurrency } from "../utils/formatters";
import { INSUMO_UNIDAD_LABELS } from "../types/insumo";

interface DashboardPageProps {
  settings: AppConfig;
}

export function DashboardPage({}: DashboardPageProps) {
  const navigate = useNavigate();
  const [vistaActual, setVistaActual] = useState<VistaTab>("taller");
  const { pedidos, load: loadPedidos } = usePedidos();
  const { resumen, load: loadResumen } = useResumen();
  const { alertas: stockBajo } = useStockBajo(true);
  const {
    state: confirmState,
    abrir: abrirConfirm,
    cerrar: cerrarConfirm
  } = useConfirmSheet();
  const { cambiarEstado, entregar, cobrar, borrar } = usePedidos();

  const { descontar, restaurar, error: stockError } = useDescontarStock();

  const cartStore = useCartStore();

  const refresh = useCallback(async () => {
    await loadPedidos(vistaActual === "historial");
    await loadResumen();
  }, [vistaActual, loadPedidos, loadResumen]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCambiarVista = (v: VistaTab) => {
    setVistaActual(v);
  };

  const handleBorrar = (id: string) => {
    abrirConfirm(
      "danger",
      "¿Borrar pedido?",
      "Se eliminará permanentemente.",
      async () => {
        await borrar(id);
        showToast("PEDIDO ELIMINADO");
        refresh();
      }
    );
  };

  const handleEditar = (p: Pedido) => {
    const totalP = p.total || p.total_pedido || 0;
    const senaP = p.sena || 0;
    cartStore.setEditandoPedidoId(p.id);
    cartStore.setItems([...p.pedido_items]);
    cartStore.setClienteNombre(p.cliente);
    cartStore.setFechaEntrega(p.fecha_entrega || "");
    cartStore.setObservaciones(p.observaciones || "");

    if (senaP === 0) cartStore.setTipoPago("sin_pago");
    else if (senaP >= totalP) cartStore.setTipoPago("pago_total");
    else if (senaP === Math.round(totalP * 0.5))
      cartStore.setTipoPago("sena_50");
    else {
      cartStore.setTipoPago("sena_libre");
      cartStore.setSenaLibreMonto(senaP);
    }
    navigate("/nuevo-pedido");
  };

  const handleEstado = async (id: string, nuevoEstado: string) => {
    await cambiarEstado(id, nuevoEstado);
    // Descontar stock al pasar a 'señado' o 'pagado'
    if (nuevoEstado === "señado" || nuevoEstado === "pagado") {
      await descontar(id);
      if (stockError) {
        showToast("ERROR al descontar stock: " + stockError);
      } else {
        showToast("Stock descontado correctamente");
      }
    } else if (nuevoEstado === "cancelado") {
      await restaurar(id);
      if (stockError) {
        showToast("ERROR al restaurar stock: " + stockError);
      } else {
        showToast("Stock restaurado correctamente");
      }
    } else {
      showToast(`PEDIDO MARCADO COMO ${nuevoEstado.toUpperCase()}`);
    }
    refresh();
  };

  const handleEntregar = (p: Pedido) => {
    abrirConfirm(
      "success",
      "¿Pedido entregado?",
      "Se marcará como cobrado y pasará al historial.",
      async () => {
        const totalP = p.total || p.total_pedido || 0;
        await entregar(p.id, totalP);
        showToast("PEDIDO ENTREGADO Y COBRADO");
        refresh();
      }
    );
  };

  const handleCobrar = (p: Pedido) => {
    const totalP = p.total || p.total_pedido || 0;
    abrirConfirm(
      "success",
      "¿Marcar como cobrado?",
      `Se registrará el pago total de ${formatCurrency(totalP)}.`,
      async () => {
        await cobrar(p.id, totalP);
        showToast("PEDIDO COBRADO");
        refresh();
      }
    );
  };

  const handleWA = (p: Pedido) => {
    navigate(`/pedido/${p.id}/whatsapp`);
  };

  return (
    <section className="animate-fade-in space-y-4">
      {/* Resumen + alertas: horizontal scroll on mobile, sidebar on lg */}
      <div className="flex gap-3 overflow-x-auto pb-1 lg:hidden scrollbar-hide">
        <div className="flex-shrink-0 w-[70vw]">
          <ResumenDiario resumen={resumen} />
        </div>
        {stockBajo.length > 0 && (
          <button
            onClick={() => navigate("/insumos")}
            className="flex-shrink-0 w-[55vw] bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-1">
              <i className="fas fa-triangle-exclamation text-amber-500" />
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                Stock bajo ({stockBajo.length})
              </span>
            </div>
            <div className="space-y-1">
              {stockBajo.slice(0, 3).map((i) => (
                <p
                  key={i.id}
                  className="text-xs text-amber-700 font-semibold truncate"
                >
                  {i.nombre}:{" "}
                  <span className="font-black">
                    {i.stock_actual} {INSUMO_UNIDAD_LABELS[i.unidad]}
                  </span>
                </p>
              ))}
            </div>
          </button>
        )}
      </div>

      {/* Tabs vista */}
      <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 sticky top-2 z-30">
        <button
          onClick={() => handleCambiarVista("taller")}
          className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
            vistaActual === "taller"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-400"
          }`}
        >
          En taller
        </button>
        <button
          onClick={() => handleCambiarVista("historial")}
          className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
            vistaActual === "historial"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-400"
          }`}
        >
          Historial
        </button>
      </div>

      {/* Desktop: grid layout with sidebar */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-8">
        {/* Sidebar - only visible on desktop */}
        <div className="hidden lg:block lg:col-span-1 space-y-4">
          <ResumenDiario resumen={resumen} />
          {stockBajo.length > 0 && (
            <button
              onClick={() => navigate("/insumos")}
              className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-2">
                <i className="fas fa-triangle-exclamation text-amber-500" />
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                  Stock bajo ({stockBajo.length})
                </span>
              </div>
              <div className="space-y-1">
                {stockBajo.slice(0, 3).map((i) => (
                  <p
                    key={i.id}
                    className="text-xs text-amber-700 font-semibold truncate"
                  >
                    {i.nombre}:{" "}
                    <span className="font-black">
                      {i.stock_actual} {INSUMO_UNIDAD_LABELS[i.unidad]}
                    </span>
                  </p>
                ))}
                {stockBajo.length > 3 && (
                  <p className="text-[10px] text-amber-500 font-bold">
                    +{stockBajo.length - 3} más...
                  </p>
                )}
              </div>
            </button>
          )}
        </div>

        {/* Main list */}
        <div className="lg:col-span-2">
          <PedidoList
            pedidos={pedidos}
            vistaActual={vistaActual}
            onBorrar={handleBorrar}
            onEditar={handleEditar}
            onEstado={handleEstado}
            onEntregar={handleEntregar}
            onCobrar={handleCobrar}
            onWA={handleWA}
          />
        </div>
      </div>

      <ConfirmSheet {...confirmState} onClose={cerrarConfirm} />
    </section>
  );
}
