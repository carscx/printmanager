import { sb } from "../config/supabase";
import type { Pedido, PedidoItem } from "../types/pedido";
import type { AppConfig } from "../types/config";

interface ConfigRow {
  id: string;
  valor: string;
}

function mapItemToDB(it: PedidoItem, pedidoId: string) {
  return {
    pedido_id: pedidoId,
    nombre_archivo: it.nombre_archivo,
    paginas: it.paginas || 0,
    copias: it.copias || 1,
    tipo_impresion: it.tipo_impresion || null,
    anillado: it.anillado || null,
    precio_unitario: it.precio_unitario || 0,
    observaciones: (it._sobrina ? "[AVRU] " : "") + (it.observaciones || ""),
    descuento_porcentaje: it.descuento_porcentaje ?? null,
    descuento_monto: it.descuento_monto ?? null,
    recargo_porcentaje: it.recargo_porcentaje ?? null,
    recargo_monto: it.recargo_monto ?? null
  };
}

export const api = {
  async fetchConfig(): Promise<AppConfig> {
    const { data, error } = await sb.from("config").select("*");
    if (error) throw error;
    const config: Record<string, string> = {};
    (data as ConfigRow[]).forEach((row) => (config[row.id] = row.valor));
    return config as unknown as AppConfig;
  },

  async updateConfig(key: string, value: string) {
    const { error } = await sb
      .from("config")
      .update({ valor: value })
      .eq("id", key);
    if (error) throw error;
  },

  async fetchPedidos(entregado = false): Promise<Pedido[]> {
    const { data, error } = await sb
      .from("pedidos")
      .select("*, pedido_items(*)")
      .eq("entregado", entregado)
      .order(entregado ? "fecha_pago" : "created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Pedido[];
  },

  async fetchPedidoById(id: string): Promise<Pedido | null> {
    const { data, error } = await sb
      .from("pedidos")
      .select("*, pedido_items(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as Pedido) ?? null;
  },

  async fetchHistorial(params: {
    page: number;
    pageSize: number;
    fromDate?: string | null; // ISO
    toDate?: string | null; // ISO
    estado?: string | null;
    clienteQuery?: string | null;
    searchQuery?: string | null; // cliente/observaciones/nombre_archivo
    tipoTrabajo?: "bn" | "color" | "anillado" | null;
  }): Promise<{ pedidos: Pedido[]; total: number }> {
    const {
      page,
      pageSize,
      fromDate,
      toDate,
      estado,
      clienteQuery,
      searchQuery,
      tipoTrabajo
    } = params;

    const rangeFrom = page * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;

    // Para búsqueda libre por nombre_archivo necesitamos mapear pedido_id desde pedido_items.
    let pedidoIdsFromItems: string[] | null = null;
    const q = (searchQuery || "").trim();
    if (q) {
      const { data: itemsData, error: itemsErr } = await sb
        .from("pedido_items")
        .select("pedido_id")
        .ilike("nombre_archivo", `%${q}%`);
      if (itemsErr) throw itemsErr;
      pedidoIdsFromItems = Array.from(
        new Set((itemsData ?? []).map((r) => (r as any).pedido_id as string))
      );
      // Si no hay matches en items, igual puede matchear por cliente/observaciones.
      // Dejamos pedidoIdsFromItems = [] para que el OR no bloquee; se maneja abajo.
    }

    let query = sb
      .from("pedidos")
      .select("*, pedido_items(*)", { count: "exact" });

    // Filtros principales
    if (fromDate) query = query.gte("created_at", fromDate);
    if (toDate) query = query.lte("created_at", toDate);
    if (estado) query = query.eq("estado", estado);
    if (clienteQuery && clienteQuery.trim())
      query = query.ilike("cliente", `%${clienteQuery.trim()}%`);

    // Tipo de trabajo: basado en items embebidos (filtrado por existencia)
    // Nota: PostgREST permite filtros en relaciones; aquí usamos un filtro simple por ilike sobre tipo_impresion/anillado.
    if (tipoTrabajo === "bn") {
      query = query.ilike("pedido_items.tipo_impresion", "%B/N%");
    } else if (tipoTrabajo === "color") {
      query = query.ilike("pedido_items.tipo_impresion", "%COLOR%");
    } else if (tipoTrabajo === "anillado") {
      query = query.not("pedido_items.anillado", "is", null);
    }

    // Búsqueda libre: cliente u observaciones, o nombre_archivo.
    if (q) {
      // OR en tabla pedidos
      query = query.or(`cliente.ilike.%${q}%,observaciones.ilike.%${q}%`);

      // Si hay matches de items, limitamos también por esos IDs pero sin bloquear el OR de pedidos:
      // - Si hay IDs, extendemos con OR: id in (...)
      // - Si no hay IDs, no agregamos filtro por ids (queda solo cliente/observaciones).
      if (pedidoIdsFromItems && pedidoIdsFromItems.length > 0) {
        // PostgREST 'or' no soporta 'in' en la misma cadena de forma simple,
        // así que aplicamos un filtro adicional que amplía el set con un OR equivalente:
        // id=in.(...) OR cliente/observaciones...
        query = sb
          .from("pedidos")
          .select("*, pedido_items(*)", { count: "exact" })
          .in("id", pedidoIdsFromItems)
          .or(`cliente.ilike.%${q}%,observaciones.ilike.%${q}%`);

        // Reaplicar filtros previos sobre esta query reconstruida
        if (fromDate) query = query.gte("created_at", fromDate);
        if (toDate) query = query.lte("created_at", toDate);
        if (estado) query = query.eq("estado", estado);
        if (clienteQuery && clienteQuery.trim())
          query = query.ilike("cliente", `%${clienteQuery.trim()}%`);
        if (tipoTrabajo === "bn") {
          query = query.ilike("pedido_items.tipo_impresion", "%B/N%");
        } else if (tipoTrabajo === "color") {
          query = query.ilike("pedido_items.tipo_impresion", "%COLOR%");
        } else if (tipoTrabajo === "anillado") {
          query = query.not("pedido_items.anillado", "is", null);
        }
      }
    }

    query = query.order("created_at", { ascending: false }).range(rangeFrom, rangeTo);

    const { data, error, count } = await query;
    if (error) throw error;
    return { pedidos: (data ?? []) as Pedido[], total: count ?? 0 };
  },

  async fetchResumenHoy(): Promise<Pedido[]> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const { data, error } = await sb
      .from("pedidos")
      .select("*, pedido_items(*)")
      .eq("entregado", true)
      .gte("fecha_pago", hoy.toISOString());
    if (error) throw error;
    return (data ?? []) as Pedido[];
  },

  async cambiarEstadoPedido(id: string, nuevoEstado: string) {
    const { data, error } = await sb
      .from("pedidos")
      .update({ estado: nuevoEstado })
      .eq("id", id)
      .select();
    if (error) throw error;
    return data;
  },

  async entregarPedido(id: string, total: number) {
    const { error } = await sb
      .from("pedidos")
      .update({
        entregado: true,
        fecha_pago: new Date().toISOString(),
        estado: "entregado",
        sena: total
      })
      .eq("id", id)
      .select();
    if (error) throw error;
  },

  async cobrarPedido(id: string, total: number) {
    const { error } = await sb
      .from("pedidos")
      .update({ sena: total })
      .eq("id", id)
      .select();
    if (error) throw error;
  },

  async borrarPedido(id: string) {
    const { error } = await sb.from("pedidos").delete().eq("id", id);
    if (error) throw error;
  },

  async crearPedidoCompleto(
    cabecera: Record<string, unknown>,
    items: PedidoItem[]
  ) {
    const { data: pData, error: pError } = await sb
      .from("pedidos")
      .insert([cabecera])
      .select();
    if (pError) throw pError;
    const pedidoId = (pData as Pedido[])[0].id;
    const itemsRel = items.map((it) => mapItemToDB(it, pedidoId));
    const { error: iError } = await sb.from("pedido_items").insert(itemsRel);
    if (iError) throw iError;
    return pData;
  },

  async actualizarPedidoCompleto(
    pedidoId: string,
    cabecera: Record<string, unknown>,
    items: PedidoItem[]
  ) {
    const { error: cErr } = await sb
      .from("pedidos")
      .update(cabecera)
      .eq("id", pedidoId);
    if (cErr) throw cErr;
    await sb.from("pedido_items").delete().eq("pedido_id", pedidoId);
    const itemsRel = items.map((it) => mapItemToDB(it, pedidoId));
    const { error: iErr } = await sb.from("pedido_items").insert(itemsRel);
    if (iErr) throw iErr;
  }
};
