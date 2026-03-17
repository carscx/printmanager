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
    const { data, error } = await sb
      .from("insumos")
      .insert([input])
      .select()
      .single();
    if (error) throw error;
    return data as Insumo;
  },

  async actualizar(id: string, input: Partial<InsumoInput>): Promise<Insumo> {
    const { data, error } = await sb
      .from("insumos")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Insumo;
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

  /** Registra un movimiento de stock y actualiza stock_actual */
  async registrarMovimiento(params: {
    insumo_id: string;
    tipo: StockTipo;
    cantidad: number;
    motivo: StockMotivo;
    referencia_pedido_id?: string;
    notas?: string;
  }): Promise<void> {
    // 1. Insertar movimiento
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

    // 2. Obtener stock actual
    const { data: insumo, error: fetchErr } = await sb
      .from("insumos")
      .select("stock_actual")
      .eq("id", params.insumo_id)
      .single();
    if (fetchErr) throw fetchErr;

    // 3. Actualizar stock
    const nuevoStock = Number(insumo.stock_actual) + params.cantidad;
    const { error: updErr } = await sb
      .from("insumos")
      .update({ stock_actual: nuevoStock })
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

  async fetchStockBajo(): Promise<Insumo[]> {
    const { data, error } = await sb
      .from("insumos")
      .select("*")
      .eq("activo", true);
    // Filtramos en el cliente porque Supabase REST no permite comparar columnas
    if (error) throw error;
    return ((data ?? []) as Insumo[]).filter(
      (i) => i.stock_actual <= i.stock_minimo && i.stock_minimo > 0
    );
  }
};
