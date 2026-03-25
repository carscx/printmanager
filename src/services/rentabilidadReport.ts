import type { Pedido, PedidoItem } from "../types/pedido";
import type { PedidoItemInsumo } from "../types/precio";
import { agregarDescuentosRecargos } from "./descuentosReport";
import { totalVentaPedido } from "../utils/pedidoTotalVenta";

export interface SerieDiaria {
  fecha: string;
  ingresos: number;
  costos: number;
  ganancia: number;
}

export interface DesgloseBucket {
  key: string;
  label: string;
  ingresos: number;
  costos: number;
  ganancia: number;
  margenPct: number;
}

export interface InsumoConsumoRank {
  insumo_id: string;
  nombre: string;
  cantidad: number;
  costoTotal: number;
}

export interface RentabilidadResultado {
  ingresosBrutos: number;
  /** Misma regla que la vista: COALESCE(forma_pago_total, forma_pago_sena). */
  ingresosTransferencia: number;
  ingresosEfectivo: number;
  ingresosSinForma: number;
  costoInsumos: number;
  comisionesVendedores: number;
  gananciaNeta: number;
  margenPromedioPct: number;
  pedidosTotal: number;
  pedidosCancelados: number;
  totalDescuentosOtorgados: number;
  serieDiaria: SerieDiaria[];
  desglose: DesgloseBucket[];
  rankingInsumos: InsumoConsumoRank[];
  bucketsMargenNegativo: string[];
}

function labelBucket(key: string): string {
  const [t, f, a] = key.split("_");
  const tipo = t === "BN" ? "B&N" : "Color";
  const faz = f === "DF" ? "Doble faz" : "Simple faz";
  const an = a === "AN" ? "Con anillado" : "Sin anillado";
  return `${tipo} · ${faz} · ${an}`;
}

function bucketItem(it: PedidoItem): string {
  const ti = (it.tipo_impresion || "").toUpperCase();
  const bn = ti.includes("B/N") || ti.includes("BN");
  const df = ti.includes("DF") || ti.includes("DOBLE");
  const ani = !!it.anillado;
  return `${bn ? "BN" : "COL"}_${df ? "DF" : "SF"}_${ani ? "AN" : "SIN"}`;
}

function fechaLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function comisionesDesdePedidos(pedidos: Pedido[]): number {
  return pedidos.reduce((acc, p) => acc + Number(p.comision_monto ?? 0), 0);
}

/** Alineado con `v_estadisticas_diarias` (prioriza cobro total sobre seña). */
function formaCobroPedido(p: Pedido): "transferencia" | "efectivo" | null {
  const v = p.forma_pago_total ?? p.forma_pago_sena;
  if (v === "transferencia") return "transferencia";
  if (v === "efectivo") return "efectivo";
  return null;
}

function costoPorItem(
  consumos: PedidoItemInsumo[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of consumos) {
    const id = c.pedido_item_id;
    m.set(id, (m.get(id) || 0) + Number(c.costo_total) || 0);
  }
  return m;
}

