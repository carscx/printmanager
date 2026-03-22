import { sb } from "../config/supabase";
import type { Equipo, EquipoInput } from "../types/equipo";

export const equiposApi = {
  async fetchAll(soloActivos = true): Promise<Equipo[]> {
    let query = sb.from("equipos").select("*").order("nombre");
    if (soloActivos) query = query.eq("activo", true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Equipo[];
  },

  async crear(input: EquipoInput): Promise<Equipo> {
    const { data, error } = await sb
      .from("equipos")
      .insert([input])
      .select()
      .single();
    if (error) throw error;
    return data as Equipo;
  },

  async actualizar(id: string, input: Partial<EquipoInput>): Promise<Equipo> {
    const { data, error } = await sb
      .from("equipos")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Equipo;
  },

  async toggleActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await sb.from("equipos").update({ activo }).eq("id", id);
    if (error) throw error;
  }
};
