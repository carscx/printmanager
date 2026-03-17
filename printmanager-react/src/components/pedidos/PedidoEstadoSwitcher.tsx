import type { EstadoPedido } from "../../types/pedido";

interface PedidoEstadoSwitcherProps {
  estado: EstadoPedido;
  onEstado: (id: string, estado: EstadoPedido) => void;
  pedidoId: string;
  disabled?: boolean;
}

export function PedidoEstadoSwitcher({
  estado,
  onEstado,
  pedidoId,
  disabled
}: PedidoEstadoSwitcherProps) {
  // Acciones según el estado actual
  switch (estado) {
    case "presupuesto":
      return (
        <button
          onClick={() => onEstado(pedidoId, "pendiente")}
          className="py-2 px-4 rounded-xl font-black uppercase text-[10px] tracking-wider bg-amber-100 text-amber-700 shadow-sm w-full"
          disabled={disabled}
        >
          Confirmar pedido
        </button>
      );
    case "pendiente":
      return (
        <div className="flex gap-2 w-full">
          <button
            onClick={() => onEstado(pedidoId, "señado")}
            className="flex-1 py-2 px-2 rounded-xl font-black uppercase text-[10px] tracking-wider bg-yellow-100 text-yellow-700 shadow-sm"
            disabled={disabled}
          >
            Señar
          </button>
          <button
            onClick={() => onEstado(pedidoId, "pagado")}
            className="flex-1 py-2 px-2 rounded-xl font-black uppercase text-[10px] tracking-wider bg-blue-100 text-blue-700 shadow-sm"
            disabled={disabled}
          >
            Cobrar total
          </button>
        </div>
      );
    case "señado":
      return (
        <div className="flex gap-2 w-full">
          <button
            onClick={() => onEstado(pedidoId, "pagado")}
            className="flex-1 py-2 px-2 rounded-xl font-black uppercase text-[10px] tracking-wider bg-blue-100 text-blue-700 shadow-sm"
            disabled={disabled}
          >
            Cobrar resto
          </button>
          <button
            onClick={() => onEstado(pedidoId, "entregado")}
            className="flex-1 py-2 px-2 rounded-xl font-black uppercase text-[10px] tracking-wider bg-green-100 text-green-700 shadow-sm"
            disabled={disabled}
          >
            Entregar
          </button>
        </div>
      );
    case "pagado":
      return (
        <button
          onClick={() => onEstado(pedidoId, "entregado")}
          className="py-2 px-4 rounded-xl font-black uppercase text-[10px] tracking-wider bg-green-100 text-green-700 shadow-sm w-full"
          disabled={disabled}
        >
          Entregar
        </button>
      );
    case "entregado":
      return (
        <span className="block text-green-700 font-black text-[10px] uppercase text-center w-full">
          Entregado
        </span>
      );
    case "cancelado":
      return (
        <span className="block text-red-500 font-black text-[10px] uppercase text-center w-full">
          Cancelado
        </span>
      );
    default:
      return null;
  }
}
