import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered: ", r);
    },
    onRegisterError(error) {
      console.log("SW registration error", error);
    }
  });

  const open = offlineReady || needRefresh;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const cerrarOffline = () => {
    setOfflineReady(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-[2px]"
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reload-prompt-title"
        aria-describedby="reload-prompt-desc"
        className="w-full max-w-md rounded-sm border-2 border-slate-200 bg-white shadow-2xl p-6 sm:p-8 space-y-4 animate-fade-in"
      >
        {needRefresh ? (
          <>
            <div className="flex justify-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <i className="fas fa-arrow-rotate-right text-2xl" aria-hidden />
              </span>
            </div>
            <h2
              id="reload-prompt-title"
              className="text-center text-lg font-black text-slate-900 uppercase tracking-tight"
            >
              Nueva versión disponible
            </h2>
            <p
              id="reload-prompt-desc"
              className="text-sm text-slate-600 font-semibold text-center leading-relaxed"
            >
              Hay una actualización para la aplicación. Para seguir usando
              Printmanager con la última versión, tenés que aceptarla ahora.
            </p>
            <button
              type="button"
              className="w-full py-2.5 rounded-sm bg-slate-900 text-white text-xs font-black uppercase tracking-[0.12em] hover:bg-slate-800 active:scale-[0.99] transition-all shadow-lg"
              onClick={() => updateServiceWorker(true)}
            >
              Actualizar ahora
            </button>
          </>
        ) : (
          <>
            <h2
              id="reload-prompt-title"
              className="text-center text-lg font-black text-slate-900 uppercase tracking-tight"
            >
              Listo para trabajar sin conexión
            </h2>
            <p
              id="reload-prompt-desc"
              className="text-sm text-slate-600 font-semibold text-center leading-relaxed"
            >
              Los recursos quedaron guardados en este dispositivo. Podés
              continuar cuando quieras.
            </p>
            <button
              type="button"
              className="w-full py-2.5 rounded-sm bg-slate-900 text-white text-xs font-black uppercase tracking-[0.12em] hover:bg-slate-800 active:scale-[0.99] transition-all"
              onClick={cerrarOffline}
            >
              Continuar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ReloadPrompt;
