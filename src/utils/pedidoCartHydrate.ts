import type { Pedido, PedidoItem, TipoPago } from "../types/pedido";

/** Snapshot para no pisar estado / entrega al guardar una edición. */
export type PedidoEditSnapshot = {
  estado: string;
  modalidad: string | null;
  entregado: boolean;
  fecha_pago: string | null;
  stock_descontado: boolean;
};

export function normalizePedidoItemsForCart(items: PedidoItem[]): PedidoItem[] {
  return (items ?? []).map((raw) => ({
    ...raw,
    nombre_archivo: raw.nombre_archivo ?? "",
    paginas: Number(raw.paginas ?? 0),
    copias: Number(raw.copias ?? 1),
    tipo_impresion: raw.tipo_impresion ?? "",
    anillado: raw.anillado ?? null,
    precio_unitario: Number(raw.precio_unitario ?? 0),
    observaciones: raw.observaciones ?? "",
    solo_anillado: raw.solo_anillado ?? false
  }));
}

export function inferTipoPagoSena(
  total: number,
  sena: number
): { tipoPago: TipoPago; senaLibreMonto: number } {
  const senaP = Number(sena ?? 0);
  const totalP = Number(total ?? 0);
  if (senaP <= 0) return { tipoPago: "sin_pago", senaLibreMonto: 0 };
  if (totalP > 0 && senaP >= totalP) return { tipoPago: "pago_total", senaLibreMonto: 0 };
  if (totalP > 0 && senaP === Math.round(totalP * 0.5))
    return { tipoPago: "sena_50", senaLibreMonto: 0 };
  return { tipoPago: "sena_libre", senaLibreMonto: senaP };
}

export function globalDescFromPedido(p: Pedido): {
  descRecGlobalTipo: "descuento" | "recargo";
  descRecGlobalModo: "porcentaje" | "monto";
  descRecGlobalValor: string;
} {
  const dPct = p.descuento_global_porcentaje;
  const dMonto = p.descuento_global_monto;
  const rPct = p.recargo_global_porcentaje;
  const rMonto = p.recargo_global_monto;
  if (dPct != null && Number(dPct) > 0)
    return {
      descRecGlobalTipo: "descuento",
      descRecGlobalModo: "porcentaje",
      descRecGlobalValor: String(dPct)
    };
  if (dMonto != null && Number(dMonto) > 0)
    return {
      descRecGlobalTipo: "descuento",
      descRecGlobalModo: "monto",
      descRecGlobalValor: String(dMonto)
    };
  if (rPct != null && Number(rPct) > 0)
    return {
      descRecGlobalTipo: "recargo",
      descRecGlobalModo: "porcentaje",
      descRecGlobalValor: String(rPct)
    };
  if (rMonto != null && Number(rMonto) > 0)
    return {
      descRecGlobalTipo: "recargo",
      descRecGlobalModo: "monto",
      descRecGlobalValor: String(rMonto)
    };
  return {
    descRecGlobalTipo: "descuento",
    descRecGlobalModo: "porcentaje",
    descRecGlobalValor: ""
  };
}

export function snapshotFromPedido(p: Pedido): PedidoEditSnapshot {
  const ext = p as Pedido & { stock_descontado?: boolean };
  return {
    estado: p.estado ?? "pendiente",
    modalidad: p.modalidad ?? null,
    entregado: Boolean(p.entregado),
    fecha_pago: p.fecha_pago ?? null,
    stock_descontado: Boolean(ext.stock_descontado)
  };
}
