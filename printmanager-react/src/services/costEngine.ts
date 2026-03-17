import type {
  PrecioImpresion,
  PrecioAnillado,
  ConfigCosto
} from "../types/precio";
import type { Insumo } from "../types/insumo";
import type { Equipo } from "../types/equipo";
import { calcularCostoPorPagina } from "../types/equipo";

// ── Tipos del motor ─────────────────────────────────────────────────────────

export interface CostoItemParams {
  paginas: number;
  copias: number;
  tipo: "bn" | "color";
  doble_faz: boolean;
  anillado_mm: number | null; // null = sin anillado
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
    (p) => p.tipo === tipo && p.doble_faz === dobleFaz
  );
  return precio?.precio_venta ?? 0;
}

function encontrarPrecioAnillado(
  precios: PrecioAnillado[],
  medidaMm: number
): number {
  const precio = precios.find((p) => p.medida_mm === medidaMm);
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
  // Retorna el precio de compra del primer activo que coincida
  return candidatos[0].precio_compra;
}

function costoPapelPorHoja(insumos: Insumo[]): number {
  const papel = insumos.find(
    (i) => i.activo && i.categoria === "papel" && i.hojas_por_unidad
  );
  if (!papel || !papel.hojas_por_unidad) return 0;
  return papel.precio_compra / papel.hojas_por_unidad;
}

function costoTintaPorPagina(insumos: Insumo[], tipo: "bn" | "color"): number {
  const categoria = tipo === "bn" ? "toner" : "tinta";
  const tinta = insumos.find(
    (i) => i.activo && i.categoria === categoria && i.rendimiento
  );
  if (!tinta || !tinta.rendimiento) return 0;
  return tinta.precio_compra / tinta.rendimiento;
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
    let anillado = anillado_mm
      ? encontrarPrecioAnillado(preciosAnillado, anillado_mm)
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

    // Costos de impresión (por copia)
    const papel =
      !solo_anillado && paginas > 0 ? hojas * costoPapelPorHoja(insumos) : 0;
    const tinta =
      !solo_anillado && paginas > 0
        ? hojas * costoTintaPorPagina(insumos, params.tipo)
        : 0;
    const amortizacion =
      !solo_anillado && paginas > 0
        ? hojas * amortizacionPorPagina(equipos)
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
      pedido_items?: {
        precio_unitario?: number;
        observaciones?: string;
        _sobrina?: boolean;
      }[];
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
    const porcCom = Number(
      configCostos.find((c) => c.key === "comision_sobrina")?.value ?? 10
    );

    const comisionTotal = pedidos.reduce((acc, p) => {
      const comisionPedido = (p.pedido_items || []).reduce((accIt, it) => {
        const esSobrina = it._sobrina || it.observaciones?.includes("[AVRU]");
        return (
          (typeof accIt === "number" ? accIt : 0) +
          (esSobrina ? Number(it.precio_unitario || 0) * (porcCom / 100) : 0)
        );
      }, 0);
      return acc + comisionPedido;
    }, 0);

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
