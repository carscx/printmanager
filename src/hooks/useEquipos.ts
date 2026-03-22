import { useState, useEffect, useCallback } from "react";
import { equiposApi } from "../services/equiposApi";
import type { Equipo } from "../types/equipo";

export function useEquipos(enabled = true) {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await equiposApi.fetchAll(!mostrarInactivos);
      setEquipos(data);
    } catch (err) {
      console.error("Error fetching equipos:", err);
    } finally {
      setLoading(false);
    }
  }, [mostrarInactivos]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return {
    equipos,
    loading,
    reload: load,
    mostrarInactivos,
    setMostrarInactivos
  };
}
