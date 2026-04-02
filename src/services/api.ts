import { sb } from "../config/supabase";
import type { Pedido, PedidoItem } from "../types/pedido";
import type { PedidoItemInsumo } from "../types/precio";
import type { AppConfig } from "../types/config";

interface ConfigRow {
  id: string;
  valor: string;
}

/** Filtros compartidos entre `fetchHistorial` y `fetchHistorialTodos`. */
export type HistorialFiltros = {
  fromDate?: string | null;
  toDate?: string | null;
  /**
   * Estado exacto (`presupuesto`, `pendiente`, …) o `activos`: excluye `pagado` y
   * `entregado` para ver trabajo abierto. `null` = sin filtro (todos).
   */
  estado?: string | null;
  /**
   * Búsqueda por nombre de cliente (ilike).
   * Si el texto es solo dígitos (opcional #), también coincide por `numero_publico` exacto (OR).
   */
  busquedaClientePedido?: string | null;
  searchQuery?: string | null;
  tipoTrabajo?: "bn" | "color" | "stickers" | "anillado" | null;
  cobranza?: "todos" | "impago" | "pagado" | null;
  impresos?: "todos" | "si" | "no" | null;
};

/** Solo dígitos opcionalmente con # al inicio → número de pedido público. */
function esSoloNumeroPedido(raw: string): boolean {
  return /^#?\d+$/.test(raw.trim());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyEstadoHistorial(query: any, estado: string | null | undefined) {
  if (!estado) return query;
  if (estado === "activos") {
    return query.not("estado", "in", "(pagado,entregado)");
  }
  return query.eq("estado", estado);
}

