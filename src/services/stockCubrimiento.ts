import { apiGet, apiPost } from "../config/apiClient";
import type { Insumo } from "../types/insumo";

export interface LineaCubrimiento {
  insumo_id: string;
  nombre: string;
  necesario: number;
  stock: number;
  ok: boolean;
}

/**
 * Tras rpc_explotar_bom_pedido: agrega cantidades por insumo y compara con stock_actual.
 */
export async function fetchCubrimientoStockPedido(
  pedidoId: string
): Promise<{ ok: boolean; lineas: LineaCubrimiento[] }> {
  const pedido = await apiGet<{
    pedido_items?: { id: string }[];
  }>(`/pedidos/${pedidoId}`);
  const itemIds = (pedido?.pedido_items ?? []).map((r) => r.id).filter(Boolean);
  if (itemIds.length === 0) return { ok: true, lineas: [] };

  const pii = await apiPost<
    {
      insumo_id: string;
      cantidad: number;
    }[]
  >("/pedidos/consumo-insumos", { itemIds });

  const insumos = await apiGet<Insumo[]>("/insumos?soloActivos=false");
  const byInsumoMeta = new Map(insumos.map((i) => [i.id, i]));

  const byInsumo = new Map<
    string,
    { nombre: string; necesario: number; stock: number }
  >();

  for (const r of pii ?? []) {
    const id = r.insumo_id;
    const qty = Number(r.cantidad) || 0;
    const meta = byInsumoMeta.get(id);
    const nombre = meta?.nombre ?? id.slice(0, 8);
    const stock = Number(meta?.stock_actual) ?? 0;
    const cur = byInsumo.get(id);
    if (cur) cur.necesario += qty;
    else byInsumo.set(id, { nombre, necesario: qty, stock });
  }

  const lineas: LineaCubrimiento[] = [];
  let ok = true;
  for (const [insumo_id, v] of byInsumo) {
    const lineOk = v.stock >= v.necesario;
    if (!lineOk) ok = false;
    lineas.push({
      insumo_id,
      nombre: v.nombre,
      necesario: v.necesario,
      stock: v.stock,
      ok: lineOk
    });
  }
  lineas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { ok, lineas };
}
