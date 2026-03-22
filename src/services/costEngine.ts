import type {
  PrecioImpresion,
  PrecioAnillado,
  ConfigCosto
} from "../types/precio";
import type { Insumo } from "../types/insumo";
import type { Equipo } from "../types/equipo";
import { calcularCostoPorPagina } from "../types/equipo";
import {
  costoDirectoTarifaAnilladoDesdeReglas,
  costoUnitarioInsumo
} from "./bomCosto";
import type { ReglaCosto } from "../types/reglaCosto";

// ── Tipos del motor ─────────────────────────────────────────────────────────

export interface CostoItemParams {
  paginas: number;
  copias: number;
  tipo: "bn" | "color";
  doble_faz: boolean;
  anillado_mm: number | null; // null = sin anillado
  /** Si está definido, usa esta fila del tarifario (evita ambigüedad por medida). */
  precio_anillado_id?: string | null;
  solo_anillado: boolean;
  // Descuentos y recargos
  descuento_porcentaje?: number | null;
  descuento_monto?: number | null;
  recargo_porcentaje?: number | null;
  recargo_monto?: number | null;
  descuento_global_porcentaje?: number | null;
  recargo_global_porcentaje?: number | null;
}

export interface DesgloseVenta {
  impresion: number;
  anillado: number;
  porCopia: number;
  total: number;
}

export interface DesgloseCosto {
  papel: number;
  tinta: number;
  amortizacion: number;
  espiral: number;
  tapaTransparente: number;
  tapaColor: number;
  bolsa: number;
  porCopia: number;
  total: number;
}

export interface ResultadoItem {
  venta: DesgloseVenta;
  costo: DesgloseCosto;
  ganancia: number;
  margen: number; // porcentaje 0-100
}

// ── Helpers internos ────────────────────────────────────────────────────────

function encontrarPrecioImpresion(
  precios: PrecioImpresion[],
  tipo: "bn" | "color",
  dobleFaz: boolean
): number {
  const precio = precios.find(
    (p) =>
      p.activo !== false && p.tipo === tipo && p.doble_faz === dobleFaz
  );
  return precio?.precio_venta ?? 0;
}

function precioVentaAnillado(
  precios: PrecioAnillado[],
  medidaMm: number | null,
  precioPreferidoId?: string | null
): number {
  if (precioPreferidoId) {
    const p = precios.find(
      (x) => x.id === precioPreferidoId && x.activo !== false
    );
    if (p) return Number(p.precio_venta);
  }
  if (medidaMm == null) return 0;
  const precio = precios.find(
    (p) => p.medida_mm === medidaMm && p.activo !== false
  );
  return precio?.precio_venta ?? 0;
}

function costoInsumoPorCategoria(
  insumos: Insumo[],
  categoria: string,
  medidaMm?: number | null
): number {
  const candidatos = insumos.filter(
    (i) =>
      i.activo &&
      i.categoria === categoria &&
      (medidaMm == null || i.medida_mm === medidaMm)
  );
  if (candidatos.length === 0) return 0;
  return costoUnitarioInsumo(candidatos[0]);
}

/** Costo por hoja de consumo (solo para calcularCostoItem interno). */
function costoPapelPorHoja(insumos: Insumo[]): number {
  const papel = insumos.find(
    (i) =>
      i.activo &&
      i.categoria === "papel" &&
      Number(i.unidad_venta_equivalente) > 0
  );
  if (!papel) return 0;
  return costoUnitarioInsumo(papel);
}

/**
 * Tóner o suma de tintas por página: costo unitario ya prorrateado por cartucho/tinta.
 */
function costoTintaPorPagina(insumos: Insumo[], tipo: "bn" | "color"): number {
  if (tipo === "bn") {
    const toner = insumos.find(
      (i) =>
        i.activo &&
        i.categoria === "toner" &&
        Number(i.unidad_venta_equivalente) > 0
    );
    if (!toner) return 0;
    return costoUnitarioInsumo(toner);
  }
  const tintas = insumos.filter(
    (i) =>
      i.activo &&
      i.categoria === "tinta" &&
      Number(i.unidad_venta_equivalente) > 0
  );
  if (tintas.length === 0) return 0;
  return tintas.reduce((acc, t) => acc + costoUnitarioInsumo(t), 0);
}

function amortizacionPorPagina(equipos: Equipo[]): number {
  const activos = equipos.filter((e) => e.activo);
  if (activos.length === 0) return 0;
  const totalCostoPorPag = activos.reduce(
    (acc, eq) => acc + calcularCostoPorPagina(eq),
    0
  );
  return totalCostoPorPag / activos.length;
}

