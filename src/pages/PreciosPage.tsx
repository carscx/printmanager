import { useState } from "react";
import { usePrecios } from "../hooks/usePrecios";
import { useDatosCosto } from "../hooks/useDatosCosto";
import { preciosApi } from "../services/preciosApi";
import { showToast } from "../components/ui/Toast";
import { PreciosImpresionGrid } from "../components/precios/PreciosImpresionGrid.tsx";
import { PreciosAnilladoGrid } from "../components/precios/PreciosAnilladoGrid.tsx";
import { ConfigCostosPanel } from "../components/precios/ConfigCostosPanel.tsx";
import { ConfiguracionNegocioPanel } from "../components/precios/ConfiguracionNegocioPanel.tsx";
import { ReglasNegocioPanel } from "../components/precios/ReglasNegocioPanel.tsx";
import { AjusteMasivoSheet } from "../components/precios/AjusteMasivoSheet.tsx";

type SeccionActiva = "impresion" | "anillado" | "reglas" | "costos";

export function PreciosPage() {
  const {
    preciosImpresion,
    preciosAnillado,
    configCostos,
    loading,
    errorImpresion,
    reload,
    reloadSilent
  } = usePrecios();
  const { insumos, equipos, loading: loadingCostos } = useDatosCosto();
  const [seccion, setSeccion] = useState<SeccionActiva>("impresion");
  const [showAjuste, setShowAjuste] = useState(false);
  const [ajusteTipo, setAjusteTipo] = useState<"impresion" | "anillado">(
    "impresion"
  );

  const handleAjusteMasivo = async (porcentaje: number) => {
    try {
      if (ajusteTipo === "impresion") {
        await preciosApi.ajustarPreciosImpresionPorcentaje(porcentaje);
      } else {
        await preciosApi.ajustarPreciosAnilladoPorcentaje(porcentaje);
      }
      showToast(`PRECIOS AJUSTADOS ${porcentaje > 0 ? "+" : ""}${porcentaje}%`);
      await reload();
    } catch {
      showToast("ERROR AL AJUSTAR PRECIOS", "error");
    }
    setShowAjuste(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="fas fa-circle-notch fa-spin fa-2x text-blue-600" />
      </div>
    );
  }

  const secciones: { id: SeccionActiva; label: string; icon: string }[] = [
    { id: "impresion", label: "Impresión", icon: "fa-print" },
    { id: "anillado", label: "Anillado", icon: "fa-ring" },
    { id: "reglas", label: "Reglas de negocio", icon: "fa-diagram-project" },
    { id: "costos", label: "Pagos / resumen", icon: "fa-sliders" }
  ];

  return (
    <section className="animate-slide-in-bottom space-y-4">
      {errorImpresion && (
        <div
          className="rounded-sm border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] font-bold text-red-900 leading-snug"
          role="alert"
        >
          <i className="fas fa-triangle-exclamation mr-1" />
          No se pudieron cargar las tarifas de impresión desde Supabase.{" "}
          <span className="font-mono font-normal opacity-90">{errorImpresion}</span>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {secciones.map((s) => (
          <button
            key={s.id}
            onClick={() => setSeccion(s.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-sm text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              seccion === s.id
                ? "bg-slate-900 text-white shadow-lg"
                : "bg-white text-slate-400 border border-slate-100"
            }`}
          >
            <i className={`fas ${s.icon}`} />
            {s.label}
          </button>
        ))}
      </div>

      {seccion === "impresion" && (
        <PreciosImpresionGrid
          precios={preciosImpresion}
          onReload={reload}
          onAjusteMasivo={() => {
            setAjusteTipo("impresion");
            setShowAjuste(true);
          }}
          insumos={insumos}
          equipos={equipos}
          costosListos={!loadingCostos}
        />
      )}

      {seccion === "anillado" && (
        <PreciosAnilladoGrid
          precios={preciosAnillado}
          onReload={reload}
          onAjusteMasivo={() => {
            setAjusteTipo("anillado");
            setShowAjuste(true);
          }}
          insumos={insumos}
          equipos={equipos}
          costosListos={!loadingCostos}
        />
      )}

      {seccion === "reglas" && (
        <div className="space-y-10 pb-24 md:pb-28 max-w-4xl">
          <ConfiguracionNegocioPanel onReload={() => void reloadSilent()} />
          <ReglasNegocioPanel
            preciosImpresion={preciosImpresion}
            preciosAnillado={preciosAnillado}
            insumos={insumos}
            onChanged={() => void reloadSilent()}
          />
        </div>
      )}

      {seccion === "costos" && (
        <ConfigCostosPanel configCostos={configCostos} onReload={reload} />
      )}

      {showAjuste && (
        <AjusteMasivoSheet
          tipo={ajusteTipo}
          onAjustar={handleAjusteMasivo}
          onClose={() => setShowAjuste(false)}
        />
      )}
    </section>
  );
}