export function calcularRentabilidad(
  pedidosPeriodo: Pedido[],
  consumos: PedidoItemInsumo[],
  nombresInsumo: Map<string, string>
): RentabilidadResultado {
  const cancelados = pedidosPeriodo.filter((p) => p.estado === "cancelado");
  const activos = pedidosPeriodo.filter((p) => p.estado !== "cancelado");

  const ingresosBrutos = activos.reduce(
    (s, p) => s + totalVentaPedido(p),
    0
  );

  let ingresosTransferencia = 0;
  let ingresosEfectivo = 0;
  let ingresosSinForma = 0;
  for (const p of activos) {
    const tv = totalVentaPedido(p);
    const fc = formaCobroPedido(p);
    if (fc === "transferencia") ingresosTransferencia += tv;
    else if (fc === "efectivo") ingresosEfectivo += tv;
    else ingresosSinForma += tv;
  }

  const itemToPedido = new Map<string, string>();
  const pedidoById = new Map<string, Pedido>();
  for (const p of activos) {
    pedidoById.set(p.id, p);
    for (const it of p.pedido_items || []) {
      if (it.id) itemToPedido.set(it.id, p.id);
    }
  }

  const costoPorItemMap = costoPorItem(consumos);
  let costoInsumos = 0;
  for (const c of consumos) {
    costoInsumos += Number(c.costo_total) || 0;
  }

  const comisionesVendedores = comisionesDesdePedidos(activos);
  const gananciaNeta = Math.round(
    ingresosBrutos - costoInsumos - comisionesVendedores
  );
  const margenPromedioPct =
    ingresosBrutos > 0
      ? Math.round((gananciaNeta / ingresosBrutos) * 1000) / 10
      : 0;

  const aggDesc = agregarDescuentosRecargos(activos);
  const totalDescuentosOtorgados =
    aggDesc.descuentoItems + aggDesc.descuentoGlobal;

  const diaIngreso = new Map<string, number>();
  const diaCosto = new Map<string, number>();
  for (const p of activos) {
    const d = fechaLocal(p.created_at);
    const t = totalVentaPedido(p);
    diaIngreso.set(d, (diaIngreso.get(d) || 0) + t);
  }
  for (const c of consumos) {
    const pid = itemToPedido.get(c.pedido_item_id);
    if (!pid) continue;
    const p = pedidoById.get(pid);
    if (!p) continue;
    const d = fechaLocal(p.created_at);
    diaCosto.set(d, (diaCosto.get(d) || 0) + (Number(c.costo_total) || 0));
  }
  const allDays = new Set([...diaIngreso.keys(), ...diaCosto.keys()]);
  const serieDiaria: SerieDiaria[] = Array.from(allDays)
    .sort()
    .map((fecha) => {
      const ing = diaIngreso.get(fecha) || 0;
      const cost = diaCosto.get(fecha) || 0;
      const gan = Math.round(ing - cost);
      return { fecha, ingresos: ing, costos: cost, ganancia: gan };
    });

  const bucketData = new Map<
    string,
    { ing: number; cost: number }
  >();
  for (const p of activos) {
    for (const it of p.pedido_items || []) {
      const k = bucketItem(it);
      const ing = Number(it.precio_unitario) || 0;
      const cost = it.id ? costoPorItemMap.get(it.id) || 0 : 0;
      const cur = bucketData.get(k) || { ing: 0, cost: 0 };
      cur.ing += ing;
      cur.cost += cost;
      bucketData.set(k, cur);
    }
  }
  const desglose: DesgloseBucket[] = Array.from(bucketData.entries()).map(
    ([key, v]) => {
      const gan = v.ing - v.cost;
      const margenPct =
        v.ing > 0 ? Math.round((gan / v.ing) * 1000) / 10 : 0;
      return {
        key,
        label: labelBucket(key),
        ingresos: v.ing,
        costos: v.cost,
        ganancia: Math.round(gan),
        margenPct
      };
    }
  );
  desglose.sort((a, b) => b.ingresos - a.ingresos);

  const bucketsMargenNegativo = desglose
    .filter((b) => b.ingresos > 0 && b.ganancia < 0)
    .map((b) => b.label);

  const rankMap = new Map<
    string,
    { cantidad: number; costo: number }
  >();
  for (const c of consumos) {
    const cur = rankMap.get(c.insumo_id) || { cantidad: 0, costo: 0 };
    cur.cantidad += Number(c.cantidad) || 0;
    cur.costo += Number(c.costo_total) || 0;
    rankMap.set(c.insumo_id, cur);
  }
  const rankingInsumos: InsumoConsumoRank[] = Array.from(rankMap.entries())
    .map(([insumo_id, v]) => ({
      insumo_id,
      nombre: nombresInsumo.get(insumo_id) || insumo_id.slice(0, 8),
      cantidad: v.cantidad,
      costoTotal: v.costo
    }))
    .sort((a, b) => b.costoTotal - a.costoTotal)
    .slice(0, 15);

  return {
    ingresosBrutos: Math.round(ingresosBrutos),
    ingresosTransferencia: Math.round(ingresosTransferencia),
    ingresosEfectivo: Math.round(ingresosEfectivo),
    ingresosSinForma: Math.round(ingresosSinForma),
    costoInsumos: Math.round(costoInsumos),
    comisionesVendedores: Math.round(comisionesVendedores),
    gananciaNeta,
    margenPromedioPct,
    pedidosTotal: pedidosPeriodo.length,
    pedidosCancelados: cancelados.length,
    totalDescuentosOtorgados,
    serieDiaria,
    desglose,
    rankingInsumos,
    bucketsMargenNegativo
  };
}
