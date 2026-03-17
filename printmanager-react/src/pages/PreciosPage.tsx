import { useState } from "react";
import { usePrecios } from "../hooks/usePrecios";
import { preciosApi } from "../services/preciosApi";
import { showToast } from "../components/ui/Toast";
import { PreciosImpresionGrid } from "../components/precios/PreciosImpresionGrid.tsx";
import { PreciosAnilladoGrid } from "../components/precios/PreciosAnilladoGrid.tsx";
import { ConfigCostosPanel } from "../components/precios/ConfigCostosPanel.tsx";
import { AjusteMasivoSheet } from "../components/precios/AjusteMasivoSheet.tsx";

type SeccionActiva = "impresion" | "anillado" | "costos";

export function PreciosPage() {
  const { preciosImpresion, preciosAnillado, configCostos, loading, reload } =
    usePrecios();
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
    { id: "costos", label: "Config", icon: "fa-sliders" }
  ];

  return (
    <section className="animate-slide-in-bottom space-y-4">
      {/* Tabs de sección */}
      <div className="flex gap-2 flex-wrap">
        {secciones.map((s) => (
          <button
            key={s.id}
            onClick={() => setSeccion(s.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
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
        />
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
