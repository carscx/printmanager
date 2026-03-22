import { useState } from "react";
import {
  descontarStockPedido,
  restaurarStockPedido
} from "../services/stockService";

export function useDescontarStock() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const descontar = async (pedidoId: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    const res = await descontarStockPedido(pedidoId);
    if (res.ok) {
      setSuccess(true);
    } else {
      setError(res.error || "Error desconocido");
    }
    setLoading(false);
  };

  const restaurar = async (pedidoId: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    const res = await restaurarStockPedido(pedidoId);
    if (res.ok) {
      setSuccess(true);
    } else {
      setError(res.error || "Error desconocido");
    }
    setLoading(false);
  };

  return { descontar, restaurar, loading, error, success };
}
