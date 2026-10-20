import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EstadoPedido, Pedido, PedidoItem, TipoPago } from "../types/pedido";
import { normalizarEstadoPedido } from "../utils/pedidoEstado";
import {
  globalDescFromPedido,
  inferTipoPagoSena,
  normalizePedidoItemsForCart,
  snapshotFromPedido,
  type PedidoEditSnapshot
} from "../utils/pedidoCartHydrate";
import {
  aplicarDescRecGlobalACarrito,
  totalVentaPedido
} from "../utils/pedidoTotalVenta";
import type { FormaPagoCobro } from "../utils/pedidoFormaPago";
import { toCalendarDateYmd } from "../utils/dateAr";

export interface CartState {
  items: PedidoItem[];
  tipoPago: TipoPago;
  senaLibreMonto: number;
  editandoPedidoId: string | null;
  /** Al editar: conservar estado operativo al guardar (no forzar pendiente). */
  pedidoEditSnapshot: PedidoEditSnapshot | null;
  /** Estado objetivo al guardar la edición (cambiable: descancelar, cobrar, etc.). */
  estadoEdicion: EstadoPedido | null;
  clienteNombre: string;
  fechaEntrega: string;
  observaciones: string;
  /** Vendedor del pedido (profiles.id); default = usuario logueado si aplica */
  vendedorId: string | null;
  // Descuento/recargo global
  descRecGlobalTipo: "descuento" | "recargo";
  descRecGlobalModo: "porcentaje" | "monto";
  descRecGlobalValor: string;
  /** Cómo se registra la seña (50 % / libre). */
  formaPagoSena: FormaPagoCobro;
  /** Cómo se registra el pago total (anticipo 100 % o saldo final). */
  formaPagoTotal: FormaPagoCobro;

  addItem: (item: PedidoItem) => void;
  removeItem: (index: number) => void;
  replaceItemAt: (index: number, item: PedidoItem) => void;
  setItems: (items: PedidoItem[]) => void;
  setTipoPago: (tipo: TipoPago) => void;
  setSenaLibreMonto: (monto: number) => void;
  setEditandoPedidoId: (id: string | null) => void;
  hydrateFromPedido: (p: Pedido) => void;
  setEstadoEdicion: (e: EstadoPedido) => void;
  setClienteNombre: (nombre: string) => void;
  setFechaEntrega: (fecha: string) => void;
  setObservaciones: (obs: string) => void;
  setVendedorId: (id: string | null) => void;
  setDescRecGlobalTipo: (tipo: "descuento" | "recargo") => void;
  setDescRecGlobalModo: (modo: "porcentaje" | "monto") => void;
  setDescRecGlobalValor: (valor: string) => void;
  setFormaPagoSena: (f: FormaPagoCobro) => void;
  setFormaPagoTotal: (f: FormaPagoCobro) => void;
  reset: () => void;
  getTotal: () => number;
  getSena: () => number;
}

