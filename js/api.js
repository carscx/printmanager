import { sb } from "./supabase.js";

export const api = {
  async fetchConfig() {
    return await sb.from("config").select("*");
  },

  async updateConfig(key, value) {
    return await sb.from("config").update({ valor: value }).eq("id", key);
  },

  async fetchPedidos(entregado = false) {
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

  async crearPedidoCompleto(pedidoCabecera, items) {
    // 1. Insertamos la cabecera del pedido
    const { data: pedidoData, error: pedidoError } = await sb
      .from("pedidos")
      .insert([pedidoCabecera])
      .select();

    if (pedidoError) throw pedidoError;

    const pedidoId = pedidoData[0].id;

    // 2. Insertamos todos los items vinculados al pedidoId
    const itemsRelacionados = items.map((item) => ({
      ...item,
      pedido_id: pedidoId
    }));

    const { error: itemsError } = await sb
      .from("pedido_items")
      .insert(itemsRelacionados);

    if (itemsError) throw itemsError;

    return { data: pedidoData };
  },

  async borrarPedido(id) {
    return await sb.from("pedidos").delete().eq("id", id);
  },

  async cambiarEstadoPedido(id, nuevoEstado) {
    return await sb
      .from("pedidos")
      .update({ estado: nuevoEstado })
      .eq("id", id);
  },

  async entregarPedido(id) {
    const res = await sb
      .from("pedidos")
      .update({
        entregado: true,
        fecha_pago: new Date().toISOString(),
        estado: "Listo"
      })
      .eq("id", id);

    if (res.error) throw res.error;
    return res;
  },

  async actualizarPedidoCompleto(pedidoId, cabecera, items) {
    // 1. Actualizar cabecera
    const { error: cabErr } = await sb
      .from("pedidos")
      .update(cabecera)
      .eq("id", pedidoId);
    if (cabErr) throw cabErr;

    // 2. Eliminar items existentes
    const { error: delErr } = await sb
      .from("pedido_items")
      .delete()
      .eq("pedido_id", pedidoId);
    if (delErr) throw delErr;

    // 3. Insertar nuevos items
    const itemsRel = items.map((it) => ({ ...it, pedido_id: pedidoId }));
    const { error: insErr } = await sb.from("pedido_items").insert(itemsRel);
    if (insErr) throw insErr;

    return { success: true };
  }
};
