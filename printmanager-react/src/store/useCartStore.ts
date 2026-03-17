import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PedidoItem, TipoPago } from "../types/pedido";

interface CartState {
  items: PedidoItem[];
  tipoPago: TipoPago;
  senaLibreMonto: number;
  editandoPedidoId: string | null;
  clienteNombre: string;
  fechaEntrega: string;
  observaciones: string;
  // Descuento/recargo global
  descRecGlobalTipo: "descuento" | "recargo";
  descRecGlobalModo: "porcentaje" | "monto";
  descRecGlobalValor: string;

  addItem: (item: PedidoItem) => void;
  removeItem: (index: number) => void;
  setItems: (items: PedidoItem[]) => void;
  setTipoPago: (tipo: TipoPago) => void;
  setSenaLibreMonto: (monto: number) => void;
  setEditandoPedidoId: (id: string | null) => void;
  setClienteNombre: (nombre: string) => void;
  setFechaEntrega: (fecha: string) => void;
  setObservaciones: (obs: string) => void;
  setDescRecGlobalTipo: (tipo: "descuento" | "recargo") => void;
  setDescRecGlobalModo: (modo: "porcentaje" | "monto") => void;
  setDescRecGlobalValor: (valor: string) => void;
  reset: () => void;
  getTotal: () => number;
  getSena: () => number;
}

const initialState = {
  items: [] as PedidoItem[],
  tipoPago: "sin_pago" as TipoPago,
  senaLibreMonto: 0,
  editandoPedidoId: null as string | null,
  clienteNombre: "",
  fechaEntrega: "",
  observaciones: "",
  descRecGlobalTipo: "descuento" as "descuento" | "recargo",
  descRecGlobalModo: "porcentaje" as "porcentaje" | "monto",
  descRecGlobalValor: ""
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ...initialState,

      addItem: (item) => set((s) => ({ items: [...s.items, item] })),
      removeItem: (index) =>
        set((s) => ({ items: s.items.filter((_, i) => i !== index) })),
      setItems: (items) => set({ items }),
      setTipoPago: (tipoPago) => set({ tipoPago }),
      setSenaLibreMonto: (senaLibreMonto) => set({ senaLibreMonto }),
      setEditandoPedidoId: (editandoPedidoId) => set({ editandoPedidoId }),
      setClienteNombre: (clienteNombre) => set({ clienteNombre }),
      setFechaEntrega: (fechaEntrega) => set({ fechaEntrega }),
      setObservaciones: (observaciones) => set({ observaciones }),

      setDescRecGlobalTipo: (descRecGlobalTipo) => set({ descRecGlobalTipo }),
      setDescRecGlobalModo: (descRecGlobalModo) => set({ descRecGlobalModo }),
      setDescRecGlobalValor: (descRecGlobalValor) =>
        set({ descRecGlobalValor }),

      reset: () => set(initialState),

      getTotal: () =>
        get().items.reduce((acc, it) => acc + (it.precio_unitario || 0), 0),

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
    { name: "printmanager-cart" }
  )
);