const initialState = {
  items: [] as PedidoItem[],
  tipoPago: "sin_pago" as TipoPago,
  senaLibreMonto: 0,
  editandoPedidoId: null as string | null,
  pedidoEditSnapshot: null as PedidoEditSnapshot | null,
  estadoEdicion: null as EstadoPedido | null,
  clienteNombre: "",
  fechaEntrega: "",
  observaciones: "",
  vendedorId: null as string | null,
  descRecGlobalTipo: "descuento" as "descuento" | "recargo",
  descRecGlobalModo: "porcentaje" as "porcentaje" | "monto",
  descRecGlobalValor: "",
  formaPagoSena: "transferencia" as FormaPagoCobro,
  formaPagoTotal: "transferencia" as FormaPagoCobro
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ...initialState,

      addItem: (item) => set((s) => ({ items: [...s.items, item] })),
      removeItem: (index) =>
        set((s) => {
          const items = s.items.filter((_, i) => i !== index);
          if (items.length === 0 && !s.editandoPedidoId) {
            return {
              items,
              clienteNombre: "",
              fechaEntrega: ""
            };
          }
          return { items };
        }),
      replaceItemAt: (index, item) =>
        set((s) => {
          if (index < 0 || index >= s.items.length) return s;
          const items = [...s.items];
          items[index] = item;
          return { items };
        }),
      setItems: (items) =>
        set((s) =>
          items.length === 0 && !s.editandoPedidoId
            ? {
                items,
                clienteNombre: "",
                fechaEntrega: ""
              }
            : { items }
        ),
      setTipoPago: (tipoPago) => set({ tipoPago }),
      setSenaLibreMonto: (senaLibreMonto) => set({ senaLibreMonto }),
      setEditandoPedidoId: (editandoPedidoId) => set({ editandoPedidoId }),
      hydrateFromPedido: (p) => {
        const totalP = totalVentaPedido(p);
        const { tipoPago, senaLibreMonto } = inferTipoPagoSena(totalP, p.sena);
        const g = globalDescFromPedido(p);
        const fpSena =
          p.forma_pago_sena === "efectivo" || p.forma_pago_sena === "transferencia"
            ? p.forma_pago_sena
            : "transferencia";
        const fpTot =
          p.forma_pago_total === "efectivo" || p.forma_pago_total === "transferencia"
            ? p.forma_pago_total
            : "transferencia";
        set({
          editandoPedidoId: p.id,
          pedidoEditSnapshot: snapshotFromPedido(p),
          estadoEdicion: normalizarEstadoPedido(p.estado),
          items: normalizePedidoItemsForCart(p.pedido_items ?? []),
          clienteNombre: p.cliente ?? "",
          fechaEntrega: toCalendarDateYmd(p.fecha_entrega),
          observaciones: p.observaciones ?? "",
          vendedorId: p.vendedor_id ?? null,
          tipoPago,
          senaLibreMonto,
          descRecGlobalTipo: g.descRecGlobalTipo,
          descRecGlobalModo: g.descRecGlobalModo,
          descRecGlobalValor: g.descRecGlobalValor,
          formaPagoSena: fpSena,
          formaPagoTotal: fpTot
        });
      },
      setEstadoEdicion: (estadoEdicion) => set({ estadoEdicion }),
      setClienteNombre: (clienteNombre) => set({ clienteNombre }),
      setFechaEntrega: (fechaEntrega) => set({ fechaEntrega }),
      setObservaciones: (observaciones) => set({ observaciones }),
      setVendedorId: (vendedorId) => set({ vendedorId }),

      setDescRecGlobalTipo: (descRecGlobalTipo) => set({ descRecGlobalTipo }),
      setDescRecGlobalModo: (descRecGlobalModo) => set({ descRecGlobalModo }),
      setDescRecGlobalValor: (descRecGlobalValor) =>
        set({ descRecGlobalValor }),
      setFormaPagoSena: (formaPagoSena) => set({ formaPagoSena }),
      setFormaPagoTotal: (formaPagoTotal) => set({ formaPagoTotal }),

      reset: () => set({ ...initialState }),

      getTotal: () => {
        const s = get();
        const sub = s.items.reduce(
          (acc, it) => acc + (it.precio_unitario || 0),
          0
        );
        return aplicarDescRecGlobalACarrito(
          sub,
          s.descRecGlobalTipo,
          s.descRecGlobalModo,
          s.descRecGlobalValor
        );
      },

      getSena: () => {
        const total = get().getTotal();
        switch (get().tipoPago) {
          case "sena_50":
            return Math.round(total * 0.5);
          case "sena_libre":
            return get().senaLibreMonto;
          case "pago_total":
            return total;
          default:
            return 0;
        }
      }
    }),
    {
      name: "printmanager-cart",
      partialize: (state) => ({
        items: state.items,
        tipoPago: state.tipoPago,
        senaLibreMonto: state.senaLibreMonto,
        editandoPedidoId: state.editandoPedidoId,
        pedidoEditSnapshot: state.pedidoEditSnapshot,
        estadoEdicion: state.estadoEdicion,
        clienteNombre:
          state.items.length > 0 || state.editandoPedidoId
            ? state.clienteNombre
            : "",
        fechaEntrega:
          state.items.length > 0 || state.editandoPedidoId
            ? state.fechaEntrega
            : "",
        observaciones: state.observaciones,
        vendedorId: state.editandoPedidoId ? state.vendedorId : null,
        descRecGlobalTipo: state.descRecGlobalTipo,
        descRecGlobalModo: state.descRecGlobalModo,
        descRecGlobalValor: state.descRecGlobalValor,
        formaPagoSena: state.formaPagoSena,
        formaPagoTotal: state.formaPagoTotal
      }),
      merge: (persisted, current) => {
        const merged = {
          ...current,
          ...(persisted as Partial<CartState>)
        };
        if (!merged.items?.length && !merged.editandoPedidoId) {
          merged.clienteNombre = "";
          merged.fechaEntrega = "";
        }
        if (!merged.editandoPedidoId) merged.vendedorId = null;
        if (
          merged.formaPagoSena !== "efectivo" &&
          merged.formaPagoSena !== "transferencia"
        ) {
          merged.formaPagoSena = "transferencia";
        }
        if (
          merged.formaPagoTotal !== "efectivo" &&
          merged.formaPagoTotal !== "transferencia"
        ) {
          merged.formaPagoTotal = "transferencia";
        }
        return merged;
      }
    }
  )
);
