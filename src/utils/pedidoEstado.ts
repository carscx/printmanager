import type { EstadoPedido } from "../types/pedido";

/** Normaliza valores legacy de BD hacia el ciclo de vida unificado. */
export function normalizarEstadoPedido(raw: string | null | undefined): EstadoPedido {
  const e = (raw || "").trim();
  if (e === "presupuestado") return "presupuesto";
  if (e === "señado") return "pendiente";
  if (
    e === "presupuesto" ||
    e === "pendiente" ||
    e === "listo" ||
    e === "pagado" ||
    e === "entregado" ||
    e === "cancelado"
  ) {
    return e;
  }
  return "presupuesto";
}
