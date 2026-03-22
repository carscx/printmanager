/** Fila de `v_estadisticas_diarias` */
export interface EstadisticaDiaria {
  dia: string;
  total_ingresos: number;
  total_insumos: number;
  total_comisiones: number;
  ganancia_neta: number;
  pct_margen_real: number;
}

/** Fila de `v_rendimiento_vendedores` (normalizada en dashboardApi) */
export interface RankingVendedor {
  vendedor_id: string;
  nombre: string;
  pedidos: number;
  ventas_totales: number;
  comision_acumulada: number;
}

export interface TopProductoMargen {
  producto: string;
  margen_neto: number;
  venta_total: number;
}

export type FiltroDashboardTiempo = "hoy" | "7dias" | "mes";
