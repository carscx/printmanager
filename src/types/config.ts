export interface AppConfig {
  t_bn_s: string;
  t_bn_d: string;
  t_col_s: string;
  t_col_d: string;
  esp_s: string;
  esp_m: string;
  esp_l: string;
  markup: string;
  comision_sobrina: string;
  pago_alias: string;
  [key: string]: string;
}

export const CONFIG_LABELS: Record<string, string> = {
  t_bn_s: "B&N Simple Faz ($)",
  t_bn_d: "B&N Doble Faz ($)",
  t_col_s: "Color Simple Faz ($)",
  t_col_d: "Color Doble Faz ($)",
  esp_s: "Anillado Chico ($)",
  esp_m: "Anillado Mediano ($)",
  esp_l: "Anillado Grande ($)",
  markup: "Divisor Ganancia (1.6)",
  comision_sobrina: "% Comisión Avru",
  pago_alias: "Alias Pago"
};

export const DEFAULT_CONFIG: AppConfig = {
  t_bn_s: "35",
  t_bn_d: "55",
  t_col_s: "70",
  t_col_d: "110",
  esp_s: "700",
  esp_m: "1000",
  esp_l: "1400",
  markup: "1.6",
  comision_sobrina: "10",
  pago_alias: ""
};
