import { useState, useCallback } from "react";
import { api } from "../services/api";
import type { Pedido, PedidoItem } from "../types/pedido";

export function usePedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (entregado = false) => {
    setLoading(true);
    try {
      const data = await api.fetchPedidos(entregado);
      setPedidos(data);
    } catch (err) {
      console.error("Error fetching pedidos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const cambiarEstado = async (id: string, estado: string) => {
    await api.cambiarEstadoPedido(id, estado);
  };

  const entregar = async (id: string, total: number) => {
    await api.entregarPedido(id, total);
  };

  const cobrar = async (id: string, total: number) => {
    await api.cobrarPedido(id, total);
  };

  const borrar = async (id: string) => {
    await api.borrarPedido(id);
  };

  const crear = async (
    cabecera: Record<string, unknown>,
    items: PedidoItem[]
  ) => {
    await api.crearPedidoCompleto(cabecera, items);
  };

  const actualizar = async (
    pedidoId: string,
    cabecera: Record<string, unknown>,
    items: PedidoItem[]
  ) => {
    await api.actualizarPedidoCompleto(pedidoId, cabecera, items);
  };

  return {
    pedidos,
    loading,
    load,
    cambiarEstado,
    entregar,
    cobrar,
    borrar,
    crear,
    actualizar
  };
}
