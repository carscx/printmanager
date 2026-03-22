import type { Pedido } from "../types/pedido";

/** Suma de `precio_unitario` por línea (total por ítem ya cargado). */
export function sumaSubtotalLineasPedido(p: Pedido): number {
  return (p.pedido_items || []).reduce(
    (acc, it) => acc + (Number(it.precio_unitario) || 0),
    0
  );
}

/**
 * Misma lógica que el resumen del carrito (un solo ajuste global a la vez).
 */
export function aplicarDescRecGlobalACarrito(
  subtotal: number,
  descRecGlobalTipo: "descuento" | "recargo",
  descRecGlobalModo: "porcentaje" | "monto",
  descRecGlobalValor: string
): number {
  if (!descRecGlobalValor?.trim()) return subtotal;
  const val = Number(descRecGlobalValor);
  if (!Number.isFinite(val)) return subtotal;
  let t = subtotal;
  if (descRecGlobalTipo === "descuento") {
    if (descRecGlobalModo === "porcentaje") {
      t -= Math.round(t * (val / 100));
    } else {
      t -= val;
    }
  } else {
    if (descRecGlobalModo === "porcentaje") {
      t += Math.round(t * (val / 100));
    } else {
      t += val;
    }
  }
  return t;
}

/**
 * Total al cliente desde cabecera + líneas: subtotal ítems y luego desc/rec globales
 * en el mismo orden que al guardar (ver `handleFinalize` en NuevoPedido).
 */
export function totalVentaPedido(p: Pedido): number {
  const sub = sumaSubtotalLineasPedido(p);
  if (sub <= 0) {
    return Number(p.total ?? p.total_pedido ?? 0) || 0;
  }

  let t = sub;
  const dgPct = p.descuento_global_porcentaje;
  const dgMonto = p.descuento_global_monto;
  const rgPct = p.recargo_global_porcentaje;
  const rgMonto = p.recargo_global_monto;

  if (dgPct != null && Number(dgPct) > 0) {
    t -= Math.round(t * (Number(dgPct) / 100));
  }
  if (dgMonto != null && Number(dgMonto) > 0) {
    t -= Math.round(Number(dgMonto));
  }
  if (rgPct != null && Number(rgPct) > 0) {
    t += Math.round(t * (Number(rgPct) / 100));
  }
  if (rgMonto != null && Number(rgMonto) > 0) {
    t += Math.round(Number(rgMonto));
  }

  return t;
}
