import type { Insumo } from "../types/insumo";
import type { ConfigCosto } from "../types/precio";
import {
  numeroConfigCosto,
  PLASTIFICADO_COSTO_POUCH_DEFAULT,
  PLASTIFICADO_COSTO_POUCH_KEY,
  PLASTIFICADO_PRECIO_VENTA_DEFAULT,
  PLASTIFICADO_PRECIO_VENTA_KEY
} from "../types/precio";
import { costoUnitarioInsumo } from "../services/bomCosto";

/** Pouch que consume el BOM: el activo más antiguo. */
export function pouchActivo(insumos: Insumo[]): Insumo | null {
  const list = insumos
    .filter((i) => i.categoria === "pouch" && i.activo)
    .sort(
      (a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.id.localeCompare(b.id)
    );
  return list[0] ?? null;
}

export function precioVentaPlastificado(config: ConfigCosto[]): number {
  return numeroConfigCosto(
    config,
    PLASTIFICADO_PRECIO_VENTA_KEY,
    PLASTIFICADO_PRECIO_VENTA_DEFAULT
  );
}

/** Costo de un pouch: el del insumo, o el de configuración si todavía no tiene precio. */
export function costoPouchEfectivo(
  insumos: Insumo[],
  config: ConfigCosto[]
): number {
  const pouch = pouchActivo(insumos);
  const desdeInsumo = pouch ? costoUnitarioInsumo(pouch) : 0;
  if (desdeInsumo > 0) return desdeInsumo;
  return numeroConfigCosto(
    config,
    PLASTIFICADO_COSTO_POUCH_KEY,
    PLASTIFICADO_COSTO_POUCH_DEFAULT
  );
}

/** Entero ≥ 1, o null si el campo está vacío o no es válido. */
export function parseUnidadesPlastificado(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 1 || Math.floor(n) !== n) return null;
  return n;
}

export function etiquetaPlastificado(
  unidades: number | null | undefined
): string | null {
  const n = Number(unidades ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `Plastificado x${Math.trunc(n)}`;
}
