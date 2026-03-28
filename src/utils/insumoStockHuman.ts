import type { Insumo, InsumoCategoria } from "../types/insumo";
import {
  costoUnitarioInsumo,
  ML_POR_LITRO_TINTA,
  rendimientoEfectivoInsumo
} from "../services/bomCosto";

function fmtCant(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 1000) / 1000;
  return Math.abs(r - Math.round(r)) < 1e-4
    ? String(Math.round(r))
    : String(r);
}

/**
 * “Bultos” para valorar: resmas/cartuchos; tinta = litros (stock ml ÷ 1000).
 * Tinta: rendimiento = páginas/ml (maestro conservador en bomCosto); costeo/stock pedidos.
 */
export function bultosEnStock(ins: Insumo): number {
  const s = Number(ins.stock_actual) || 0;
  if (ins.categoria === "tinta") {
    return s / ML_POR_LITRO_TINTA;
  }
  const r = rendimientoEfectivoInsumo(ins);
  if (r <= 0) return 0;
  return s / r;
}

/**
 * Inventario tinta: litros × precio por litro.
 * Resto: stock en u. consumo × costo unitario (precio ÷ rendimiento).
 */
export function valorInventarioPorUnidadConsumo(ins: Insumo): number {
  if (ins.categoria === "tinta") {
    return valorInventarioUltimoPrecioBulto(ins);
  }
  const s = Number(ins.stock_actual) || 0;
  return s * costoUnitarioInsumo(ins);
}

/** @deprecated alias — usar valorInventarioPorUnidadConsumo */
export function valorInventarioPrecioCompra(ins: Insumo): number {
  return valorInventarioPorUnidadConsumo(ins);
}

/** Último precio de compra del bulto: resma/cartucho o $/litro (tinta). */
export function ultimoPrecioCompraBulto(ins: Insumo): number {
  return Number(ins.precio_compra ?? ins.costo_compra ?? ins.costo_base) || 0;
}

/** Valor = bultos × último precio (tinta: litros × $/litro). */
export function valorInventarioUltimoPrecioBulto(ins: Insumo): number {
  return bultosEnStock(ins) * ultimoPrecioCompraBulto(ins);
}

/** Stock en BD: hojas, carillas (tóner), ml (tinta), u. */
export function stockFisicoTexto(ins: Insumo): string {
  const s = Number(ins.stock_actual) || 0;
  switch (ins.categoria) {
    case "papel":
      return `${fmtCant(s)} hojas`;
    case "toner":
      return `${fmtCant(s)} carillas`;
    case "tinta":
      return `${fmtCant(s)} ml`;
    default:
      return `${fmtCant(s)} u.`;
  }
}

/** Listados: bultos humanos; tinta en litros. */
export function stockHumanoTexto(ins: Insumo): string {
  const s = Number(ins.stock_actual) || 0;
  switch (ins.categoria) {
    case "papel": {
      const b = bultosEnStock(ins);
      return `${fmtCant(b)} Resmas`;
    }
    case "toner": {
      const b = bultosEnStock(ins);
      return `${fmtCant(b)} Cartuchos`;
    }
    case "tinta": {
      const litros = s / ML_POR_LITRO_TINTA;
      return `${fmtCant(litros)} L`;
    }
    default:
      return fmtCant(s);
  }
}

export function etiquetaStockCategoria(categoria: InsumoCategoria): string {
  switch (categoria) {
    case "papel":
      return "Resmas";
    case "toner":
      return "Cartuchos";
    case "tinta":
      return "Mililitros (ml)";
    default:
      return "Stock actual";
  }
}

export function etiquetaMinimoCategoria(categoria: InsumoCategoria): string {
  switch (categoria) {
    case "papel":
      return "Mín. resmas";
    case "toner":
      return "Mín. cartuchos";
    case "tinta":
      return "Mínimo (ml)";
    default:
      return "Stock mínimo";
  }
}

export function etiquetaPrecioBulto(categoria: InsumoCategoria): string {
  switch (categoria) {
    case "papel":
      return "Precio por resma (compra)";
    case "toner":
      return "Precio por cartucho (compra)";
    case "tinta":
      return "Precio por litro (compra)";
    default:
      return "Precio total de la compra";
  }
}
