import { sb } from "../config/supabase";
import type { CategoriaGastoFijo, GastoFijo } from "../types/gastoFijo";

export async function fetchGastosFijos(): Promise<GastoFijo[]> {
  const { data, error } = await sb
    .from("gastos_fijos")
    .select("*")
    .order("categoria", { ascending: true })
    .order("concepto", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GastoFijo[];
}

export async function fetchGastosFijosActivos(): Promise<GastoFijo[]> {
  const { data, error } = await sb
    .from("gastos_fijos")
    .select("*")
    .eq("activo", true)
    .order("concepto", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GastoFijo[];
}

export function sumaMontosActivos(rows: GastoFijo[]): number {
  return rows
    .filter((r) => r.activo)
    .reduce((s, r) => s + Number(r.monto ?? 0), 0);
}

/** Suma categorías amortización + sueldo (retiro sugerido). */
export function sumaRetiroCategorias(rows: GastoFijo[]): number {
  return rows
    .filter(
      (r) =>
        r.activo &&
        (r.categoria === "amortizacion" || r.categoria === "sueldo_personal")
    )
    .reduce((s, r) => s + Number(r.monto ?? 0), 0);
}

export async function insertGastoFijo(payload: {
  concepto: string;
  monto: number;
  categoria: CategoriaGastoFijo;
  dia_vencimiento: number | null;
  activo?: boolean;
}): Promise<void> {
  const { error } = await sb.from("gastos_fijos").insert({
    concepto: payload.concepto.trim(),
    monto: payload.monto,
    categoria: payload.categoria,
    dia_vencimiento: payload.dia_vencimiento,
    activo: payload.activo ?? true
  });
  if (error) throw error;
}

export async function updateGastoFijo(
  id: string,
  patch: Partial<
    Pick<
      GastoFijo,
      "concepto" | "monto" | "categoria" | "dia_vencimiento" | "activo"
    >
  >
): Promise<void> {
  const { error } = await sb
    .from("gastos_fijos")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGastoFijo(id: string): Promise<void> {
  const { error } = await sb.from("gastos_fijos").delete().eq("id", id);
  if (error) throw error;
}
