import { apiDelete, apiGet, apiPatch, apiPost } from "../config/apiClient";
import type { CategoriaGastoFijo, GastoFijo } from "../types/gastoFijo";

export async function fetchGastosFijos(): Promise<GastoFijo[]> {
  return apiGet("/gastos-fijos");
}

export async function fetchGastosFijosActivos(): Promise<GastoFijo[]> {
  return apiGet("/gastos-fijos?activos=true");
}

export function sumaMontosActivos(rows: GastoFijo[]): number {
  return rows
    .filter((r) => r.activo)
    .reduce((s, r) => s + Number(r.monto ?? 0), 0);
}

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
  await apiPost("/gastos-fijos", {
    concepto: payload.concepto.trim(),
    monto: payload.monto,
    categoria: payload.categoria,
    dia_vencimiento: payload.dia_vencimiento,
    activo: payload.activo ?? true
  });
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
  await apiPatch(`/gastos-fijos/${id}`, patch);
}

export async function deleteGastoFijo(id: string): Promise<void> {
  await apiDelete(`/gastos-fijos/${id}`);
}
