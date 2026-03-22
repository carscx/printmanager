import type { Pedido, EstadoPedido } from "../../types/pedido";
import { normalizarEstadoPedido } from "../../utils/pedidoEstado";

interface PedidoEstadoSwitcherProps {
  pedido: Pedido;
  onTransition: (pedido: Pedido, nuevo: EstadoPedido) => void;
  disabled?: boolean;
}

/** Botón con relieve claro (no parece etiqueta). */
const btnAct =
  "inline-flex items-center justify-center gap-2 min-h-[48px] py-3 px-4 rounded-sm font-black uppercase text-[10px] tracking-wider w-full transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none border-2 border-b-[5px] shadow-md hover:brightness-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const badgeEstado =
  "inline-flex items-center justify-center min-h-[44px] w-full rounded-sm border-2 border-slate-200 bg-slate-50 px-4 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-600";

export function PedidoEstadoSwitcher({
  pedido,
  onTransition,
  disabled
}: PedidoEstadoSwitcherProps) {
  const estado = normalizarEstadoPedido(pedido.estado);
  const totalP = Number(pedido.total ?? pedido.total_pedido ?? 0);

  switch (estado) {
    case "presupuesto":
      return (
        <button
          type="button"
          onClick={() => onTransition(pedido, "pendiente")}
          className={`${btnAct} border-slate-700 bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400`}
          disabled={disabled}
        >
          Confirmar pedido
        </button>
      );
    case "pendiente":
      return (
        <div className="flex flex-col gap-2 w-full">
          <button
            type="button"
            onClick={() => onTransition(pedido, "listo")}
            className={`${btnAct} border-sky-700 bg-sky-100 text-sky-950 hover:bg-sky-200 focus-visible:ring-sky-400`}
            disabled={disabled}
          >
            Listo en taller
          </button>
          <button
            type="button"
            onClick={() => onTransition(pedido, "pagado")}
            className={`${btnAct} border-emerald-800 bg-emerald-100 text-emerald-950 hover:bg-emerald-200 focus-visible:ring-emerald-500`}
            disabled={disabled}
          >
            Cobrar total (
            {totalP > 0 ? `$${totalP.toLocaleString("es-AR")}` : "—"})
          </button>
        </div>
      );
    case "listo":
      return (
        <button
          type="button"
          onClick={() => onTransition(pedido, "pagado")}
          className={`${btnAct} border-emerald-800 bg-emerald-100 text-emerald-950 hover:bg-emerald-200 focus-visible:ring-emerald-500`}
          disabled={disabled}
        >
          Cobrar total
        </button>
      );
    case "pagado":
      return (
        <button
          type="button"
          onClick={() => onTransition(pedido, "entregado")}
          className={`${btnAct} border-violet-800 bg-violet-100 text-violet-950 hover:bg-violet-200 focus-visible:ring-violet-500`}
          disabled={disabled}
        >
          Marcar entregado
        </button>
      );
    case "entregado":
      return (
        <span className={badgeEstado}>
          <i className="fas fa-circle-check text-emerald-600 mr-2" aria-hidden />
          Entregado
        </span>
      );
    case "cancelado":
      return (
        <span className={`${badgeEstado} border-red-200 bg-red-50 text-red-700`}>
          <i className="fas fa-ban mr-2" aria-hidden />
          Cancelado
        </span>
      );
    default:
      return null;
  }
}
