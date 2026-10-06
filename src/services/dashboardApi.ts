import { apiGet } from "../config/apiClient";
import type {
  EstadisticaDiaria,
  FiltroDashboardTiempo,
  RankingVendedor,
  TopProductoMargen
} from "../types/dashboard";

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
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });

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
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  return { desde: fmt(inicioMes), hasta: fmt(ahora) };
}

export const dashboardApi = {
  rangoFiltro,

  async fetchEstadisticasDiarias(
    desde: string,
    hasta: string
  ): Promise<EstadisticaDiaria[]> {
    const data = await apiGet<Record<string, unknown>[]>(
      `/dashboard/estadisticas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
    );
    return (data ?? []).map((r) => mapEstadisticaRow(r));
  },

  async fetchTopProductos(
    desde: string,
    hasta: string,
    limit = 3
  ): Promise<TopProductoMargen[]> {
    return apiGet(
      `/dashboard/top-productos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&limit=${limit}`
    );
  },

  async fetchPedidosPendientes(): Promise<number> {
    const r = await apiGet<{ count: number }>("/dashboard/pendientes");
    return Number(r.count ?? 0);
  },

  async fetchRendimientoVendedores(): Promise<RankingVendedor[]> {
    const data = await apiGet<Record<string, unknown>[]>(
      "/dashboard/rendimiento-vendedores"
    );
    return (data ?? []).map((r) => mapRendimientoRow(r));
  },

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
      totalFacturado += Number(r.total_ingresos);
      ingresosTransferencia += Number(r.ingresos_transferencia ?? 0);
      ingresosEfectivo += Number(r.ingresos_efectivo ?? 0);
      ingresosSinForma += Number(r.ingresos_sin_forma ?? 0);
      costoInsumos += Number(r.total_insumos);
      costoComision += Number(r.total_comisiones ?? 0);
      const gn = r.ganancia_neta;
      if (gn === undefined || gn === null) tieneGananciaPorDia = false;
      else sumGananciaNeta += Number(gn);
    }
    const gananciaFormula = totalFacturado - costoInsumos - costoComision;
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
