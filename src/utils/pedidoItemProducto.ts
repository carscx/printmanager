import type { Pedido, PedidoItem } from "../types/pedido";

export function esItemProductoCerrado(it: PedidoItem): boolean {
  return Boolean(it.producto_id);
}

export function pedidoEsProductoCerrado(p: Pedido): boolean {
  return (p.pedido_items ?? []).some(esItemProductoCerrado);
}

/** Nombre del producto cerrado (sin “0 PAG”). */
export function nombreProductoCerrado(it: PedidoItem): string {
  return (it.tipo_impresion || it.nombre_archivo || "Producto").trim() || "Producto";
}

/** Línea de listado: `Agenda Semanal` o `Agenda Semanal × 2`. */
export function labelItemProductoCerrado(it: PedidoItem): string {
  const nombre = nombreProductoCerrado(it);
  const copias = it.copias ?? 1;
  return copias > 1 ? `${nombre} × ${copias}` : nombre;
}

/** Detalle WhatsApp / PDF: `- Agenda Semanal` o `- Agenda Semanal x2`. */
export function detalleItemProductoCerrado(it: PedidoItem): string {
  const nombre = nombreProductoCerrado(it);
  const copias = it.copias ?? 1;
  const copiasTxt = copias > 1 ? ` x${copias}` : "";
  return `- ${nombre}${copiasTxt}`;
}
