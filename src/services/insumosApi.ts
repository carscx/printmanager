import { apiDelete, apiGet, apiPatch, apiPost } from "../config/apiClient";
import type {
  Insumo,
  InsumoInput,
  StockMovimiento,
  InsumoPrecioLog,
  InsumoCategoria,
  StockTipo,
  StockMotivo
} from "../types/insumo";
import type { ProductoTarifaAfectada } from "../types/insumoAfectado";
import type { AlcanceReceta } from "../types/receta";
import type { ConfiguracionNegocio } from "../types/configuracionNegocio";
import { labelSlugLineaImpresion } from "../types/precio";
import { fnCostoTotalRealInsumos } from "./bomPreview";
import {
  validarInsumoStockYPrecio,
  InsumoValidacionError
} from "../utils/insumoValidacion";

export const insumosApi = {
  async fetchAll(soloActivos = true): Promise<Insumo[]> {
    return apiGet(`/insumos?soloActivos=${soloActivos}`);
  },

  async fetchByCategoria(categoria: InsumoCategoria): Promise<Insumo[]> {
    return apiGet(`/insumos?categoria=${encodeURIComponent(categoria)}`);
  },

  async fetchById(id: string): Promise<Insumo> {
    return apiGet(`/insumos/${id}`);
  },

  async crear(input: InsumoInput): Promise<Insumo> {
    try {
      validarInsumoStockYPrecio(input);
    } catch (e) {
      if (e instanceof InsumoValidacionError) throw e;
      throw e;
    }
    return apiPost("/insumos", input);
  },

  async actualizar(id: string, input: Partial<InsumoInput>): Promise<Insumo> {
    let categoriaResuelta: InsumoCategoria | undefined;
    if (
      input.stock_actual != null ||
      input.stock_minimo != null ||
      input.precio_compra != null ||
      input.costo_compra != null ||
      input.costo_base != null
    ) {
      if (input.categoria == null) {
        const row = await this.fetchById(id);
        categoriaResuelta = row.categoria;
      }
    }
    try {
      validarInsumoStockYPrecio(input, categoriaResuelta);
    } catch (e) {
      if (e instanceof InsumoValidacionError) throw e;
      throw e;
    }
    return apiPatch(`/insumos/${id}`, input);
  },

  async rpcDeleteInsumoFisico(id: string): Promise<void> {
    await apiDelete(`/insumos/${id}`);
  },

  async countUsoEnPedidos(insumoId: string): Promise<number> {
    const r = await apiGet<{ count: number }>(`/insumos/${insumoId}/uso-pedidos`);
    return r.count ?? 0;
  },

  async fetchProductosTarifaAfectados(
    insumoId: string,
    config: ConfiguracionNegocio
  ): Promise<ProductoTarifaAfectada[]> {
    const rawRows = await apiGet<Record<string, unknown>[]>(
      `/insumos/${insumoId}/tarifas-afectadas`
    );
    const out: ProductoTarifaAfectada[] = [];
    for (const r of rawRows) {
      const alcance = String(r.alcance ?? "");
      const hasPi = r.pi_id != null;
      if (alcance !== "IMPRESION" || !hasPi) {
        const etiqueta =
          alcance === "IMPRESION"
            ? "Impresión (sin tarifa)"
            : alcance === "SOLO_ANILLADO"
              ? "Anillado solo (legacy)"
              : "Anillado extra (legacy)";
        out.push({
          receta_id: String(r.id),
          alcance: alcance as AlcanceReceta,
          etiqueta,
          precio_venta: 0,
          costo_directo_tarifa: null,
          costo_real: 0,
          margen_pct: null
        });
        continue;
      }
      const pv = Number(r.precio_venta) || 0;
      const cd =
        r.costo_insumo_directo != null
          ? Number(r.costo_insumo_directo)
          : null;
      const costoReal =
        cd != null && Number.isFinite(cd)
          ? fnCostoTotalRealInsumos(cd, config)
          : 0;
      const margenPct =
        pv > 0 && cd != null
          ? Math.round(((pv - costoReal) / pv) * 1000) / 10
          : null;
      const tipo = labelSlugLineaImpresion(String(r.tipo ?? ""));
      const df = r.doble_faz ? "DF" : "SF";
      out.push({
        receta_id: String(r.id),
        alcance: "IMPRESION",
        etiqueta: `${tipo} ${df} · tarifa`,
        precio_venta: pv,
        costo_directo_tarifa: cd,
        costo_real: costoReal,
        margen_pct: margenPct
      });
    }
    return out;
  },

  async desactivar(id: string): Promise<void> {
    await apiPost(`/insumos/${id}/desactivar`);
  },

  async activar(id: string): Promise<void> {
    await apiPost(`/insumos/${id}/activar`);
  },

  async registrarMovimiento(params: {
    insumo_id: string;
    tipo: StockTipo;
    cantidad: number;
    motivo: StockMotivo;
    referencia_pedido_id?: string;
    notas?: string;
    precioCompraBulto?: number;
  }): Promise<void> {
    await apiPost(`/insumos/${params.insumo_id}/movimientos`, {
      tipo: params.tipo,
      cantidad: params.cantidad,
      motivo: params.motivo,
      referencia_pedido_id: params.referencia_pedido_id,
      notas: params.notas,
      precioCompraBulto: params.precioCompraBulto
    });
  },

  async fetchMovimientos(
    insumoId: string,
    limit = 50
  ): Promise<StockMovimiento[]> {
    return apiGet(`/insumos/${insumoId}/movimientos?limit=${limit}`);
  },

  async fetchPreciosLog(
    insumoId: string,
    limit = 20
  ): Promise<InsumoPrecioLog[]> {
    return apiGet(`/insumos/${insumoId}/precios-log?limit=${limit}`);
  },

  async fetchSubidasPrecioFuertes(
    minPct = 15,
    diasAtras = 45
  ): Promise<
    {
      insumo_id: string;
      nombre: string;
      anterior: number;
      nuevo: number;
      pct: number;
      changed_at: string;
    }[]
  > {
    const insumos = await this.fetchAll(false);
    const byId = new Map(insumos.map((i) => [i.id, i.nombre]));
    const out: {
      insumo_id: string;
      nombre: string;
      anterior: number;
      nuevo: number;
      pct: number;
      changed_at: string;
    }[] = [];
    const desde = new Date();
    desde.setDate(desde.getDate() - diasAtras);
    for (const ins of insumos) {
      const logs = await this.fetchPreciosLog(ins.id, 50);
      for (const log of logs) {
        if (new Date(log.changed_at) < desde) continue;
        const ant = Number(log.precio_anterior);
        const neu = Number(log.precio_nuevo);
        if (!ant || ant <= 0) continue;
        const pct = ((neu - ant) / ant) * 100;
        if (pct >= minPct) {
          out.push({
            insumo_id: ins.id,
            nombre: byId.get(ins.id) ?? ins.nombre,
            anterior: ant,
            nuevo: neu,
            pct,
            changed_at: log.changed_at
          });
        }
      }
    }
    return out.sort(
      (a, b) =>
        new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
    );
  },

  async fetchAlertasStock(): Promise<Insumo[]> {
    return apiGet("/insumos/alertas-stock");
  },

  async fetchStockBajo(): Promise<Insumo[]> {
    try {
      return await this.fetchAlertasStock();
    } catch {
      const all = await this.fetchAll(true);
      return all.filter(
        (i) => Number(i.stock_actual) <= Number(i.stock_minimo)
      );
    }
  },

  async fetchReglasImpactoResumen(): Promise<
    Record<string, { lineas: number; tarifas: number }>
  > {
    const [impresion, anillado] = await Promise.all([
      apiGet<
        {
          insumo_id: string | null;
          precio_impresion_id: string | null;
          precio_anillado_id: string | null;
        }[]
      >("/reglas-costo?todas=impresion"),
      apiGet<
        {
          insumo_id: string | null;
          precio_impresion_id: string | null;
          precio_anillado_id: string | null;
        }[]
      >("/reglas-costo?todas=anillado")
    ]);
    const acc = new Map<string, { lineas: number; tarifas: Set<string> }>();
    for (const row of [...impresion, ...anillado]) {
      const id = row.insumo_id;
      const tarifaKey = row.precio_impresion_id ?? row.precio_anillado_id;
      if (!id || !tarifaKey) continue;
      if (!acc.has(id)) acc.set(id, { lineas: 0, tarifas: new Set() });
      const a = acc.get(id)!;
      a.lineas++;
      a.tarifas.add(tarifaKey);
    }
    const out: Record<string, { lineas: number; tarifas: number }> = {};
    for (const [k, v] of acc) {
      out[k] = { lineas: v.lineas, tarifas: v.tarifas.size };
    }
    return out;
  }
};
