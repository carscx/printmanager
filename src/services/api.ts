import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../config/apiClient";
import type { Pedido, PedidoItem } from "../types/pedido";
import type { PedidoItemInsumo } from "../types/precio";
import type { AppConfig } from "../types/config";

/** Filtros compartidos entre `fetchHistorial` y `fetchHistorialTodos`. */
export type HistorialFiltros = {
  fromDate?: string | null;
  toDate?: string | null;
  estado?: string | null;
  busquedaClientePedido?: string | null;
  searchQuery?: string | null;
  tipoTrabajo?: "bn" | "color" | "stickers" | "anillado" | null;
  cobranza?: "todos" | "impago" | "pagado" | null;
  impresos?: "todos" | "si" | "no" | null;
};

function mapItemToDB(it: PedidoItem, _pedidoId: string) {
  return {
    nombre_archivo: it.nombre_archivo,
    paginas: it.paginas || 0,
    copias: it.copias || 1,
    tipo_impresion: it.tipo_impresion || null,
    anillado: it.anillado || null,
    precio_unitario: it.precio_unitario || 0,
    observaciones: it.observaciones || "",
    descuento_porcentaje: it.descuento_porcentaje ?? null,
    descuento_monto: it.descuento_monto ?? null,
    recargo_porcentaje: it.recargo_porcentaje ?? null,
    recargo_monto: it.recargo_monto ?? null,
    solo_anillado: it.solo_anillado ?? false,
    precio_impresion_id: it.precio_impresion_id ?? null,
    precio_anillado_id: it.precio_anillado_id ?? null,
    anillado_medida_mm: it.anillado_medida_mm ?? null,
    doble_faz: it.doble_faz ?? false,
    impreso: it.impreso ?? false,
    ...(it.producto_id ? { producto_id: it.producto_id } : {})
  };
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  async fetchConfig(): Promise<AppConfig> {
    return apiGet<AppConfig>("/config");
  },

  async updateConfig(key: string, value: string) {
    await apiPut("/config", { key, value });
  },

  async fetchPedidos(entregado = false): Promise<Pedido[]> {
    return apiGet<Pedido[]>(`/pedidos${qs({ entregado: String(entregado) })}`);
  },

  async fetchPedidoById(id: string): Promise<Pedido | null> {
    return apiGet<Pedido | null>(`/pedidos/${id}`);
  },

  async fetchHistorial(
    params: HistorialFiltros & { page: number; pageSize: number }
  ): Promise<{ pedidos: Pedido[]; total: number }> {
    return apiGet(`/pedidos/historial${qs({
      page: params.page,
      pageSize: params.pageSize,
      fromDate: params.fromDate,
      toDate: params.toDate,
      estado: params.estado,
      busquedaClientePedido: params.busquedaClientePedido,
      searchQuery: params.searchQuery,
      tipoTrabajo: params.tipoTrabajo,
      cobranza: params.cobranza,
      impresos: params.impresos
    })}`);
  },

  async fetchHistorialTodos(
    filtros: HistorialFiltros,
    options?: { maxRows?: number; batchSize?: number }
  ): Promise<Pedido[]> {
    const batchSize = Math.min(options?.batchSize ?? 500, 1000);
    const maxRows = options?.maxRows ?? 50_000;
    const all: Pedido[] = [];
    let page = 0;
    let totalEsperado = 0;

    while (all.length < maxRows) {
      const { pedidos, total } = await api.fetchHistorial({
        ...filtros,
        page,
        pageSize: batchSize
      });
      if (page === 0) totalEsperado = total;
      all.push(...pedidos);
      if (pedidos.length === 0 || all.length >= totalEsperado) break;
      if (pedidos.length < batchSize) break;
      page += 1;
    }

    if (all.length >= maxRows && totalEsperado > maxRows) {
      console.warn(
        `[fetchHistorialTodos] Resultado truncado a ${maxRows} filas (total coincidente: ${totalEsperado})`
      );
    }

    return all.slice(0, maxRows);
  },

  async fetchConsumoInsumosPorItemIds(
    itemIds: string[]
  ): Promise<PedidoItemInsumo[]> {
    return apiPost<PedidoItemInsumo[]>("/pedidos/consumo-insumos", { itemIds });
  },

  async fetchPedidosPorPeriodo(
    fromISO: string,
    toISO: string,
    options?: { incluirCancelados?: boolean; limite?: number }
  ): Promise<Pedido[]> {
    return apiGet(
      `/pedidos/periodo${qs({
        from: fromISO,
        to: toISO,
        incluirCancelados: options?.incluirCancelados ? "true" : undefined,
        limite: options?.limite
      })}`
    );
  },

  async fetchResumenHoy(): Promise<Pedido[]> {
    return apiGet("/pedidos/resumen-hoy");
  },

  async cambiarEstadoPedido(id: string, nuevoEstado: string) {
    return apiPost(`/pedidos/${id}/estado`, { estado: nuevoEstado });
  },

  async updatePedidoPatch(id: string, patch: Record<string, unknown>) {
    await apiPatch(`/pedidos/${id}`, patch);
  },

  async updatePedidoItemPatch(id: string, patch: Record<string, unknown>) {
    await apiPatch(`/pedido-items/${id}`, patch);
  },

  async entregarPedido(id: string, total: number) {
    await apiPost(`/pedidos/${id}/entregar`, { total });
  },

  async cobrarPedido(id: string, total: number) {
    await apiPost(`/pedidos/${id}/cobrar`, { total });
  },

  async borrarPedido(id: string) {
    await apiDelete(`/pedidos/${id}`);
  },

  async rpcConvertirPresupuestoAPedido(pedidoId: string): Promise<void> {
    await apiPost(`/pedidos/${pedidoId}/convertir-presupuesto`);
  },

  async crearPedidoCompleto(
    cabecera: Record<string, unknown>,
    items: PedidoItem[]
  ) {
    const itemsRel = items.map((it) => mapItemToDB(it, ""));
    return apiPost("/pedidos", { cabecera, items: itemsRel });
  },

  async actualizarPedidoCompleto(
    pedidoId: string,
    cabecera: Record<string, unknown>,
    items: PedidoItem[]
  ) {
    const itemsRel = items.map((it) => mapItemToDB(it, pedidoId));
    await apiPut(`/pedidos/${pedidoId}`, { cabecera, items: itemsRel });
  }
};

