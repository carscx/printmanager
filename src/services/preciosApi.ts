import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../config/apiClient";
import {
  CONFIG_COSTO_DESCRIPCIONES,
  mergeConfigCostosRows,
  type PerfilTintaImpresion,
  type PrecioImpresion,
  type PrecioAnillado,
  type PrecioAnilladoInput,
  type ConfigCosto
} from "../types/precio";
import type { ConfiguracionNegocio } from "../types/configuracionNegocio";
import { normalizarFilaPrecioImpresion } from "./preciosNormalize";

export { normalizarFilaPrecioImpresion } from "./preciosNormalize";

export const preciosApi = {
  async fetchConfiguracionNegocio(): Promise<ConfiguracionNegocio> {
    return apiGet("/configuracion-negocio");
  },

  async updateConfiguracionNegocio(
    patch: Partial<ConfiguracionNegocio>
  ): Promise<ConfiguracionNegocio> {
    return apiPatch("/configuracion-negocio", patch);
  },

  async fetchPreciosImpresion(soloActivos = true): Promise<PrecioImpresion[]> {
    const rows = await apiGet<unknown[]>(
      `/precios-impresion?soloActivos=${soloActivos}`
    );
    return rows.map((r) => normalizarFilaPrecioImpresion(r));
  },

  async actualizarPrecioImpresion(
    id: string,
    precio_venta: number
  ): Promise<void> {
    await apiPatch(`/precios-impresion/${id}`, { precio_venta });
  },

  async crearPrecioImpresion(input: {
    tipo: PrecioImpresion["tipo"];
    doble_faz: boolean;
    precio_venta: number;
    activo?: boolean;
    nombre?: string | null;
    perfil_tinta: PerfilTintaImpresion;
  }): Promise<PrecioImpresion> {
    const existentes = await this.fetchPreciosImpresion(true);
    const conflict = existentes.find(
      (p) => p.tipo === input.tipo && p.doble_faz === input.doble_faz && p.activo
    );
    let activo = input.activo !== false;
    if (conflict && activo) activo = false;
    const payload: Record<string, unknown> = {
      tipo: input.tipo,
      doble_faz: input.doble_faz,
      precio_venta: input.precio_venta,
      perfil_tinta: input.perfil_tinta,
      activo
    };
    if (input.nombre != null && String(input.nombre).trim() !== "") {
      payload.nombre = String(input.nombre).trim();
    }
    const row = await apiPost("/precios-impresion", payload);
    return normalizarFilaPrecioImpresion(row);
  },

  async actualizarPrecioImpresionCompleto(
    id: string,
    patch: Partial<
      Pick<
        PrecioImpresion,
        "precio_venta" | "activo" | "equipo_id" | "perfil_tinta"
      >
    >
  ): Promise<void> {
    await apiPatch(`/precios-impresion/${id}`, patch);
  },

  async eliminarPrecioImpresion(id: string): Promise<void> {
    await apiDelete(`/precios-impresion/${id}`);
  },

  async toggleImpresionActivo(id: string, activo: boolean): Promise<void> {
    if (activo) {
      const all = await this.fetchPreciosImpresion(false);
      const row = all.find((p) => p.id === id);
      if (row) {
        const other = all.find(
          (p) =>
            p.id !== id &&
            p.activo &&
            p.tipo === row.tipo &&
            p.doble_faz === row.doble_faz
        );
        if (other) {
          throw new Error(
            "Ya hay otra tarifa activa para esta combinación. Desactivala primero."
          );
        }
      }
    }
    await apiPatch(`/precios-impresion/${id}`, { activo });
  },

  async ajustarPreciosImpresionPorcentaje(porcentaje: number): Promise<void> {
    const precios = await this.fetchPreciosImpresion(true);
    const factor = 1 + porcentaje / 100;
    for (const p of precios) {
      await this.actualizarPrecioImpresion(
        p.id,
        Math.round(p.precio_venta * factor)
      );
    }
  },

  async fetchPreciosAnillado(soloActivos = true): Promise<PrecioAnillado[]> {
    const rows = await apiGet<PrecioAnillado[]>(
      `/precios-anillado?soloActivos=${soloActivos}`
    );
    return rows.map((row) => ({
      ...row,
      nombre_categoria: row.nombre_categoria ?? "Mediano"
    }));
  },

  async crearPrecioAnillado(
    input: PrecioAnilladoInput & { activo?: boolean }
  ): Promise<PrecioAnillado> {
    return apiPost("/precios-anillado", {
      nombre_categoria: input.nombre_categoria,
      medida_mm: Math.round(input.medida_mm),
      paginas_max:
        input.paginas_max == null || Number.isNaN(input.paginas_max)
          ? null
          : Math.round(input.paginas_max),
      precio_venta: input.precio_venta,
      activo: input.activo !== false
    });
  },

  async actualizarPrecioAnillado(
    id: string,
    precio_venta: number
  ): Promise<void> {
    await apiPatch(`/precios-anillado/${id}`, { precio_venta });
  },

  async actualizarPrecioAnilladoCompleto(
    id: string,
    patch: Partial<
      Pick<
        PrecioAnillado,
        | "nombre_categoria"
        | "medida_mm"
        | "paginas_max"
        | "precio_venta"
        | "activo"
      >
    >
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.nombre_categoria !== undefined)
      row.nombre_categoria = patch.nombre_categoria;
    if (patch.medida_mm !== undefined)
      row.medida_mm = Math.round(patch.medida_mm);
    if (patch.paginas_max !== undefined) {
      row.paginas_max =
        patch.paginas_max == null ? null : Math.round(patch.paginas_max);
    }
    if (patch.precio_venta !== undefined) row.precio_venta = patch.precio_venta;
    if (patch.activo !== undefined) row.activo = patch.activo;
    await apiPatch(`/precios-anillado/${id}`, row);
  },

  async eliminarPrecioAnillado(id: string): Promise<void> {
    await apiDelete(`/precios-anillado/${id}`);
  },

  async toggleAnilladoActivo(id: string, activo: boolean): Promise<void> {
    await apiPatch(`/precios-anillado/${id}`, { activo });
  },

  async ajustarPreciosAnilladoPorcentaje(porcentaje: number): Promise<void> {
    const precios = await this.fetchPreciosAnillado(true);
    const factor = 1 + porcentaje / 100;
    for (const p of precios) {
      await this.actualizarPrecioAnillado(
        p.id,
        Math.round(p.precio_venta * factor)
      );
    }
  },

  async fetchConfigCostos(): Promise<ConfigCosto[]> {
    const data = await apiGet<ConfigCosto[]>("/config-costos");
    return mergeConfigCostosRows(data ?? []);
  },

  async actualizarConfigCosto(key: string, value: string): Promise<void> {
    await apiPut("/config-costos", {
      rows: [
        {
          key,
          value,
          descripcion: CONFIG_COSTO_DESCRIPCIONES[key] ?? null
        }
      ]
    });
  }
};
