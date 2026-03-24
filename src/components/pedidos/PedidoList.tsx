import type { Pedido, EstadoPedido } from "../../types/pedido";
import { PedidoCard } from "./PedidoCard";

interface PedidoListProps {
  pedidos: Pedido[];
  isAdmin: boolean;
  onBorrar: (id: string) => void;
  onEditar: (p: Pedido) => void;
  onTransition: (p: Pedido, nuevo: EstadoPedido) => void;
  onCobrarTotal: (p: Pedido) => void;
  onWA: (p: Pedido) => void;
  onDescargarControlPdf: (p: Pedido) => void;
}

export function PedidoList({
  pedidos,
  isAdmin,
  onBorrar,
  onEditar,
  onTransition,
  onCobrarTotal,
  onWA,
  onDescargarControlPdf
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
          isAdmin={isAdmin}
          onBorrar={onBorrar}
          onEditar={onEditar}
          onTransition={onTransition}
          onCobrarTotal={onCobrarTotal}
          onWA={onWA}
          onDescargarControlPdf={onDescargarControlPdf}
        />
      ))}
    </div>
  );
}
