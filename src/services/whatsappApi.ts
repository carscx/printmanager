import { apiDelete, apiGet, apiPatch, apiPost } from "../config/apiClient";
import type {
  PlantillaWhatsapp,
  PlantillaWhatsappInput
} from "../types/whatsapp";
import {
  CONFIG_COSTO_DESCRIPCIONES,
  type ConfigCosto
} from "../types/precio";

const PAGO_CONFIG_KEYS = [
  "pago_alias",
  "pago_cbu",
  "pago_titular",
  "pago_banco"
] as const;

export const whatsappApi = {
  async fetchPlantillasByEstado(
    estadoDestino: string
  ): Promise<PlantillaWhatsapp[]> {
    return apiGet(
      `/whatsapp/plantillas?estado=${encodeURIComponent((estadoDestino || "").toLowerCase())}`
    );
  },

  async fetchAllPlantillas(): Promise<PlantillaWhatsapp[]> {
    return apiGet("/whatsapp/plantillas");
  },

  async createPlantilla(
    input: PlantillaWhatsappInput
  ): Promise<PlantillaWhatsapp> {
    return apiPost("/whatsapp/plantillas", {
      estado_destino: input.estado_destino,
      nombre: input.nombre,
      cuerpo: input.cuerpo,
      incluir_datos_pago: input.incluir_datos_pago,
      activo: input.activo,
      orden: input.orden ?? 0,
      match_criterio: input.match_criterio ?? "any"
    });
  },

  async updatePlantilla(
    id: string,
    input: Partial<PlantillaWhatsappInput>
  ): Promise<PlantillaWhatsapp> {
    return apiPatch(`/whatsapp/plantillas/${id}`, input);
  },

  async deletePlantilla(id: string): Promise<void> {
    await apiDelete(`/whatsapp/plantillas/${id}`);
  },

  async updateOrdenPlantilla(id: string, nuevoOrden: number): Promise<void> {
    await this.updatePlantilla(id, { orden: nuevoOrden });
  },

  async fetchDatosPago(): Promise<ConfigCosto[]> {
    const fetched = await apiGet<ConfigCosto[]>("/whatsapp/datos-pago");
    const byKey = new Map(fetched.map((c) => [c.key, c]));
    return PAGO_CONFIG_KEYS.map((key) => {
      const existing = byKey.get(key);
      if (existing) return existing;
      return {
        key,
        value: "",
        descripcion: CONFIG_COSTO_DESCRIPCIONES[key] ?? null,
        updated_at: "",
        updated_by: null
      };
    });
  },

  async logMensajeEnviado(
    pedidoId: string,
    plantillaId: string | null,
    cuerpoTexto: string
  ): Promise<void> {
    await apiPost("/whatsapp/log", { pedidoId, plantillaId, cuerpoTexto });
  }
};
