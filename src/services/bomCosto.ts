import type { PrecioImpresion } from "../types/precio";
import type { RecetaItem } from "../types/receta";
import type { ReglaCosto } from "../types/reglaCosto";
import type { Insumo, InsumoCategoria } from "../types/insumo";

/** Factor aplicado en SQL/UI al costo directo cuando la tarifa usa `reglas_costo` (+10% desperdicio). */
export const REGLAS_COSTO_FACTOR_SEGURIDAD = 1.1;

/** Maestros de rendimiento (unidades de consumo por lote de compra). */
export const RENDIMIENTO_MAESTRO_TONER = 1800; // páginas por cartucho
/** Páginas impresas por ml de tinta en depósito (costo impresión ≠ valor stock). */
export const RENDIMIENTO_MAESTRO_TINTA = 30;
/** Stock de tinta en BD = mililitros; precio_compra = $ por litro; 1000 ml = 1 L. */
export const ML_POR_LITRO_TINTA = 1000;
/** Derivado: páginas por litro = 30 × 1000 (solo referencia / compat SQL). */
export const PAGINAS_POR_LITRO_TINTA =
  RENDIMIENTO_MAESTRO_TINTA * ML_POR_LITRO_TINTA;
export const RENDIMIENTO_MAESTRO_PAPEL = 500; // hojas por resma
/** Unidades de consumo por paquete/lote estándar (espiral). Alineado a SQL / costeo. */
export const RENDIMIENTO_MAESTRO_ESPIRAL = 50;

/** Papel/tinta/tóner siempre se prorratean; tapas y similares pueden ser 1 unidad = 1. */
export const CATEGORIAS_PRORRATEO_OBLIGATORIO: readonly InsumoCategoria[] = [
  "papel",
  "tinta",
  "toner"
];

export function categoriaRequiereUveMayorQueUno(categoria: string): boolean {
  return CATEGORIAS_PRORRATEO_OBLIGATORIO.includes(categoria as InsumoCategoria);
}

/** Equiv. ≤ 1 en insumos que deben prorratearse → dato inválido para costeo. */
export function equivVentaDebeCorregirse(insumo: Insumo): boolean {
  if (!categoriaRequiereUveMayorQueUno(insumo.categoria)) return false;
  const r = Number(insumo.rendimiento);
  if (Number.isFinite(r) && r > 1) return false;
  const uve = Number(insumo.unidad_venta_equivalente);
  return !Number.isFinite(uve) || uve <= 1;
}

/**
 * @deprecated Usar `rendimientoEfectivoInsumo` en categoría tinta (= páginas/ml).
 */
export function carillasPorMlTinta(insumo: Insumo): number {
  if (insumo.categoria !== "tinta") return 0;
  return rendimientoEfectivoInsumo(insumo);
}

export function rendimientoEfectivoInsumo(insumo: Insumo): number {
  const r = Number(insumo.rendimiento);
  if (Number.isFinite(r) && r > 0) return r;
  switch (insumo.categoria) {
    case "toner":
      return RENDIMIENTO_MAESTRO_TONER;
    case "tinta":
      return RENDIMIENTO_MAESTRO_TINTA;
    case "papel": {
      const h = Number(insumo.hojas_por_unidad);
      if (Number.isFinite(h) && h > 0) return h;
      return RENDIMIENTO_MAESTRO_PAPEL;
    }
    case "espiral":
      return RENDIMIENTO_MAESTRO_ESPIRAL;
    default:
      break;
  }
  const eq = Number(
    insumo.unidades_por_compra ?? insumo.unidad_venta_equivalente
  );
  if (Number.isFinite(eq) && eq > 0) return eq;
  return 0;
}

/**
 * Costo directo por unidad de tarifa de anillado: Σ (costo_compra/rendimiento × cantidad_usada)
 * en líneas activas; +10% desperdicio (alineado a SQL y panel de reglas).
 */
export function costoDirectoTarifaAnilladoDesdeReglas(
  precioAnilladoId: string,
  reglas: ReglaCosto[],
  insumos: Insumo[]
): number {
  let base = 0;
  for (const r of reglas) {
    if (
      r.precio_anillado_id !== precioAnilladoId ||
      !r.activo ||
      !r.insumo_id
    ) {
      continue;
    }
    const ins = insumos.find((i) => i.id === r.insumo_id);
    if (!ins) continue;
    base += costoUnitarioInsumo(ins) * r.cantidad_usada;
  }
  if (base <= 0) return 0;
  return base * REGLAS_COSTO_FACTOR_SEGURIDAD;
}

/**
 * Costo por unidad de consumo según categoría:
 * - Papel: $/resma ÷ hojas/resma → $/hoja.
 * - Tóner: $/cartucho ÷ páginas/cartucho → $/página.
 * - Tinta: ($/litro ÷ ml/litro) ÷ páginas/ml → $/página (precio litro en compra).
 * - Resto: costo lote ÷ rendimiento del lote.
 */
export function costoUnitarioInsumo(insumo: Insumo): number {
  const base =
    Number(
      insumo.costo_compra ?? insumo.costo_base ?? insumo.precio_compra
    ) || 0;
  if (base <= 0) return 0;
  if (insumo.categoria === "tinta") {
    const precioMl = base / ML_POR_LITRO_TINTA;
    const pagPorMl = rendimientoEfectivoInsumo(insumo);
    if (pagPorMl > 0) return precioMl / pagPorMl;
    return 0;
  }
  const den = rendimientoEfectivoInsumo(insumo);
  if (den > 0) return base / den;
  return 0;
}

/**
 * Costo directo de insumos para 1 unidad tarifaria (1 hoja cobrada):
 * SF = 1 pág PDF; DF = 2 pág PDF = 1 hoja física.
 * POR_CARA → tinta/tóner por cara impresa; POR_HOJA_FISICA → papel por hoja física.
 */
export function costoDirectoDesdeRecetaImpresion(
  precio: PrecioImpresion,
  recetas: RecetaItem[],
  insumos: Insumo[]
): number | null {
  const lineas = recetas.filter(
    (x) =>
      x.alcance === "IMPRESION" &&
      x.precio_impresion_id === precio.id &&
      !x.es_espiral_auto &&
      x.insumo_id
  );
  if (lineas.length === 0) return null;
  const byId = new Map(insumos.map((i) => [i.id, i]));
  const paginas = precio.doble_faz ? 2 : 1;
  const hojas = precio.doble_faz ? Math.ceil(paginas / 2) : paginas;
  let directo = 0;
  for (const r of lineas) {
    if (!r.insumo_id) continue;
    const ins = byId.get(r.insumo_id);
    if (!ins || !ins.activo) continue;
    let q = Number(r.cantidad) || 0;
    if (r.modo_consumo === "POR_CARA") q *= paginas;
    else if (r.modo_consumo === "POR_HOJA_FISICA") q *= hojas;
    directo += q * costoUnitarioInsumo(ins);
  }
  return directo;
}
