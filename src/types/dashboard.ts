/** Fila de `v_estadisticas_diarias` */
export interface EstadisticaDiaria {
  dia: string;
  total_ingresos: number;
  /** Suma ventas clasificadas como transferencia (base ARCA / facturación). */
  ingresos_transferencia: number;
  /** Suma ventas clasificadas como efectivo (no entran en facturación ARCA). */
  ingresos_efectivo: number;
  /** Pedidos sin forma de cobro registrada. */
  ingresos_sin_forma: number;
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
