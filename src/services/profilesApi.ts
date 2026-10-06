import { apiGet } from "../config/apiClient";
import type { ProfileRow } from "../types/profile";

export function comisionPctEfectivo(
  profile: ProfileRow | null | undefined
): number {
  if (!profile || profile.role !== "vendedor") return 0;
  return Number(profile.comision_pct ?? 10);
}

export function etiquetaVendedorOpcion(v: ProfileRow): string {
  const base = v.full_name || v.id.slice(0, 8);
  const pct = comisionPctEfectivo(v);
  if (pct > 0) return `${base} · ${pct}% comisión`;
  return `${base} · sin comisión (socio)`;
}

export function nombreVendedorSocio(v: ProfileRow): string {
  const n = v.full_name?.trim();
  if (n) return n;
  return "Socio";
}

export async function fetchVendedoresDisponibles(): Promise<ProfileRow[]> {
  return apiGet("/profiles/vendedores");
}

export async function fetchProfileById(
  id: string
): Promise<ProfileRow | null> {
  return apiGet(`/profiles/${id}`);
}