// ── Motor principal ─────────────────────────────────────────────────────────

export const costEngine = {
  /**
   * Calcula precio de venta usando las tablas de precios.
   * Reemplaza calculator.calculatePedido para la parte de precio al cliente.
   */
  calcularPrecioVenta(
    params: CostoItemParams,
    preciosImpresion: PrecioImpresion[],
    preciosAnillado: PrecioAnillado[]
  ): DesgloseVenta {
    const {
      paginas,
      copias,
      tipo,
      doble_faz,
      anillado_mm,
      precio_anillado_id,
      solo_anillado,
      descuento_porcentaje,
      descuento_monto,
      recargo_porcentaje,
      recargo_monto,
      descuento_global_porcentaje,
      recargo_global_porcentaje
    } = params;
    const hojas = doble_faz ? Math.ceil(paginas / 2) : paginas;
    const precioHoja = encontrarPrecioImpresion(
      preciosImpresion,
      tipo,
      doble_faz
    );

    let impresion = !solo_anillado && paginas > 0 ? hojas * precioHoja : 0;
    let anillado =
      anillado_mm || precio_anillado_id
        ? precioVentaAnillado(
            preciosAnillado,
            anillado_mm,
            precio_anillado_id
          )
        : 0;
    let porCopia = impresion + anillado;
    // Descuentos y recargos por ítem
    if (descuento_porcentaje) {
      porCopia -= porCopia * (descuento_porcentaje / 100);
    }
    if (descuento_monto) {
      porCopia -= descuento_monto;
    }
    if (recargo_porcentaje) {
      porCopia += porCopia * (recargo_porcentaje / 100);
    }
    if (recargo_monto) {
      porCopia += recargo_monto;
    }
    let total = Math.round(porCopia * copias);
    // Descuentos y recargos globales
    if (descuento_global_porcentaje) {
      total -= Math.round(total * (descuento_global_porcentaje / 100));
    }
    if (recargo_global_porcentaje) {
      total += Math.round(total * (recargo_global_porcentaje / 100));
    }
    return { impresion, anillado, porCopia, total };
  },

  /**
   * Calcula el costo real desglosado usando insumos y equipos.
   */
  calcularCostoItem(
    params: CostoItemParams,
    insumos: Insumo[],
    equipos: Equipo[]
  ): DesgloseCosto {
    const { paginas, copias, doble_faz, anillado_mm, solo_anillado } = params;
    const hojas = doble_faz ? Math.ceil(paginas / 2) : paginas;

    // Costos de impresión (por copia): tinta/tóner por cara impresa (páginas PDF);
    // papel por hoja física; amortización equipos por página impresa.
    const papel =
      !solo_anillado && paginas > 0 ? hojas * costoPapelPorHoja(insumos) : 0;
    const tinta =
      !solo_anillado && paginas > 0
        ? paginas * costoTintaPorPagina(insumos, params.tipo)
        : 0;
    const amortizacion =
      !solo_anillado && paginas > 0
        ? paginas * amortizacionPorPagina(equipos)
        : 0;

    // Costos de anillado (por copia)
    const espiral = anillado_mm
      ? costoInsumoPorCategoria(insumos, "espiral", anillado_mm)
      : 0;
    const tapaTransparente = anillado_mm
      ? costoInsumoPorCategoria(insumos, "tapa_transparente")
      : 0;
    const tapaColor = anillado_mm
      ? costoInsumoPorCategoria(insumos, "tapa_color")
      : 0;
    const bolsa = anillado_mm ? costoInsumoPorCategoria(insumos, "bolsa") : 0;

    const porCopia =
      papel +
      tinta +
      amortizacion +
      espiral +
      tapaTransparente +
      tapaColor +
      bolsa;
    const total = Math.round(porCopia * copias);

    return {
      papel,
      tinta,
      amortizacion,
      espiral,
      tapaTransparente,
      tapaColor,
      bolsa,
      porCopia,
      total
    };
  },

  /**
   * Calcula el resultado completo: venta, costo y ganancia.
   */
  calcularItem(
    params: CostoItemParams,
    preciosImpresion: PrecioImpresion[],
    preciosAnillado: PrecioAnillado[],
    insumos: Insumo[],
    equipos: Equipo[]
  ): ResultadoItem {
    const venta = this.calcularPrecioVenta(
      params,
      preciosImpresion,
      preciosAnillado
    );
    const costo = this.calcularCostoItem(params, insumos, equipos);
    const ganancia = venta.total - costo.total;
    const margen =
      venta.total > 0 ? Math.round((ganancia / venta.total) * 100) : 0;
    return { venta, costo, ganancia, margen };
  },

  /**
   * Calcula resumen de pedidos (total, comisión, ganancia).
   * Reemplaza calculator.calculateResumen.
   */
  calcularResumen(
    pedidos: {
      total: number;
      total_pedido?: number;
      comision_monto?: number | null;
      pedido_items?: { precio_unitario?: number; observaciones?: string }[];
    }[],
    configCostos: ConfigCosto[]
  ) {
    const total = pedidos.reduce(
      (acc, p) => acc + Number(p.total || p.total_pedido || 0),
      0
    );

    const mkp = Number(
      configCostos.find((c) => c.key === "markup_general")?.value ?? 1.6
    );

    const comisionTotal = pedidos.reduce(
      (acc, p) => acc + Number(p.comision_monto ?? 0),
      0
    );

    const gananciaBruta =
      typeof total === "number" && typeof mkp === "number" && mkp !== 0
        ? total - total / mkp
        : 0;
    const gananciaLimpia = Math.round(gananciaBruta - comisionTotal);

    return {
      total: Math.round(total),
      comisionTotal: Math.round(comisionTotal),
      gananciaLimpia
    };
  }
};

