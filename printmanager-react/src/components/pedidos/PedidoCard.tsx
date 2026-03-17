import type { Pedido, EstadoPedido } from "../../types/pedido";
import { PedidoEstadoSwitcher } from "./PedidoEstadoSwitcher";
import { Badge } from "../ui/Badge";
import { formatCurrency, formatDateFromInput } from "../../utils/formatters";

interface PedidoCardProps {
  pedido: Pedido;
  onBorrar: (id: string) => void;
  onEditar: (p: Pedido) => void;
  onEstado: (id: string, estado: string) => void;
  onEntregar: (p: Pedido) => void;
  onCobrar: (p: Pedido) => void;
  onWA: (p: Pedido) => void;
}

export function PedidoCard({
  pedido: p,
  onBorrar,
  onEditar,
  onEstado,
  onWA
}: PedidoCardProps) {
  // 1. Normalización del estado para evitar el error de 'undefined'
  const estadoRaw = (p.estado as EstadoPedido) || "presupuesto";

  // 2. Configuración de estilos por estado para el borde
  const borderConfig: Record<EstadoPedido, string> = {
    presupuesto: "border-amber-400",
    pendiente: "border-slate-400",
    señado: "border-yellow-400",
    pagado: "border-blue-400",
    entregado: "border-green-500",
    cancelado: "border-red-500"
  };
  const currentBorder = borderConfig[estadoRaw] || borderConfig["presupuesto"];

  const items = p.pedido_items || [];
  const fDate = p.fecha_entrega ? formatDateFromInput(p.fecha_entrega) : "⏳";
  const totalP = Number(p.total ?? p.total_pedido ?? 0);
  const senaP = Number(p.sena ?? 0);

  return (
    <div
      className={`bg-white rounded-[2rem] shadow-sm border border-gray-100 border-l-[10px] ${currentBorder} p-5 mb-4 transition-all hover:shadow-md animate-slide-in-right`}
    >
      {/* HEADER: Cliente y Acciones de Gestión */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-slate-900 text-xl md:text-2xl uppercase leading-none tracking-tighter truncate">
            {p.cliente}
          </h3>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge
              text={`${items.length} ARCS`}
              className="bg-slate-100 text-slate-500 font-bold text-[10px]"
            />
            <Badge
              text={fDate}
              className="bg-blue-50 text-blue-600 font-bold text-[10px]"
            />
          </div>
        </div>

        <div className="flex gap-1 shrink-0 bg-slate-50 p-1 rounded-2xl">
          <button
            onClick={() => onEditar(p)}
            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
            title="Editar"
          >
            <i className="fas fa-edit text-lg" />
          </button>
          {estadoRaw !== "cancelado" && (
            <button
              onClick={() => onEstado(p.id, "cancelado")}
              className="p-2 text-slate-400 hover:text-orange-500 transition-colors"
              title="Cancelar Pedido"
            >
              <i className="fas fa-ban text-lg" />
            </button>
          )}
          <button
            onClick={() => onBorrar(p.id)}
            className="p-2 text-slate-400 hover:text-red-600 transition-colors"
            title="Eliminar"
          >
            <i className="fas fa-trash-alt text-lg" />
          </button>
        </div>
      </div>

      {/* CONTENIDO: Detalles del pedido y Precio */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div className="space-y-2">
          {items.slice(0, 3).map((it, idx) => (
            <p
              key={idx}
              className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-2"
            >
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              {it.paginas || 0} PAG{" "}
              {(it.copias ?? 1) > 1 ? `×${it.copias}` : ""} |{" "}
              {it.tipo_impresion}
            </p>
          ))}
          {items.length > 3 && (
            <p className="text-[10px] text-slate-400 font-bold pl-3">
              + {items.length - 3} archivos más...
            </p>
          )}

          {p.observaciones && (
            <div className="mt-3 p-3 rounded-2xl bg-amber-50 border border-amber-100 text-[12px] font-bold text-amber-700 italic flex items-start gap-2">
              <i className="fas fa-sticky-note mt-0.5 opacity-60" />
              <span>{p.observaciones}</span>
            </div>
          )}
        </div>

        <div className="text-right">
          <p className="text-4xl md:text-5xl font-black text-slate-900 leading-none tracking-tighter">
            {formatCurrency(totalP)}
          </p>
          <div className="mt-1">
            {senaP >= totalP && totalP > 0 ? (
              <span className="text-[11px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded-lg">
                PAGADO
              </span>
            ) : (
              <span
                className={`text-[11px] font-black uppercase tracking-widest ${senaP > 0 ? "text-blue-600" : "text-red-500"}`}
              >
                {senaP > 0 ? `SEÑA: ${formatCurrency(senaP)}` : "SIN SEÑA"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER: Estado y acciones */}
      <div className="mt-6 flex flex-col gap-3">
        <PedidoEstadoSwitcher
          estado={estadoRaw}
          onEstado={onEstado}
          pedidoId={p.id}
        />
        <button
          onClick={() => onWA(p)}
          className="flex-1 bg-[#00bb2d] hover:bg-green-600 text-white py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-95 border-b-4 border-green-800/20"
        >
          <i className="fab fa-whatsapp text-2xl" /> WHATSAPP
        </button>
      </div>
    </div>
  );
}