function applyBusquedaClientePedido(query: any, raw: string | null | undefined) {
  const q = (raw || "").trim();
  if (!q) return query;
  if (esSoloNumeroPedido(q)) {
    const n = parseInt(q.replace(/^#/, "").trim(), 10);
    if (Number.isFinite(n) && n > 0) {
      return query.or(`cliente.ilike.%${q}%,numero_publico.eq.${n}`);
    }
  }
  return query.ilike("cliente", `%${q}%`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyImpresosHistorial(
  query: any,
  impresos: "todos" | "si" | "no" | null | undefined
) {
  if (!impresos || impresos === "todos") return query;
  // Solo aplica sobre trabajos con impresión.
  query = query.not("pedido_items.precio_impresion_id", "is", null);
  return query.eq("pedido_items.impreso", impresos === "si");
}

/** Pedidos que tienen al menos un ítem B/N (`B/N` o `B&N` en texto). Sin `or()` en PostgREST (PGRST100 con `/`). */
async function fetchPedidoIdsConTipoBn(): Promise<string[]> {
  const [r1, r2] = await Promise.all([
    sb.from("pedido_items").select("pedido_id").ilike("tipo_impresion", "%B/N%"),
    sb.from("pedido_items").select("pedido_id").ilike("tipo_impresion", "%B&N%")
  ]);
  if (r1.error) throw r1.error;
  if (r2.error) throw r2.error;
  const s = new Set<string>();
  for (const r of [...(r1.data ?? []), ...(r2.data ?? [])]) {
    s.add((r as { pedido_id: string }).pedido_id);
  }
  return [...s];
}

/**
 * Incluir pedidos donde **existe al menos un** `pedido_items` que cumple el tipo (semántica EXISTS / inner join).
 * B/N: se filtra en `fetchHistorial` con `.in(id, …)` vía `fetchPedidoIdsConTipoBn()` (no añadir condición aquí).
 */
function applyTipoTrabajoHistorial(
  query: any,
  tipoTrabajo: HistorialFiltros["tipoTrabajo"]
) {
  if (!tipoTrabajo) return query;
  if (tipoTrabajo === "bn") {
    return query;
  }
  if (tipoTrabajo === "color") {
    return query.ilike("pedido_items.tipo_impresion", "%COLOR%");
  }
  if (tipoTrabajo === "stickers") {
    return query.ilike("pedido_items.tipo_impresion", "%STICKERS%");
  }
  if (tipoTrabajo === "anillado") {
    return query.not("pedido_items.anillado", "is", null);
  }
  return query;
}

/** Mapeo a `pedido_items`: volumen = paginas × copias (no existe `cantidad`); anillado `anillado_medida_mm`. */
function mapItemToDB(it: PedidoItem, pedidoId: string) {
  return {
    pedido_id: pedidoId,
    nombre_archivo: it.nombre_archivo,
    paginas: it.paginas || 0,
    copias: it.copias || 1,
    tipo_impresion: it.tipo_impresion || null,
    anillado: it.anillado || null,
    precio_unitario: it.precio_unitario || 0,
    observaciones: it.observaciones || "",
    descuento_porcentaje: it.descuento_porcentaje ?? null,
    descuento_monto: it.descuento_monto ?? null,
    recargo_porcentaje: it.recargo_porcentaje ?? null,
    recargo_monto: it.recargo_monto ?? null,
    solo_anillado: it.solo_anillado ?? false,
    precio_impresion_id: it.precio_impresion_id ?? null,
    precio_anillado_id: it.precio_anillado_id ?? null,
    anillado_medida_mm: it.anillado_medida_mm ?? null,
    doble_faz: it.doble_faz ?? false,
    impreso: it.impreso ?? false
  };
}

export const api = {
  /** @deprecated Tabla `config` legacy; precios vivos en `precios_*` y `configuracion_negocio`. */
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

  async fetchHistorial(
    params: HistorialFiltros & { page: number; pageSize: number }
  ): Promise<{ pedidos: Pedido[]; total: number }> {
    const {
      page,
      pageSize,
      fromDate,
      toDate,
      estado,
      busquedaClientePedido,
      searchQuery,
      tipoTrabajo,
      cobranza,
      impresos
    } = params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyCobranza = (q: any) => {
      if (cobranza === "impago") {
        // listo con cobro total registrado (forma_pago_total) cuenta como cobrado → no aparece en "impago"
        return q.or(
          "estado.in.(presupuesto,pendiente),and(estado.eq.listo,forma_pago_total.is.null)"
        );
      }
      if (cobranza === "pagado") {
        return q.or(
          "estado.in.(pagado,entregado),and(estado.eq.listo,forma_pago_total.not.is.null)"
        );
      }
      return q;
    };

    const rangeFrom = page * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;

    let pedidoIdsBn: string[] | null = null;
    if (tipoTrabajo === "bn") {
      pedidoIdsBn = await fetchPedidoIdsConTipoBn();
      if (pedidoIdsBn.length === 0) {
        return { pedidos: [], total: 0 };
      }
    }

    /**
     * Cualquier filtro sobre `pedido_items` en la misma petición hace que PostgREST restrinja
     * el embed. Primera consulta: solo `id` (+ inner join para EXISTS); segunda: pedido completo
     * con **todos** los ítems (sin filtrar líneas en la card).
     * B/N solo (sin filtro impresos): ids vienen de prefetch → `select id` sin `!inner`.
     */
    const needsHistorialDosPasos =
      Boolean(tipoTrabajo) || impresos === "si" || impresos === "no";
    const bnSoloViaPrefetch =
      tipoTrabajo === "bn" &&
      (impresos === "todos" || impresos == null || impresos === undefined);
    /** PGRST108: no se puede filtrar por `pedido_items.*` sin incluir el embed en `select`. */
    const selectHistorial = bnSoloViaPrefetch
      ? "id"
      : needsHistorialDosPasos
        ? "id,pedido_items!inner(id)"
        : "*,pedido_items(*)";

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

    let query = sb.from("pedidos").select(selectHistorial, { count: "exact" });
    if (pedidoIdsBn) {
      query = query.in("id", pedidoIdsBn);
    }

    // Filtros principales
    if (fromDate) query = query.gte("created_at", fromDate);
    if (toDate) query = query.lte("created_at", toDate);
    query = applyEstadoHistorial(query, estado);
    query = applyBusquedaClientePedido(query, busquedaClientePedido);

    query = applyTipoTrabajoHistorial(query, tipoTrabajo);

    query = applyCobranza(query);
    query = applyImpresosHistorial(query, impresos);

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
        const idsArchivoBn =
          pedidoIdsBn && pedidoIdsFromItems.length > 0
            ? pedidoIdsFromItems.filter((id) => pedidoIdsBn.includes(id))
            : pedidoIdsFromItems;
        const idsParaIn =
          pedidoIdsBn && idsArchivoBn.length === 0
            ? pedidoIdsBn
            : idsArchivoBn;
        query = sb
          .from("pedidos")
          .select(selectHistorial, { count: "exact" })
          .in("id", idsParaIn)
          .or(`cliente.ilike.%${q}%,observaciones.ilike.%${q}%`);

        // Reaplicar filtros previos sobre esta query reconstruida
        if (fromDate) query = query.gte("created_at", fromDate);
        if (toDate) query = query.lte("created_at", toDate);
        query = applyEstadoHistorial(query, estado);
        query = applyBusquedaClientePedido(query, busquedaClientePedido);
        query = applyTipoTrabajoHistorial(query, tipoTrabajo);
        query = applyCobranza(query);
        query = applyImpresosHistorial(query, impresos);
      }
    }

    query = query.order("created_at", { ascending: false }).range(rangeFrom, rangeTo);

    const { data, error, count } = await query;
    if (error) throw error;

    const rawPrimera = (data ?? []) as unknown;

    if (!needsHistorialDosPasos) {
      return { pedidos: rawPrimera as Pedido[], total: count ?? 0 };
    }

    const ids = (rawPrimera as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) {
      return { pedidos: [], total: count ?? 0 };
    }

    const { data: fullRows, error: errFull } = await sb
      .from("pedidos")
      .select("*,pedido_items(*)")
      .in("id", ids);
    if (errFull) throw errFull;

    const orderMap = new Map(ids.map((id, i) => [id, i]));
    const pedidos = ((fullRows ?? []) as Pedido[]).sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
    );
    return { pedidos, total: count ?? 0 };
  },

  /**
   * Mismos filtros que `fetchHistorial`, pero recorre todas las páginas hasta
   * traer todos los pedidos que coincidan (ítems incluidos).
   */
  async fetchHistorialTodos(
    filtros: HistorialFiltros,
    options?: { maxRows?: number; batchSize?: number }
  ): Promise<Pedido[]> {
    const batchSize = Math.min(options?.batchSize ?? 500, 1000);
    const maxRows = options?.maxRows ?? 50_000;
    const all: Pedido[] = [];
    let page = 0;
    let totalEsperado = 0;

    while (all.length < maxRows) {
      const { pedidos, total } = await api.fetchHistorial({
        ...filtros,
        page,
        pageSize: batchSize
      });
      if (page === 0) totalEsperado = total;
      all.push(...pedidos);
      if (pedidos.length === 0 || all.length >= totalEsperado) break;
      if (pedidos.length < batchSize) break;
      page += 1;
    }

    if (all.length >= maxRows && totalEsperado > maxRows) {
      console.warn(
        `[fetchHistorialTodos] Resultado truncado a ${maxRows} filas (total coincidente: ${totalEsperado})`
      );
    }

    return all.slice(0, maxRows);
  },

  /** Consumo congelado de insumos por lista de IDs de pedido_items (en lotes) */
  async fetchConsumoInsumosPorItemIds(
    itemIds: string[]
  ): Promise<PedidoItemInsumo[]> {
    const unique = [...new Set(itemIds)].filter(Boolean);
    const chunk = 120;
    const all: PedidoItemInsumo[] = [];
    for (let i = 0; i < unique.length; i += chunk) {
      const slice = unique.slice(i, i + chunk);
      const { data, error } = await sb
        .from("pedido_items_insumos")
        .select("*")
        .in("pedido_item_id", slice);
      if (error) throw error;
      all.push(...((data ?? []) as PedidoItemInsumo[]));
    }
    return all;
  },

  /**
   * Pedidos en rango de fechas (reportes). Por defecto excluye cancelados.
   * `limite` máx. filas (Supabase suele limitar a 1000 sin esto).
   */
  async fetchPedidosPorPeriodo(
    fromISO: string,
    toISO: string,
    options?: { incluirCancelados?: boolean; limite?: number }
  ): Promise<Pedido[]> {
    let query = sb
      .from("pedidos")
      .select("*, pedido_items(*)")
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false });

    if (!options?.incluirCancelados) {
      query = query.neq("estado", "cancelado");
    }
    const lim = options?.limite ?? 5000;
    if (lim > 0) query = query.limit(lim);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Pedido[];
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

  /** Actualización parcial de cabecera (transiciones de máquina de estados). */
  async updatePedidoPatch(id: string, patch: Record<string, unknown>) {
    const { error } = await sb.from("pedidos").update(patch).eq("id", id);
    if (error) throw error;
  },

  async updatePedidoItemPatch(id: string, patch: Record<string, unknown>) {
    const { error } = await sb.from("pedido_items").update(patch).eq("id", id);
    if (error) throw error;
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

  /** Presupuesto → pedido; falla si presupuesto vencido (Épica 1). */
  async rpcConvertirPresupuestoAPedido(pedidoId: string): Promise<void> {
    const { error } = await sb.rpc("rpc_convertir_presupuesto_a_pedido", {
      p_pedido_id: pedidoId
    });
    if (error) throw error;
  },

  async crearPedidoCompleto(
    cabecera: Record<string, unknown>,
    items: PedidoItem[]
  ) {
    const sena = Number(cabecera.sena ?? 0);
    const modalidad = String(cabecera.modalidad ?? "");
    /** Pedido con seña: insert staging presupuesto → RPC BOM → UPDATE a pendiente (dispara stock en trigger). */
    const stagingPedido = modalidad === "pedido" && sena > 0;
    const insertCabecera = stagingPedido
      ? {
          ...cabecera,
          estado: "presupuesto",
          modalidad: "presupuesto"
        }
      : cabecera;

    const { data: pData, error: pError } = await sb
      .from("pedidos")
      .insert([insertCabecera])
      .select("*");
    if (pError) throw pError;
    const pedidoId = (pData as Pedido[])[0].id;
    const itemsRel = items.map((it) => mapItemToDB(it, pedidoId));
    const { error: iError } = await sb.from("pedido_items").insert(itemsRel);
    if (iError) throw iError;
    const { error: bError } = await sb.rpc("rpc_explotar_bom_pedido", {
      p_pedido_id: pedidoId
    });
    if (bError) {
      await sb.from("pedidos").delete().eq("id", pedidoId);
      throw bError;
    }

    if (stagingPedido) {
      const { error: uErr } = await sb
        .from("pedidos")
        .update({
          modalidad: "pedido",
          estado: "pendiente",
          sena: cabecera.sena,
          forma_pago_sena: (cabecera.forma_pago_sena ?? null) as
            | string
            | null,
          forma_pago_total: (cabecera.forma_pago_total ?? null) as
            | string
            | null,
          tipo_pago: cabecera.tipo_pago,
          total: cabecera.total,
          total_pedido: cabecera.total_pedido,
          cliente: cabecera.cliente,
          fecha_entrega: cabecera.fecha_entrega,
          observaciones: cabecera.observaciones,
          vendedor_id: cabecera.vendedor_id,
          descuento_global_porcentaje: cabecera.descuento_global_porcentaje,
          descuento_global_monto: cabecera.descuento_global_monto,
          recargo_global_porcentaje: cabecera.recargo_global_porcentaje,
          recargo_global_monto: cabecera.recargo_global_monto
        })
        .eq("id", pedidoId);
      if (uErr) throw uErr;
    }

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
    const { error: bErr } = await sb.rpc("rpc_explotar_bom_pedido", {
      p_pedido_id: pedidoId
    });
    if (bErr) throw bErr;
  }
};
