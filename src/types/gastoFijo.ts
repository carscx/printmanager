export type CategoriaGastoFijo =
  | "impuestos"
  | "servicios"
  | "amortizacion"
  | "sueldo_personal";

export interface GastoFijo {
  id: string;
  concepto: string;
  monto: number;
  categoria: CategoriaGastoFijo;
  dia_vencimiento: number | null;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export const CATEGORIA_GASTO_LABEL: Record<CategoriaGastoFijo, string> = {
  impuestos: "Impuestos",
  servicios: "Servicios",
  amortizacion: "Amortización",
  sueldo_personal: "Sueldo personal"
};
