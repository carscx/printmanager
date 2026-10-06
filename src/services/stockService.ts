import { apiPost } from "../config/apiClient";

export async function restaurarStockPedido(pedidoId: string) {
  return apiPost<{ ok: boolean; error?: string }>(
    `/stock/${pedidoId}/restaurar`
  );
}

export async function descontarStockPedido(pedidoId: string) {
  return apiPost<{ ok: boolean; error?: string }>(
    `/stock/${pedidoId}/descontar`
  );
}
