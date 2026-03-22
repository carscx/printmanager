import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] bg-amber-500 text-amber-950 text-center py-2.5 px-4 text-xs font-black uppercase tracking-widest shadow-lg"
      role="status"
    >
      <i className="fas fa-wifi-slash mr-2" />
      Sin conexión — revisá la red. Los datos pueden no guardarse.
    </div>
  );
}
