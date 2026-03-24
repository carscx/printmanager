import type { Pedido } from "../types/pedido";
import { totalVentaPedido } from "./pedidoTotalVenta";

/** Pedido individual > este monto → una línea de factura propia */
export const UMBRAL_LOTE_INDIVIDUAL = 50_000;
/** Lotes de pedidos chicos: total del lote en este rango (aleatorio por lote) */
export const LOTE_MIN = 60_000;
export const LOTE_MAX = 120_000;
/** Alerta DNI/CUIT */
export const UMBRAL_ALERTA_DNI = 190_000;

export type LineaFacturacion = {
  /** Números de pedido y/o UUIDs cortos para ARCA */
  idInterno: string;
  fechaEmisionSugerida: string;
  descripcion: string;
  importeTotal: number;
  pedidoIds: string[];
  requiereDni: boolean;
};

const DESCRIPCIONES = [
  "Servicios de impresión digital y anillados",
  "Encuadernación, copiado y ploteos varios",
  "Impresión b/n y color; terminaciones de encuadernación",
  "Servicios de reprografía y anillados espiral",
  "Trabajos de impresión, cortes y armado de carpetas",
  "Copiado, impresión y terminaciones varias",
  "Servicios gráficos: impresión y encuadernación",
  "Impresión de archivos y anillados según pedido",
  "Encuadernación espiral y servicios de copiado",
  "Impresión digital y acabados de taller"
];

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function montoPedido(p: Pedido): number {
  return Math.round(totalVentaPedido(p));
}

function fechaOrden(p: Pedido): number {
  const raw = p.fecha_pago ?? p.created_at;
  return raw ? new Date(raw).getTime() : 0;
}

function fechaEmisionSugerida(batch: Pedido[]): string {
  const last = batch.reduce((a, b) =>
    fechaOrden(a) >= fechaOrden(b) ? a : b
  );
  const raw = last.fecha_pago ?? last.created_at;
  if (!raw) return "";
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function idInternoUno(p: Pedido): string {
  if (p.numero_publico != null && p.numero_publico !== undefined) {
    return `Pedido #${p.numero_publico}`;
  }
  return `id:${p.id.slice(0, 8)}…`;
}

function idInternoLote(ps: Pedido[]): string {
  return ps
    .map((p) =>
      p.numero_publico != null ? `#${p.numero_publico}` : p.id.slice(0, 8)
    )
    .join(", ");
}

function fusionarLineas(
  a: LineaFacturacion,
  b: LineaFacturacion,
  pedidos: Pedido[]
): LineaFacturacion {
  const ids = [...a.pedidoIds, ...b.pedidoIds];
  const ps = pedidos.filter((p) => ids.includes(p.id));
  const importe = ps.reduce((s, p) => s + montoPedido(p), 0);
  return {
    idInterno: idInternoLote(ps),
    fechaEmisionSugerida: fechaEmisionSugerida(ps),
    descripcion: a.descripcion,
    importeTotal: importe,
    pedidoIds: ids,
    requiereDni: importe > UMBRAL_ALERTA_DNI
  };
}

/**
 * Agrupa pedidos entregados no facturados en líneas de exportación.
 */
export function armarLineasFacturacion(pedidos: Pedido[]): LineaFacturacion[] {
  const lineas: LineaFacturacion[] = [];
  let descIdx = 0;
  const nextDesc = () =>
    DESCRIPCIONES[descIdx++ % DESCRIPCIONES.length];

  const grandes = pedidos.filter((p) => montoPedido(p) > UMBRAL_LOTE_INDIVIDUAL);
  const chicos = pedidos.filter((p) => montoPedido(p) <= UMBRAL_LOTE_INDIVIDUAL);

  grandes.sort((a, b) => fechaOrden(a) - fechaOrden(b));
  chicos.sort((a, b) => fechaOrden(a) - fechaOrden(b));

  for (const p of grandes) {
    const m = montoPedido(p);
    lineas.push({
      idInterno: idInternoUno(p),
      fechaEmisionSugerida: fechaEmisionSugerida([p]),
      descripcion: nextDesc(),
      importeTotal: m,
      pedidoIds: [p.id],
      requiereDni: m > UMBRAL_ALERTA_DNI
    });
  }

  const remaining = [...chicos];
  while (remaining.length > 0) {
    const target = randomBetween(LOTE_MIN, LOTE_MAX);
    const batch: Pedido[] = [];
    let sum = 0;

    while (remaining.length > 0) {
      const next = remaining[0];
      const a = montoPedido(next);

      if (batch.length === 0) {
        batch.push(remaining.shift()!);
        sum += a;
        if (sum >= target) break;
        continue;
      }

      if (sum + a <= target && sum + a <= LOTE_MAX) {
        batch.push(remaining.shift()!);
        sum += a;
        if (sum >= target) break;
        continue;
      }

      if (sum >= LOTE_MIN) break;

      batch.push(remaining.shift()!);
      sum += a;
    }

    if (batch.length === 0) break;

    const m = batch.reduce((s, p) => s + montoPedido(p), 0);
    lineas.push({
      idInterno: idInternoLote(batch),
      fechaEmisionSugerida: fechaEmisionSugerida(batch),
      descripcion: nextDesc(),
      importeTotal: m,
      pedidoIds: batch.map((p) => p.id),
      requiereDni: m > UMBRAL_ALERTA_DNI
    });
  }

  if (lineas.length >= 2) {
    const last = lineas[lineas.length - 1];
    if (last.importeTotal < LOTE_MIN) {
      const prev = lineas[lineas.length - 2];
      lineas.splice(
        lineas.length - 2,
        2,
        fusionarLineas(prev, last, pedidos)
      );
    }
  }

  return lineas;
}
