import { apiGet, apiPost, apiPut } from "../config/apiClient";
import type { Pedido } from "../types/pedido";

export function dayStartISO(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0).toISOString();
}

export function dayEndISO(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, 23, 59, 59, 999).toISOString();
}

export async function fetchPedidosParaFacturacion(
  desde: string,
  hasta: string
): Promise<Pedido[]> {
  return apiGet(
    `/facturacion/pedidos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
  );
}

export async function marcarPedidosFacturados(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await apiPost("/facturacion/marcar", { ids });
}

export async function getFacturacionUltimaExportHasta(): Promise<string | null> {
  const r = await apiGet<{ fecha: string | null }>("/facturacion/ultima-export");
  return r.fecha;
}

export async function setFacturacionUltimaExportHasta(
  fechaYYYYMMDD: string
): Promise<void> {
  await apiPut("/facturacion/ultima-export", { fecha: fechaYYYYMMDD });
}
