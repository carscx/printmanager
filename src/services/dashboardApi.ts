import { sb } from "../config/supabase";
import type {
  EstadisticaDiaria,
  FiltroDashboardTiempo,
  RankingVendedor,
  TopProductoMargen
} from "../types/dashboard";

/** Columnas expuestas por `v_estadisticas_diarias` (PostgREST: nombre de columna = `dia`). */
const V_ESTADISTICAS_DIARIAS_SELECT =
  "dia,total_ingresos,ingresos_transferencia,ingresos_efectivo,ingresos_sin_forma,total_insumos,total_comisiones,ganancia_neta,pct_margen_real";

/** Normaliza filas de `v_estadisticas_diarias` (nombres Épica 4 / legado). */
function mapEstadisticaRow(row: Record<string, unknown>): EstadisticaDiaria {
  return {
    dia: String(row.dia ?? row.fecha ?? ""),
    total_ingresos: Number(row.total_ingresos ?? row.total_facturado ?? 0),
    ingresos_transferencia: Number(row.ingresos_transferencia ?? 0),
    ingresos_efectivo: Number(row.ingresos_efectivo ?? 0),
    ingresos_sin_forma: Number(row.ingresos_sin_forma ?? 0),
    total_insumos: Number(row.total_insumos ?? row.costo_insumos_total ?? 0),
    total_comisiones: Number(
      row.total_comisiones ?? row.costo_comision_total ?? 0
    ),
    ganancia_neta: Number(row.ganancia_neta ?? 0),
    pct_margen_real: Number(row.pct_margen_real ?? 0)
  };
}

/** Normaliza columnas de `v_rendimiento_vendedores` (o variantes manuales en BD). */
function mapRendimientoRow(row: Record<string, unknown>): RankingVendedor {
  return {
    vendedor_id: String(row.vendedor_id ?? ""),
    nombre: String(row.nombre ?? row.vendedor ?? ""),
    pedidos: Number(row.pedidos ?? row.cantidad_pedidos ?? 0),
    ventas_totales: Number(
      row.total_facturado ?? row.ventas_totales ?? row.total_bruto ?? 0
    ),
    comision_acumulada: Number(
      row.comision_acumulada ?? row.comision_total ?? row.comision ?? 0
    )
  };
}

function rangoFiltro(f: FiltroDashboardTiempo): { desde: string; hasta: string } {
  const ahora = new Date();
  const tz = "America/Argentina/Buenos_Aires";
  const fmt = (d: Date) => {
    const s = d.toLocaleDateString("en-CA", { timeZone: tz });
    return s;
  };

  if (f === "hoy") {
    const hoy = fmt(ahora);
    return { desde: hoy, hasta: hoy };
  }
  if (f === "7dias") {
    const hasta = fmt(ahora);
    const d = new Date(ahora);
    d.setDate(d.getDate() - 6);
    return { desde: fmt(d), hasta };
  }
  const inicioMes = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    1
  );
  return { desde: fmt(inicioMes), hasta: fmt(ahora) };
}

export const dashboardApi = {
  rangoFiltro,

  async fetchEstadisticasDiarias(
    desde: string,
    hasta: string
  ): Promise<EstadisticaDiaria[]> {
    let res = await sb
      .from("v_estadisticas_diarias")
      .select(V_ESTADISTICAS_DIARIAS_SELECT)
      .gte("dia", desde)
      .lte("dia", hasta)
      .order("dia", { ascending: true });
    if (res.error) {
      res = await sb
        .from("v_estadisticas_diarias")
        .select("*")
        .gte("dia", desde)
        .lte("dia", hasta)
        .order("dia", { ascending: true });
    }
    if (res.error) throw res.error;
    return (res.data ?? []).map((r) =>
      mapEstadisticaRow(r as Record<string, unknown>)
    );
  },

  async fetchTopProductos(
    desde: string,
    hasta: string,
    limit = 3
  ): Promise<TopProductoMargen[]> {
    const { data, error } = await sb.rpc("fn_dashboard_top_productos_margen", {
      p_desde: desde,
      p_hasta: hasta,
      p_limit: limit
    });
    if (error) throw error;
    return (data ?? []) as TopProductoMargen[];
  },

  async fetchPedidosPendientes(): Promise<number> {
    const { data, error } = await sb.rpc("fn_dashboard_pedidos_pendientes");
    if (error) throw error;
    return Number(data ?? 0);
  },

  /** Ranking acumulado desde `v_rendimiento_vendedores` (no filtra por período). */
  async fetchRendimientoVendedores(): Promise<RankingVendedor[]> {
    const { data, error } = await sb
      .from("v_rendimiento_vendedores")
      .select("*");
    if (error) throw error;
    return (data ?? []).map((r) =>
      mapRendimientoRow(r as Record<string, unknown>)
    );
  },

  /**
   * KPIs desde `v_estadisticas_diarias` (costos BOM congelados en pedido_items_insumos).
   * Ganancia neta: preferimos Σ `ganancia_neta` por día (definición SQL); si falta, fórmula explícita.
   */
  async fetchKpisRango(filtro: FiltroDashboardTiempo): Promise<{
    totalFacturado: number;
    ingresosTransferencia: number;
    ingresosEfectivo: number;
    ingresosSinForma: number;
    costoInsumos: number;
    costoComision: number;
    gananciaNeta: number;
    pctMargen: number;
  }> {
    const { desde, hasta } = rangoFiltro(filtro);
    const rows = await this.fetchEstadisticasDiarias(desde, hasta);
    let totalFacturado = 0;
    let ingresosTransferencia = 0;
    let ingresosEfectivo = 0;
    let ingresosSinForma = 0;
    let costoInsumos = 0;
    let costoComision = 0;
    let sumGananciaNeta = 0;
    let tieneGananciaPorDia = true;
    for (const r of rows) {
      const row = r as EstadisticaDiaria;
      totalFacturado += Number(row.total_ingresos);
      ingresosTransferencia += Number(row.ingresos_transferencia ?? 0);
      ingresosEfectivo += Number(row.ingresos_efectivo ?? 0);
      ingresosSinForma += Number(row.ingresos_sin_forma ?? 0);
      costoInsumos += Number(row.total_insumos);
      costoComision += Number(row.total_comisiones ?? 0);
      const gn = row.ganancia_neta;
      if (gn === undefined || gn === null) tieneGananciaPorDia = false;
      else sumGananciaNeta += Number(gn);
    }
    const gananciaFormula =
      totalFacturado - costoInsumos - costoComision;
    const gananciaNeta =
      tieneGananciaPorDia && rows.length > 0
        ? sumGananciaNeta
        : gananciaFormula;
    const pctMargen =
      totalFacturado > 0 ? (gananciaNeta / totalFacturado) * 100 : 0;
    return {
      totalFacturado,
      ingresosTransferencia,
      ingresosEfectivo,
      ingresosSinForma,
      costoInsumos,
      costoComision,
      gananciaNeta,
      pctMargen
    };
  }
};
