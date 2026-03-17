// Entornos: 'DEV' o 'PROD'
const ENV = "DEV";

const CONFIG = {
  DEV: {
    url: "https://aeplxckjiuwxmmoegiyp.supabase.co",
    key: "sb_publishable_o6Mwjoa0GsdY5PVsFlOGmw_5JpvZ4Pi"
  },
  PROD: {
    url: "https://ktzfrywxbywingbulhmj.supabase.co",
    key: "sb_publishable_W_u8vnyNnKiBa4-85autvg_M-NPo4kA"
  }
};

export const SB_URL = CONFIG[ENV].url;
export const SB_KEY = CONFIG[ENV].key;
export const ADMIN_PASS = "monica2026";

export const sb = supabase.createClient(SB_URL, SB_KEY);

export const descConfig = {
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
