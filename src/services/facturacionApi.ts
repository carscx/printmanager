import { sb } from "../config/supabase";
import type { Pedido } from "../types/pedido";

export function dayStartISO(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0).toISOString();
}

export function dayEndISO(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, 23, 59, 59, 999).toISOString();
}

/**
 * Pedidos listos para facturación ARCA:
 * - estado entregado (en este modelo equivale a ciclo de cobro y entrega cerrado)
 * - aún no exportados como facturados
 * - cobro total registrado como transferencia (efectivo no entra en este reporte)
 * - fecha_pago en el rango (fecha operación / entrega)
 */
/** Solo columnas necesarias para totales, lotes y exportación (no `*` ni ítems completos). */
const SELECT_PEDIDOS_FACTURACION = `
  id,
  numero_publico,
  fecha_pago,
  forma_pago_total,
  created_at,
  total,
  total_pedido,
  descuento_global_porcentaje,
  descuento_global_monto,
  recargo_global_porcentaje,
  recargo_global_monto,
  pedido_items ( precio_unitario )
`;

export async function fetchPedidosParaFacturacion(
  desde: string,
  hasta: string
): Promise<Pedido[]> {
  const { data, error } = await sb
    .from("pedidos")
    .select(SELECT_PEDIDOS_FACTURACION)
    .eq("estado", "entregado")
    .eq("facturado", false)
    .eq("forma_pago_total", "transferencia")
    .not("fecha_pago", "is", null)
    .gte("fecha_pago", dayStartISO(desde))
    .lte("fecha_pago", dayEndISO(hasta))
    .order("fecha_pago", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Pedido[];
}

export async function marcarPedidosFacturados(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { error } = await sb
      .from("pedidos")
      .update({ facturado: true })
      .in("id", slice);
    if (error) throw error;
  }
}

/** Fecha fin (YYYY-MM-DD) del último período exportado; el próximo "desde" es día siguiente */
export async function getFacturacionUltimaExportHasta(): Promise<string | null> {
  const { data, error } = await sb
    .from("config")
    .select("valor")
    .eq("id", "facturacion_ultima_export_hasta")
    .maybeSingle();
  if (error) throw error;
  const v = (data as { valor: string } | null)?.valor?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function setFacturacionUltimaExportHasta(
  fechaYYYYMMDD: string
): Promise<void> {
  const { error } = await sb.from("config").upsert(
    { id: "facturacion_ultima_export_hasta", valor: fechaYYYYMMDD },
    { onConflict: "id" }
  );
  if (error) throw error;
}
