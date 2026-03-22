import { sb } from "../config/supabase";
import type {
  PlantillaWhatsapp,
  PlantillaWhatsappInput
} from "../types/whatsapp";
import type { ConfigCosto } from "../types/precio";

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

export const whatsappApi = {
  async fetchPlantillasByEstado(
    estadoDestino: string
  ): Promise<PlantillaWhatsapp[]> {
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

  /** Todas las plantillas (gestión: admin u operador) */
  async fetchAllPlantillas(): Promise<PlantillaWhatsapp[]> {
    const { data, error } = await sb
      .from("plantillas_whatsapp")
      .select("*")
      .order("estado_destino")
      .order("orden", { ascending: true });

    if (error) throw error;
    return (data ?? []) as PlantillaWhatsapp[];
  },

  async createPlantilla(
    input: PlantillaWhatsappInput
  ): Promise<PlantillaWhatsapp> {
    const updatedBy = await getCurrentUserId();
    const { data, error } = await sb
      .from("plantillas_whatsapp")
      .insert({
        estado_destino: input.estado_destino,
        nombre: input.nombre,
        cuerpo: input.cuerpo,
        incluir_datos_pago: input.incluir_datos_pago,
        activo: input.activo,
        orden: input.orden,
        updated_by: updatedBy
      })
      .select()
      .single();

    if (error) throw error;
    return data as PlantillaWhatsapp;
  },

  async updatePlantilla(
    id: string,
    input: Partial<PlantillaWhatsappInput>
  ): Promise<PlantillaWhatsapp> {
    const updatedBy = await getCurrentUserId();
    const { data, error } = await sb
      .from("plantillas_whatsapp")
      .update({
        ...input,
        updated_by: updatedBy,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as PlantillaWhatsapp;
  },

  async deletePlantilla(id: string): Promise<void> {
    const { error } = await sb
      .from("plantillas_whatsapp")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },

  /** Cambiar orden de una plantilla (intercambia con la que tiene el orden dado) */
  async updateOrdenPlantilla(id: string, nuevoOrden: number): Promise<void> {
    await this.updatePlantilla(id, { orden: nuevoOrden });
  },

  async fetchDatosPago(): Promise<ConfigCosto[]> {
    const { data, error } = await sb
      .from("config_costos")
      .select("*")
      .like("key", "pago_%")
      .order("key");

    if (error) throw error;
    return (data ?? []) as ConfigCosto[];
  },

  /**
   * Registra en el log que se abrió WhatsApp con este mensaje (opcional, para no repetir envíos).
   */
  async logMensajeEnviado(
    pedidoId: string,
    plantillaId: string | null,
    cuerpoTexto: string
  ): Promise<void> {
    const enviadoPor = await getCurrentUserId();
    const { error } = await sb.from("mensajes_whatsapp_log").insert({
      pedido_id: pedidoId,
      plantilla_id: plantillaId,
      cuerpo_texto: cuerpoTexto,
      enviado_por: enviadoPor
    });
    if (error) throw error;
  }
};
