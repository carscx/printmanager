import type { Pedido, PedidoItem } from "../types/pedido";

export interface MontosItemDescRec {
  descuento: number;
  recargo: number;
}

/**
 * A partir del total de línea guardado (precio_unitario = total línea post D/R ítem)
 * y los campos de desc/rec, estima montos de descuento y recargo en $ (línea completa).
 */
export function montosDescRecPorItem(item: PedidoItem): MontosItemDescRec {
  const c = Math.max(1, item.copias || 1);
  const lineTotal = Number(item.precio_unitario) || 0;
  const f = lineTotal / c;

  const hasItemDR =
    item.descuento_porcentaje ||
    item.descuento_monto ||
    item.recargo_porcentaje ||
    item.recargo_monto;

  if (!hasItemDR) {
    return { descuento: 0, recargo: 0 };
  }

  let b = f;
  if (item.recargo_monto) b -= item.recargo_monto;
  if (item.recargo_porcentaje && item.recargo_porcentaje > 0) {
    b /= 1 + item.recargo_porcentaje / 100;
  }
  if (item.descuento_monto) b += item.descuento_monto;
  if (item.descuento_porcentaje && item.descuento_porcentaje > 0) {
    b /= 1 - item.descuento_porcentaje / 100;
  }

  let afterDesc = b;
  if (item.descuento_porcentaje && item.descuento_porcentaje > 0) {
    afterDesc *= 1 - item.descuento_porcentaje / 100;
  }
  if (item.descuento_monto) afterDesc -= item.descuento_monto;
  const descuento = Math.max(
    0,
    Math.round(b * c) - Math.round(afterDesc * c)
  );

  let afterRec = afterDesc;
  if (item.recargo_porcentaje && item.recargo_porcentaje > 0) {
    afterRec *= 1 + item.recargo_porcentaje / 100;
  }
  if (item.recargo_monto) afterRec += item.recargo_monto;
  const recargo = Math.max(
    0,
    Math.round(afterRec * c) - Math.round(afterDesc * c)
  );

  return { descuento, recargo };
}

export interface AgregadoDescuentosRecargos {
  /** Descuentos por ítem (suma $) */
  descuentoItems: number;
  /** Recargos por ítem */
  recargoItems: number;
  /** Descuento global (% sobre subtotal o monto fijo) */
  descuentoGlobal: number;
  /** Recargo global */
  recargoGlobal: number;
  /** Pedidos con al menos un descuento o recargo (ítem o global) */
  pedidosConAjuste: number;
  /** Total de pedidos analizados */
  pedidosTotal: number;
}

function sumaLineas(p: Pedido): number {
  return (p.pedido_items || []).reduce(
    (acc, it) => acc + (Number(it.precio_unitario) || 0),
    0
  );
}

/**
 * Agrega descuentos y recargos de un conjunto de pedidos en el período.
 */
export function agregarDescuentosRecargos(pedidos: Pedido[]): AgregadoDescuentosRecargos {
  let descuentoItems = 0;
  let recargoItems = 0;
  let descuentoGlobal = 0;
  let recargoGlobal = 0;
  let pedidosConAjuste = 0;

  for (const p of pedidos) {
    let hubo = false;
    for (const it of p.pedido_items || []) {
      const { descuento, recargo } = montosDescRecPorItem(it);
      descuentoItems += descuento;
      recargoItems += recargo;
      if (descuento > 0 || recargo > 0) hubo = true;
    }

    const sub = sumaLineas(p);
    const dgPct = p.descuento_global_porcentaje;
    const dgMonto = p.descuento_global_monto;
    const rgPct = p.recargo_global_porcentaje;
    const rgMonto = p.recargo_global_monto;

    if (dgPct != null && dgPct > 0) {
      descuentoGlobal += Math.round(sub * (Number(dgPct) / 100));
      hubo = true;
    }
    if (dgMonto != null && Number(dgMonto) > 0) {
      descuentoGlobal += Math.round(Number(dgMonto));
      hubo = true;
    }
    if (rgPct != null && rgPct > 0) {
      recargoGlobal += Math.round(sub * (Number(rgPct) / 100));
      hubo = true;
    }
    if (rgMonto != null && Number(rgMonto) > 0) {
      recargoGlobal += Math.round(Number(rgMonto));
      hubo = true;
    }

    if (hubo) pedidosConAjuste += 1;
  }

  return {
    descuentoItems,
    recargoItems,
    descuentoGlobal,
    recargoGlobal,
    pedidosConAjuste,
    pedidosTotal: pedidos.length
  };
}
