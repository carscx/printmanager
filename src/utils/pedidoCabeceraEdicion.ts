import type { EstadoPedido, TipoPago } from "../types/pedido";
import type { PedidoEditSnapshot } from "./pedidoCartHydrate";

/**
 * Cabecera al guardar una edición: el estado lo elige el usuario (incl. descancelar).
 */
export function cabeceraDesdeEstadoEdicion(
  est: EstadoPedido,
  base: Record<string, unknown>,
  opts: {
    senaFromCart: number;
    tipoPago: TipoPago;
    totalPedido: number;
    snap: PedidoEditSnapshot;
  }
): Record<string, unknown> {
  const { senaFromCart, tipoPago, totalPedido, snap } = opts;

  /** Seña distinta del total: siempre transferencia; pago total al crear → sin seña como depósito */
  const formaSena =
    tipoPago === "sena_50" || tipoPago === "sena_libre"
      ? ({ forma_pago_sena: "transferencia" } as const)
      : ({ forma_pago_sena: null } as const);

  if (est === "presupuesto") {
    // Agregar seña en edición = confirmar pedido (presupuesto → pendiente), no presupuesto con seña forzada a 0.
    if (senaFromCart > 0) {
      return {
        ...base,
        modalidad: "pedido",
        estado: "pendiente",
        sena: senaFromCart,
        ...formaSena,
        tipo_pago: tipoPago,
        entregado: false,
        fecha_pago: null,
        fecha_vencimiento: null,
        stock_descontado: snap.stock_descontado
      };
    }
    return {
      ...base,
      modalidad: "presupuesto",
      estado: "presupuesto",
      sena: 0,
      forma_pago_sena: null,
      tipo_pago: null,
      stock_descontado: false,
      entregado: false,
      fecha_pago: null
    };
  }

  if (est === "cancelado") {
    return {
      ...base,
      modalidad: "pedido",
      estado: "cancelado",
      sena: senaFromCart,
      ...formaSena,
      tipo_pago: tipoPago,
      entregado: false,
      fecha_pago: null,
      stock_descontado: false
    };
  }

  if (est === "entregado") {
    return {
      ...base,
      modalidad: "pedido",
      estado: "entregado",
      sena: totalPedido,
      ...formaSena,
      tipo_pago: "pago_total",
      entregado: true,
      fecha_pago: snap.fecha_pago ?? new Date().toISOString(),
      stock_descontado: snap.stock_descontado
    };
  }

  if (est === "pagado") {
    return {
      ...base,
      modalidad: "pedido",
      estado: "pagado",
      sena: totalPedido,
      ...formaSena,
      tipo_pago: "pago_total",
      entregado: false,
      fecha_pago: null,
      stock_descontado: snap.stock_descontado
    };
  }

  return {
    ...base,
    modalidad: "pedido",
    estado: est,
    sena: senaFromCart,
    ...formaSena,
    tipo_pago: tipoPago,
    entregado: false,
    fecha_pago: null,
    stock_descontado: snap.stock_descontado
  };
}
