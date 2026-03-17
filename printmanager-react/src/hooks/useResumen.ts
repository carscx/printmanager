import { useState, useCallback } from "react";
import { api } from "../services/api";
import { costEngine } from "../services/costEngine";
import { preciosApi } from "../services/preciosApi";
import type { Pedido } from "../types/pedido";

export interface ResumenResult {
  total: number;
  comisionTotal: number;
  gananciaLimpia: number;
}

export function useResumen() {
  const [resumen, setResumen] = useState<ResumenResult>({
    total: 0,
    comisionTotal: 0,
    gananciaLimpia: 0
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pedidosHoy, configCostos] = await Promise.all([
        api.fetchResumenHoy() as Promise<Pedido[]>,
        preciosApi.fetchConfigCostos()
      ]);
      const result = costEngine.calcularResumen(pedidosHoy, configCostos);
      setResumen(result);
    } catch (err) {
      console.error("Error loading resumen:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { resumen, loading, load };
}
