/**
 * Restaura stock de insumos para un pedido cancelado.
 * Marca el pedido como stock_descontado=false si la operación es exitosa.
 * @param pedidoId UUID del pedido
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function restaurarStockPedido(pedidoId: string) {
  // Llama a una función RPC en Supabase (debe existir en el backend)
  const { error } = await sb.rpc("restaurar_stock_pedido", {
    pedido_id: pedidoId
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
// Servicio para automatizar el descuento de stock de insumos al pasar un pedido a "en produccion"
import { sb } from "../config/supabase";

/**
 * Descuenta stock de insumos para un pedido dado.
 * Marca el pedido como stock_descontado=true si la operación es exitosa.
 * @param pedidoId UUID del pedido
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function descontarStockPedido(pedidoId: string) {
  // Llama a una función RPC en Supabase (debe existir en el backend)
  const { error } = await sb.rpc("descontar_stock_pedido", {
    pedido_id: pedidoId
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
