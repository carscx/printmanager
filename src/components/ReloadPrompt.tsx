import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed right-0 bottom-0 m-4 p-4 border rounded-lg bg-white shadow-xl z-50 flex flex-col gap-2 border-slate-200">
      <div className="text-sm text-slate-600 font-medium">
        {offlineReady ? (
          <span>¡App lista para usar sin conexión! 🚀</span>
        ) : (
          <span>Hay una nueva versión disponible. ✨</span>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        {needRefresh && (
          <button
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 transition-colors"
            onClick={() => updateServiceWorker(true)}
          >
            Actualizar ahora
          </button>
        )}
        <button
          className="px-3 py-1.5 bg-slate-100 text-slate-500 text-xs font-semibold rounded-md hover:bg-slate-200 transition-colors"
          onClick={close}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default ReloadPrompt;