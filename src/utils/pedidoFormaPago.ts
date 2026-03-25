import type { TipoPago } from "../types/pedido";

export type FormaPagoCobro = "efectivo" | "transferencia";

export type FormaPagoCartFields = {
  tipoPago: TipoPago;
  formaPagoSena: FormaPagoCobro;
  formaPagoTotal: FormaPagoCobro;
};

/** Campos `forma_pago_*` al crear/actualizar pedido desde el carrito. */
export function deriveFormaPagoFields(
  cart: FormaPagoCartFields,
  sena: number
): Record<string, unknown> {
  if (cart.tipoPago === "pago_total" && sena > 0) {
    return { forma_pago_total: cart.formaPagoTotal, forma_pago_sena: null };
  }
  if (
    (cart.tipoPago === "sena_50" || cart.tipoPago === "sena_libre") &&
    sena > 0
  ) {
    return { forma_pago_sena: cart.formaPagoSena, forma_pago_total: null };
  }
  return {};
}

/** Ajusta forma según estado final de cabecera (edición con cambio de estado). */
export function aplicarFormaPagoCabecera(
  cabecera: Record<string, unknown>,
  cart: FormaPagoCartFields,
  sena: number
): Record<string, unknown> {
  const est = String(cabecera.estado ?? "");
  if (est === "presupuesto" && Number(cabecera.sena ?? 0) === 0) {
    return { ...cabecera, forma_pago_sena: null, forma_pago_total: null };
  }
  if (est === "entregado" || est === "pagado") {
    return {
      ...cabecera,
      forma_pago_total: cart.formaPagoTotal,
      forma_pago_sena: null
    };
  }
  const fp = deriveFormaPagoFields(cart, sena);
  return { ...cabecera, ...fp };
}
