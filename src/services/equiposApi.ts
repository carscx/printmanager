import { apiGet, apiPatch, apiPost } from "../config/apiClient";
import type { Equipo, EquipoInput } from "../types/equipo";

export interface EquipoResumenRoi {
  equipo_id: string;
  equipo_nombre: string;
  costo_adquisicion: number;
  ganancia_acumulada: number;
  ratio_recuperacion_pct: number | null;
}

export const equiposApi = {
  async fetchAll(soloActivos = true): Promise<Equipo[]> {
    return apiGet(`/equipos?soloActivos=${soloActivos}`);
  },

  async crear(input: EquipoInput): Promise<Equipo> {
    return apiPost("/equipos", input);
  },

  async actualizar(id: string, input: Partial<EquipoInput>): Promise<Equipo> {
    return apiPatch(`/equipos/${id}`, input);
  },

  async toggleActivo(id: string, activo: boolean): Promise<void> {
    await apiPost(`/equipos/${id}/activo`, { activo });
  },

  async fetchResumenRoi(): Promise<EquipoResumenRoi[]> {
    return apiGet("/equipos/roi");
  }
};
