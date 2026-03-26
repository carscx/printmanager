import { sb } from "../config/supabase";
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
  // ── INSUMOS CRUD ──────────────────────────

  async fetchAll(soloActivos = true): Promise<Insumo[]> {
    let query = sb
      .from("insumos")
      .select("*")
      .order("categoria")
      .order("nombre");
    if (soloActivos) query = query.eq("activo", true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Insumo[];
  },

  async fetchByCategoria(categoria: InsumoCategoria): Promise<Insumo[]> {
    const { data, error } = await sb
      .from("insumos")
      .select("*")
      .eq("categoria", categoria)
      .eq("activo", true)
      .order("nombre");
    if (error) throw error;
    return (data ?? []) as Insumo[];
  },

  async fetchById(id: string): Promise<Insumo> {
    const { data, error } = await sb
      .from("insumos")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as Insumo;
  },

  async crear(input: InsumoInput): Promise<Insumo> {
    try {
      validarInsumoStockYPrecio(input);
    } catch (e) {
      if (e instanceof InsumoValidacionError) throw e;
      throw e;
    }
    const { data, error } = await sb
      .from("insumos")
      .insert([input])
      .select()
      .single();
    if (error) throw error;
    return data as Insumo;
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
        const { data: row, error: e2 } = await sb
          .from("insumos")
          .select("categoria")
          .eq("id", id)
          .single();
        if (e2) throw e2;
        categoriaResuelta = (row as { categoria: InsumoCategoria }).categoria;
      }
    }
    try {
      validarInsumoStockYPrecio(input, categoriaResuelta);
    } catch (e) {
      if (e instanceof InsumoValidacionError) throw e;
      throw e;
    }
    const { data, error } = await sb
      .from("insumos")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Insumo;
  },

  /** Borrado físico vía RPC; FKs en cascada / SET NULL (ver migración reglas de negocio). */
  async rpcDeleteInsumoFisico(id: string): Promise<void> {
    const { error } = await sb.rpc("rpc_delete_insumo_fisico", {
      p_insumo_id: id
    });
    if (error) throw error;
  },

  /**
   * Cuenta de uso en pedidos (consumos congelados) para referencia en UI.
   */
  async countUsoEnPedidos(insumoId: string): Promise<number> {
    const { count, error } = await sb
      .from("pedido_items_insumos")
      .select("id", { count: "exact", head: true })
      .eq("insumo_id", insumoId);
    if (error) throw error;
    return count ?? 0;
  },

  /**
   * Líneas legacy vinculadas al insumo + tarifa de impresión (vista margen aprox.).
   * Requiere `config` para costo “real” (desperdicio + mantenimiento).
   */
  async fetchProductosTarifaAfectados(
    insumoId: string,
    config: ConfiguracionNegocio
  ): Promise<ProductoTarifaAfectada[]> {
    const { data, error } = await sb
      .from("recetas_items")
      .select(
        `
        id,
        alcance,
        cantidad,
        modo_consumo,
        costo_unitario_reposicion,
        precio_impresion_id,
        precios_impresion (
          id,
          tipo,
          doble_faz,
          precio_venta,
          costo_insumo_directo
        )
      `
      )
      .eq("insumo_id", insumoId)
      .eq("es_espiral_auto", false);
    if (error) throw error;
    const rawRows = (data ?? []) as Record<string, unknown>[];
    const out: ProductoTarifaAfectada[] = [];

    for (const r of rawRows) {
      const piRaw = r.precios_impresion;
      const piJoined = Array.isArray(piRaw) ? piRaw[0] : piRaw;
      const pi = piJoined as {
        tipo: string;
        doble_faz: boolean;
        precio_venta: number;
        costo_insumo_directo: number | null;
      } | null;

      const alcance = String(r.alcance ?? "");

      if (alcance !== "IMPRESION" || !pi) {
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
      const pv = Number(pi.precio_venta) || 0;
      const cd = pi.costo_insumo_directo != null ? Number(pi.costo_insumo_directo) : null;
      const costoReal =
        cd != null && Number.isFinite(cd)
          ? fnCostoTotalRealInsumos(cd, config)
          : 0;
      const margenPct =
        pv > 0 && cd != null
          ? Math.round(((pv - costoReal) / pv) * 1000) / 10
          : null;
      const tipo = labelSlugLineaImpresion(pi.tipo);
      const df = pi.doble_faz ? "DF" : "SF";
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
    const { error } = await sb
      .from("insumos")
      .update({ activo: false })
      .eq("id", id);
    if (error) throw error;
  },

  async activar(id: string): Promise<void> {
    const { error } = await sb
      .from("insumos")
      .update({ activo: true })
      .eq("id", id);
    if (error) throw error;
  },

  // ── STOCK ─────────────────────────────────

  /**
   * Registra un movimiento de stock y actualiza `stock_actual`.
   * Entrada + motivo compra + `precioCompraBulto`: reemplaza **globalmente**
   * `precio_compra` / `costo_compra` / `costo_base` con ese valor (último costo de
   * reposición; no promedia con compras anteriores). El trigger en BD refresca
   * tarifas y snapshots de recetas.
   */
  async registrarMovimiento(params: {
    insumo_id: string;
    tipo: StockTipo;
    cantidad: number;
    motivo: StockMotivo;
    referencia_pedido_id?: string;
    notas?: string;
    /** Precio del bulto de **esta** compra ($). Solo aplica con entrada + compra. */
    precioCompraBulto?: number;
  }): Promise<void> {
    const { error: movErr } = await sb.from("stock_movimientos").insert([
      {
        insumo_id: params.insumo_id,
        tipo: params.tipo,
        cantidad: params.cantidad,
        motivo: params.motivo,
        referencia_pedido_id: params.referencia_pedido_id || null,
        notas: params.notas || null
      }
    ]);
    if (movErr) throw movErr;

    const { data: insumo, error: fetchErr } = await sb
      .from("insumos")
      .select("stock_actual")
      .eq("id", params.insumo_id)
      .single();
    if (fetchErr) throw fetchErr;

    const nuevoStock = Number(insumo.stock_actual) + params.cantidad;

    const aplicarUltimoCostoReposicion =
      params.tipo === "entrada" &&
      params.motivo === "compra" &&
      params.precioCompraBulto != null &&
      Number.isFinite(params.precioCompraBulto) &&
      params.precioCompraBulto > 0;

    const patch: Record<string, unknown> = { stock_actual: nuevoStock };
    if (aplicarUltimoCostoReposicion) {
      const p = params.precioCompraBulto!;
      patch.precio_compra = p;
      patch.costo_compra = p;
      patch.costo_base = p;
    }

    const { error: updErr } = await sb
      .from("insumos")
      .update(patch)
      .eq("id", params.insumo_id);
    if (updErr) throw updErr;
  },

  // ── MOVIMIENTOS (consulta) ────────────────

  async fetchMovimientos(
    insumoId: string,
    limit = 50
  ): Promise<StockMovimiento[]> {
    const { data, error } = await sb
      .from("stock_movimientos")
      .select("*")
      .eq("insumo_id", insumoId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as StockMovimiento[];
  },

  // ── HISTORIAL DE PRECIOS ──────────────────

  async fetchPreciosLog(
    insumoId: string,
    limit = 20
  ): Promise<InsumoPrecioLog[]> {
    const { data, error } = await sb
      .from("insumos_precios_log")
      .select("*")
      .eq("insumo_id", insumoId)
      .order("changed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as InsumoPrecioLog[];
  },

  // ── ALERTAS ───────────────────────────────

  /**
   * Cambios de precio de compra recientes donde el aumento supera minPct%.
   * Útil para alertas Fase 6 (revisar precios de venta).
   */
  async fetchSubidasPrecioFuertes(
    minPct = 15,
    diasAtras = 45
  ): Promise<
    { insumo_id: string; nombre: string; anterior: number; nuevo: number; pct: number; changed_at: string }[]
  > {
    const desde = new Date();
    desde.setDate(desde.getDate() - diasAtras);
    const { data, error } = await sb
      .from("insumos_precios_log")
      .select("insumo_id, precio_anterior, precio_nuevo, changed_at")
      .gte("changed_at", desde.toISOString())
      .order("changed_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    const out: {
      insumo_id: string;
      nombre: string;
      anterior: number;
      nuevo: number;
      pct: number;
      changed_at: string;
    }[] = [];
    for (const row of data ?? []) {
      const r = row as {
        insumo_id: string;
        precio_anterior: number;
        precio_nuevo: number;
        changed_at: string;
      };
      const ant = Number(r.precio_anterior) || 0;
      const nue = Number(r.precio_nuevo) || 0;
      if (ant <= 0 || nue <= ant) continue;
      const pct = ((nue - ant) / ant) * 100;
      if (pct < minPct) continue;
      out.push({
        insumo_id: r.insumo_id,
        nombre: "",
        anterior: ant,
        nuevo: nue,
        pct: Math.round(pct * 10) / 10,
        changed_at: r.changed_at
      });
    }
    return out;
  },

  /**
   * Preferencia: vista `v_insumos_alerta_stock` (script 14).
   * Si aún no existe en la base, compara columnas en cliente.
   */
  /**
   * Resumen informativo: cuántas líneas de reglas y tarifas distintas usan el insumo.
   */
  async fetchReglasImpactoResumen(): Promise<
    Record<string, { lineas: number; tarifas: number }>
  > {
    const { data, error } = await sb
      .from("reglas_costo")
      .select("insumo_id, precio_impresion_id, precio_anillado_id");
    if (error) throw error;
    const acc = new Map<
      string,
      { lineas: number; tarifas: Set<string> }
    >();
    for (const row of data ?? []) {
      const id = (row as { insumo_id: string | null }).insumo_id;
      const pid = (row as { precio_impresion_id: string | null })
        .precio_impresion_id;
      const aid = (row as { precio_anillado_id: string | null })
        .precio_anillado_id;
      const tarifaKey = pid ?? aid;
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
  },

  async fetchStockBajo(): Promise<Insumo[]> {
    const { data, error } = await sb
      .from("v_insumos_alerta_stock")
      .select("*")
      .order("nombre");
    if (!error && data) return data as Insumo[];
    const { data: all, error: e2 } = await sb
      .from("insumos")
      .select("*")
      .eq("activo", true)
      .order("nombre");
    if (e2) throw e2;
    return ((all ?? []) as Insumo[]).filter(
      (i) => Number(i.stock_actual) <= Number(i.stock_minimo)
    );
  }
};
