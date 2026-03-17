import type { Pedido, VistaTab } from "../../types/pedido";
import { PedidoCard } from "./PedidoCard";

interface PedidoListProps {
  pedidos: Pedido[];
  vistaActual: VistaTab;
  onBorrar: (id: string) => void;
  onEditar: (p: Pedido) => void;
  onEstado: (id: string, estado: string) => void;
  onEntregar: (p: Pedido) => void;
  onCobrar: (p: Pedido) => void;
  onWA: (p: Pedido) => void;
}

export function PedidoList({
  pedidos,
  vistaActual,
  onBorrar,
  onEditar,
  onEstado,
  onEntregar,
  onCobrar,
  onWA
}: PedidoListProps) {
  if (pedidos.length === 0) {
    return (
      <div className="text-center py-16 text-slate-300 italic text-sm">
        {vistaActual === "taller"
          ? "No hay pedidos en el taller"
          : "No hay pedidos en el historial"}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-10">
      {pedidos.map((p) => (
        <PedidoCard
          key={p.id}
          pedido={p}
          vistaActual={vistaActual}
          onBorrar={onBorrar}
          onEditar={onEditar}
          onEstado={onEstado}
          onEntregar={onEntregar}
          onCobrar={onCobrar}
          onWA={onWA}
        />
      ))}
    </div>
  );
}
