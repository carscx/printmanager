import { useState, useEffect } from "react";
import { insumosApi } from "../services/insumosApi";
import { equiposApi } from "../services/equiposApi";
import type { Insumo } from "../types/insumo";
import type { Equipo } from "../types/equipo";

/**
 * Insumos y equipos activos para estimar costos (tarifario, línea de pedido, reportes en vivo).
 */
export function useDatosCosto(enabled = true) {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([
      insumosApi.fetchAll(false),
      equiposApi.fetchAll(true)
    ])
      .then(([i, e]) => {
        if (alive) {
          setInsumos(i);
          setEquipos(e);
        }
      })
      .catch(() => {
        if (alive) {
          setInsumos([]);
          setEquipos([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { insumos, equipos, loading };
}
