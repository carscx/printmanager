import { useState, useEffect, useCallback } from "react";
import { insumosApi } from "../services/insumosApi";
import type {
  Insumo,
  InsumoCategoria,
  StockMovimiento,
  InsumoPrecioLog
} from "../types/insumo";

export function useInsumos(enabled = true) {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<
    InsumoCategoria | "todas"
  >("todas");
  const [busqueda, setBusqueda] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await insumosApi.fetchAll(!mostrarInactivos);
      setInsumos(data);
    } catch (err) {
      console.error("Error fetching insumos:", err);
    } finally {
      setLoading(false);
    }
  }, [mostrarInactivos]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  // Filtrado local
  const insumosFiltrados = insumos.filter((i) => {
    if (filtroCategoria !== "todas" && i.categoria !== filtroCategoria)
      return false;
    if (busqueda && !i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
      return false;
    return true;
  });

  return {
    insumos: insumosFiltrados,
    allInsumos: insumos,
    loading,
    reload: load,
    filtroCategoria,
    setFiltroCategoria,
    busqueda,
    setBusqueda,
    mostrarInactivos,
    setMostrarInactivos
  };
}

export function useInsumoDetalle(insumoId: string | null) {
  const [movimientos, setMovimientos] = useState<StockMovimiento[]>([]);
  const [preciosLog, setPreciosLog] = useState<InsumoPrecioLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!insumoId) return;
    setLoading(true);
    try {
      const [movs, precios] = await Promise.all([
        insumosApi.fetchMovimientos(insumoId),
        insumosApi.fetchPreciosLog(insumoId)
      ]);
      setMovimientos(movs);
      setPreciosLog(precios);
    } catch (err) {
      console.error("Error fetching detalle insumo:", err);
    } finally {
      setLoading(false);
    }
  }, [insumoId]);

  useEffect(() => {
    load();
  }, [load]);

  return { movimientos, preciosLog, loading, reload: load };
}

export function useStockBajo(enabled = true) {
  const [alertas, setAlertas] = useState<Insumo[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await insumosApi.fetchStockBajo();
      setAlertas(data);
    } catch (err) {
      console.error("Error fetching stock bajo:", err);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { alertas, reload: load };
}
