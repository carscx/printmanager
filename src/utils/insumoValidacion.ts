import type { InsumoInput, InsumoCategoria } from "../types/insumo";

/** Límite absoluto para detectar errores de doble multiplicación o typos. */
export const STOCK_NUMERICO_MAX = 1e12;

export class InsumoValidacionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsumoValidacionError";
  }
}

function numOk(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= STOCK_NUMERICO_MAX;
}

/**
 * Antes de crear/actualizar insumo: stock y precios razonables (evita
 * sobre-multiplicación accidental en el cliente).
 * `categoriaResuelta`: usar en PATCH cuando no viene `categoria` en el body.
 */
export function validarInsumoStockYPrecio(
  input: Partial<InsumoInput> & { categoria?: InsumoCategoria },
  categoriaResuelta?: InsumoCategoria
): void {
  const cat = input.categoria ?? categoriaResuelta;
  if (input.stock_actual != null) {
    const s = Number(input.stock_actual);
    if (!numOk(s)) {
      throw new InsumoValidacionError("STOCK_ACTUAL_FUERA_DE_RANGO");
    }
    if (cat === "papel" && s > 500_000_000) {
      throw new InsumoValidacionError("STOCK_PAPEL_SOSPECHOSAMENTE_ALTO");
    }
    if ((cat === "toner" || cat === "tinta") && s > 2_000_000_000) {
      throw new InsumoValidacionError("STOCK_TONER_TINTA_SOSPECHOSAMENTE_ALTO");
    }
  }
  if (input.stock_minimo != null) {
    const m = Number(input.stock_minimo);
    if (!numOk(m)) {
      throw new InsumoValidacionError("STOCK_MINIMO_FUERA_DE_RANGO");
    }
  }
  const precio =
    input.precio_compra ?? input.costo_compra ?? input.costo_base ?? null;
  if (precio != null) {
    const p = Number(precio);
    if (!Number.isFinite(p) || p < 0 || p > STOCK_NUMERICO_MAX) {
      throw new InsumoValidacionError("PRECIO_COMPRA_FUERA_DE_RANGO");
    }
  }
}