// ── Costo por unidad tarifaria (para pantalla Precios y alertas de margen) ──

/**
 * Costo variable por 1 hoja tarifaria: insumos (`costo_insumo_directo`) +, si hay `equipo_id`,
 * amortización + mantenimiento por página (misma lógica que `calcularCostoPorPagina`).
 */
export function costoVariablePorUnidadImpresion(
  precio: PrecioImpresion,
  equipos?: Equipo[]
): number {
  let insumos = 0;
  const v = precio.costo_insumo_directo;
  if (v != null && Number.isFinite(Number(v)) && Number(v) > 0) {
    insumos = Number(v);
  }
  let aporteEquipo = 0;
  if (precio.equipo_id && equipos?.length) {
    const eq = equipos.find((e) => e.id === precio.equipo_id);
    if (eq) aporteEquipo = calcularCostoPorPagina(eq);
  }
  return insumos + aporteEquipo;
}

export function tieneCostoDirectoTarifaImpresion(
  precio: PrecioImpresion,
  equipos?: Equipo[]
): boolean {
  return costoVariablePorUnidadImpresion(precio, equipos) > 0.005;
}

/**
 * Costo variable por tarifa de anillado: si hay `reglasTarifa`, Σ (costo_compra/rendimiento × cantidad) +10%;
 * si no, `precios_anillado.costo_insumo_directo`; último recurso motor legacy por medida.
 */
export function costoVariablePorUnidadAnillado(
  precio: PrecioAnillado,
  insumos: Insumo[],
  equipos: Equipo[],
  reglasTarifa?: ReglaCosto[]
): number {
  if (reglasTarifa && reglasTarifa.length > 0) {
    const desdeReglas = costoDirectoTarifaAnilladoDesdeReglas(
      precio.id,
      reglasTarifa,
      insumos
    );
    if (desdeReglas > 0) return desdeReglas;
  }
  const v = precio.costo_insumo_directo;
  if (v != null && Number.isFinite(Number(v)) && Number(v) > 0) {
    return Number(v);
  }
  const params: CostoItemParams = {
    paginas: 0,
    copias: 1,
    tipo: "bn",
    doble_faz: false,
    anillado_mm: precio.medida_mm,
    solo_anillado: true
  };
  return costEngine.calcularCostoItem(params, insumos, equipos).porCopia;
}

export function tieneCostoDirectoTarifaAnillado(
  precio: PrecioAnillado,
  insumos: Insumo[],
  equipos: Equipo[],
  reglasTarifa?: ReglaCosto[]
): boolean {
  return (
    costoVariablePorUnidadAnillado(precio, insumos, equipos, reglasTarifa) >
    0.005
  );
}

/** Margen sobre el precio de venta: (precio − costo) / precio × 100 */
export function margenSobreVenta(
  precioVenta: number,
  costoVariable: number
): { margenPct: number | null; ganancia: number; costo: number } {
  const costo = Math.max(0, Number(costoVariable) || 0);
  if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
    return { margenPct: null, ganancia: -costo, costo };
  }
  const ganancia = precioVenta - costo;
  return {
    margenPct: (ganancia / precioVenta) * 100,
    ganancia,
    costo
  };
}
