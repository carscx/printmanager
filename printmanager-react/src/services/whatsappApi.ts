import { sb } from "../config/supabase";
import type { PlantillaWhatsapp } from "../types/whatsapp";
import type { ConfigCosto } from "../types/precio";

export const whatsappApi = {
  async fetchPlantillasByEstado(
    estadoDestino: string
  ): Promise<PlantillaWhatsapp[]> {
    // Normalizar a minúsculas para evitar problemas de case
    const estado = (estadoDestino || "").toLowerCase();
    const { data, error } = await sb
      .from("plantillas_whatsapp")
      .select("*")
      .eq("estado_destino", estado)
      .eq("activo", true)
      .order("orden", { ascending: true });

    if (error) throw error;
    return (data ?? []) as PlantillaWhatsapp[];
  },

  async fetchDatosPago(): Promise<ConfigCosto[]> {
    const { data, error } = await sb
      .from("config_costos")
      .select("*")
      .like("key", "pago_%")
      .order("key");

    if (error) throw error;
    return (data ?? []) as ConfigCosto[];
  }
};
