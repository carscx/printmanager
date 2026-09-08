import type { Pedido, PedidoItem } from "../types/pedido";

export type CamposDescRecItem = Pick<
  PedidoItem,
  | "descuento_porcentaje"
  | "descuento_monto"
  | "recargo_porcentaje"
  | "recargo_monto"
>;

const DESC_REC_VACIO: CamposDescRecItem = {
  descuento_porcentaje: null,
  descuento_monto: null,
  recargo_porcentaje: null,
  recargo_monto: null
};

export function camposDescRecItem(
  show: boolean,
  tipo: "descuento" | "recargo",
  modo: "porcentaje" | "monto",
  valor: string
): CamposDescRecItem {
  const n = Number(valor);
  if (!show || !valor.trim() || !Number.isFinite(n) || n <= 0) {
    return { ...DESC_REC_VACIO };
  }
  if (tipo === "descuento") {
    return modo === "porcentaje"
      ? { ...DESC_REC_VACIO, descuento_porcentaje: n }
      : { ...DESC_REC_VACIO, descuento_monto: n };
  }
  return modo === "porcentaje"
    ? { ...DESC_REC_VACIO, recargo_porcentaje: n }
    : { ...DESC_REC_VACIO, recargo_monto: n };
}

/** Precio de línea: desc/rec sobre el precio unitario, luego × cantidad (igual que impresión). */
export function precioLineaProductoCerrado(
  precioVenta: number,
  copias: number,
  descRec: CamposDescRecItem
): number {
  let unit = Number(precioVenta) || 0;
  if (descRec.descuento_porcentaje) {
    unit -= unit * (descRec.descuento_porcentaje / 100);
  }
  if (descRec.descuento_monto) {
    unit -= descRec.descuento_monto;
  }
  if (descRec.recargo_porcentaje) {
    unit += unit * (descRec.recargo_porcentaje / 100);
  }
  if (descRec.recargo_monto) {
    unit += descRec.recargo_monto;
  }
  return Math.max(0, Math.round(unit * Math.max(1, copias)));
}

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
