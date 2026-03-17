import { useState, useEffect, useCallback } from "react";
import { preciosApi } from "../services/preciosApi";
import type {
  PrecioImpresion,
  PrecioAnillado,
  ConfigCosto
} from "../types/precio";

export function usePrecios() {
  const [preciosImpresion, setPreciosImpresion] = useState<PrecioImpresion[]>(
    []
  );
  const [preciosAnillado, setPreciosAnillado] = useState<PrecioAnillado[]>([]);
  const [configCostos, setConfigCostos] = useState<ConfigCosto[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [imp, ani, cfg] = await Promise.all([
        preciosApi.fetchPreciosImpresion(),
        preciosApi.fetchPreciosAnillado(),
        preciosApi.fetchConfigCostos()
      ]);
      setPreciosImpresion(imp);
      setPreciosAnillado(ani);
      setConfigCostos(cfg);
    } catch (err) {
      console.error("Error cargando precios:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    preciosImpresion,
    preciosAnillado,
    configCostos,
    loading,
    reload
  };
}
