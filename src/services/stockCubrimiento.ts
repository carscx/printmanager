import { sb } from "../config/supabase";

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
  const { data: items, error: e1 } = await sb
    .from("pedido_items")
    .select("id")
    .eq("pedido_id", pedidoId);
  if (e1) throw e1;
  const itemIds = (items ?? []).map((r) => (r as { id: string }).id);
  if (itemIds.length === 0) return { ok: true, lineas: [] };

  const { data: pii, error: e2 } = await sb
    .from("pedido_items_insumos")
    .select("insumo_id, cantidad, insumos(nombre, stock_actual)")
    .in("pedido_item_id", itemIds);
  if (e2) throw e2;

  const byInsumo = new Map<
    string,
    { nombre: string; necesario: number; stock: number }
  >();

  for (const row of pii ?? []) {
    const r = row as unknown as {
      insumo_id: string;
      cantidad: number;
      insumos: { nombre: string; stock_actual: number } | null;
    };
    const id = r.insumo_id;
    const qty = Number(r.cantidad) || 0;
    const nombre = r.insumos?.nombre ?? id.slice(0, 8);
    const stock = Number(r.insumos?.stock_actual) ?? 0;
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
