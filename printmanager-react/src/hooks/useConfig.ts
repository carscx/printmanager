import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import type { AppConfig } from "../types/config";
import { DEFAULT_CONFIG } from "../types/config";

/**
 * @param enabled - solo hace fetch cuando es true (después de autenticar)
 */
export function useConfig(enabled = true) {
  const [settings, setSettings] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const config = await api.fetchConfig();
      setSettings(config);
    } catch (err) {
      console.error("Error loading config:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      load();
    }
  }, [enabled, load]);

  const updateConfig = async (key: string, value: string) => {
    await api.updateConfig(key, value);
  };

  const saveAll = async (values: Record<string, string>) => {
    for (const [key, value] of Object.entries(values)) {
      await api.updateConfig(key, value);
    }
    await load();
  };

  return { settings, loading, reload: load, updateConfig, saveAll };
}
