import type { PerfilTintaImpresion, PrecioImpresion } from "../types/precio";

export function normalizarFilaPrecioImpresion(raw: unknown): PrecioImpresion {
  const r = raw as Record<string, unknown>;
  const tipo = String(r.tipo ?? "").trim() || "bn";
  const pv = Number(r.precio_venta);
  const perfil: PerfilTintaImpresion =
    r.perfil_tinta === "bn" || r.perfil_tinta === "color"
      ? r.perfil_tinta
      : tipo === "bn"
        ? "bn"
        : "color";
  return {
    id: String(r.id ?? ""),
    tipo,
    doble_faz: Boolean(r.doble_faz),
    nombre:
      r.nombre != null && String(r.nombre).trim() !== ""
        ? String(r.nombre)
        : null,
    perfil_tinta: perfil,
    equipo_id: r.equipo_id != null ? String(r.equipo_id) : null,
    precio_venta: Number.isFinite(pv) ? pv : 0,
    costo_insumo_directo:
      r.costo_insumo_directo != null &&
      Number.isFinite(Number(r.costo_insumo_directo))
        ? Number(r.costo_insumo_directo)
        : null,
    activo: r.activo !== false,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
    updated_by: r.updated_by != null ? String(r.updated_by) : null
  };
}
