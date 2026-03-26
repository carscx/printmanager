import {
  useState,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction
} from "react";
import { preciosApi } from "../services/preciosApi";
import type {
  PrecioImpresion,
  PrecioAnillado,
  ConfigCosto
} from "../types/precio";

/** Evita que un fetch fallido (p. ej. config) deje sin actualizar el resto (p. ej. anillado). */
async function aplicarCargasPrecios(
  setPreciosImpresion: Dispatch<SetStateAction<PrecioImpresion[]>>,
  setPreciosAnillado: Dispatch<SetStateAction<PrecioAnillado[]>>,
  setConfigCostos: Dispatch<SetStateAction<ConfigCosto[]>>,
  setErrorImpresion: Dispatch<SetStateAction<string | null>>
): Promise<void> {
  const results = await Promise.allSettled([
    preciosApi.fetchPreciosImpresion(false),
    preciosApi.fetchPreciosAnillado(false),
    preciosApi.fetchConfigCostos()
  ]);
  if (results[0].status === "fulfilled") {
    setPreciosImpresion(results[0].value);
    setErrorImpresion(null);
  } else {
    const reason = results[0].reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "object" && reason !== null && "message" in reason
          ? String((reason as { message: string }).message)
          : String(reason);
    setErrorImpresion(msg);
    setPreciosImpresion([]);
    console.error("Error cargando precios impresión:", reason);
  }
  if (results[1].status === "fulfilled") {
    setPreciosAnillado(results[1].value);
  } else {
    console.error("Error cargando precios anillado:", results[1].reason);
  }
  if (results[2].status === "fulfilled") {
    setConfigCostos(results[2].value);
  } else {
    console.error("Error cargando config costos:", results[2].reason);
  }
}

export function usePrecios() {
  const [preciosImpresion, setPreciosImpresion] = useState<PrecioImpresion[]>(
    []
  );
  const [preciosAnillado, setPreciosAnillado] = useState<PrecioAnillado[]>([]);
  const [configCostos, setConfigCostos] = useState<ConfigCosto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorImpresion, setErrorImpresion] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await aplicarCargasPrecios(
        setPreciosImpresion,
        setPreciosAnillado,
        setConfigCostos,
        setErrorImpresion
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /** Misma data que reload, sin pantalla de carga (evita “refresco” al guardar reglas/config). */
  const reloadSilent = useCallback(async () => {
    await aplicarCargasPrecios(
      setPreciosImpresion,
      setPreciosAnillado,
      setConfigCostos,
      setErrorImpresion
    );
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    preciosImpresion,
    preciosAnillado,
    configCostos,
    loading,
    errorImpresion,
    reload,
    reloadSilent
  };
}
