import type { Pedido } from "../types/pedido";
import { totalVentaPedido } from "./pedidoTotalVenta";

export function pedidosToCSV(pedidos: Pedido[]) {
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
      String(totalVentaPedido(p)),
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
