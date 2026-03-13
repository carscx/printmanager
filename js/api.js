import { sb } from "./supabase.js?v=2";

export const api = {
  async fetchConfig() {
    return await sb.from("config").select("*");
  },

  async updateConfig(key, value) {
    return await sb.from("config").update({ valor: value }).eq("id", key);
  },

  async fetchPedidos(entregado = false) {
    // Usamos select con count para ver qué llega exactamente
    return await sb
      .from("pedidos")
      .select("*, pedido_items(*)")
      .eq("entregado", entregado)
      .order(entregado ? "fecha_pago" : "created_at", { ascending: false });
  },

  async fetchResumenHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return await sb
      .from("pedidos")
      .select("*, pedido_items(*)")
      .eq("entregado", true)
      .gte("fecha_pago", hoy.toISOString());
  },

  async cambiarEstadoPedido(id, nuevoEstado) {
    console.log("DB_UPDATE_START", id, nuevoEstado);
    const { data, error } = await sb
      .from("pedidos")
      .update({ estado: nuevoEstado })
      .eq("id", id)
      .select();

    if (error) console.error("DB_UPDATE_ERROR", error);
    if (data && data.length === 0)
      console.warn("DB_UPDATE_EMPTY - No se encontró fila o RLS activo");

    return { data, error };
  },

  async entregarPedido(id, total) {
    return await sb
      .from("pedidos")
      .update({
        entregado: true,
        fecha_pago: new Date().toISOString(),
        estado: "Listo",
        sena: total
      })
      .eq("id", id)
      .select();
  },

  async cobrarPedido(id, total) {
    return await sb
      .from("pedidos")
      .update({ sena: total })
      .eq("id", id)
      .select();
  },

  async borrarPedido(id) {
    return await sb.from("pedidos").delete().eq("id", id);
  },

  _mapItemToDB(it, pedidoId) {
    return {
      pedido_id: pedidoId,
      nombre_archivo: it.nombre_archivo,
      paginas: it.paginas || 0,
      tipo_impresion: it.tipo_impresion || null,
      anillado: it.anillado || null,
      precio_unitario: it.precio_unitario || it.subtotal_item || 0,
      observaciones: (it._sobrina ? "[AVRU] " : "") + (it.observaciones || "")
    };
  },

  async crearPedidoCompleto(pedidoCabecera, items) {
    const { data: pData, error: pError } = await sb
      .from("pedidos")
      .insert([pedidoCabecera])
      .select();
    if (pError) throw pError;
    const itemsRel = items.map((it) => this._mapItemToDB(it, pData[0].id));
    const { error: iError } = await sb.from("pedido_items").insert(itemsRel);
    if (iError) throw iError;
    return { data: pData };
  },

  async actualizarPedidoCompleto(pedidoId, cabecera, items) {
    const { error: cErr } = await sb
      .from("pedidos")
      .update(cabecera)
      .eq("id", pedidoId);
    if (cErr) throw cErr;
    await sb.from("pedido_items").delete().eq("pedido_id", pedidoId);
    const itemsRel = items.map((it) => this._mapItemToDB(it, pedidoId));
    const { error: iErr } = await sb.from("pedido_items").insert(itemsRel);
    if (iErr) throw iErr;
    return { success: true };
  }
};
