import type { Pedido, EstadoPedido } from "../../types/pedido";
import { PedidoCard } from "./PedidoCard";

interface PedidoListProps {
  pedidos: Pedido[];
  onBorrar: (id: string) => void;
  onEditar: (p: Pedido) => void;
  onTransition: (p: Pedido, nuevo: EstadoPedido) => void;
  onWA: (p: Pedido) => void;
}

export function PedidoList({
  pedidos,
  onBorrar,
  onEditar,
  onTransition,
  onWA
}: PedidoListProps) {
  if (pedidos.length === 0) {
    return (
      <div className="text-center py-16 text-slate-300 italic text-sm">
        No hay pedidos con los filtros actuales.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-10 min-w-0">
      {pedidos.map((p) => (
        <PedidoCard
          key={p.id}
          pedido={p}
          onBorrar={onBorrar}
          onEditar={onEditar}
          onTransition={onTransition}
          onWA={onWA}
        />
      ))}
    </div>
  );
}
