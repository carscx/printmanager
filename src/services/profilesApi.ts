import { sb } from "../config/supabase";
import type { ProfileRow } from "../types/profile";

/**
 * % de comisión que aplica al total del pedido. Solo rol `vendedor` (externos);
 * admin/operador/socios → 0 (coherente con trigger en BD).
 */
export function comisionPctEfectivo(
  profile: ProfileRow | null | undefined
): number {
  if (!profile || profile.role !== "vendedor") return 0;
  return Number(profile.comision_pct ?? 10);
}

/** Texto en selects: vendedores externos muestran %; socios/admin sin comisión. */
export function etiquetaVendedorOpcion(v: ProfileRow): string {
  const base = v.full_name || v.id.slice(0, 8);
  const pct = comisionPctEfectivo(v);
  if (pct > 0) return `${base} · ${pct}% comisión`;
  return `${base} · sin comisión (socio)`;
}

/** Nombre legible en combos de pedido (sin sufijos de comisión). */
export function nombreVendedorSocio(v: ProfileRow): string {
  const n = v.full_name?.trim();
  if (n) return n;
  return "Socio";
}

/** Perfiles asignables como responsable de venta (incluye admin/socios para $0 comisión). */
export async function fetchVendedoresDisponibles(): Promise<ProfileRow[]> {
  const { data, error } = await sb
    .from("profiles")
    .select("id, role, full_name, comision_pct")
    .in("role", ["admin", "operador", "vendedor"])
    .order("full_name", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

/** Un perfil por id (p. ej. usuario logueado o vendedor del pedido en edición). */
export async function fetchProfileById(
  id: string
): Promise<ProfileRow | null> {
  const { data, error } = await sb
    .from("profiles")
    .select("id, role, full_name, comision_pct")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ProfileRow) ?? null;
}
