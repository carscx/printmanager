import { useNavigate, useLocation } from "react-router-dom";

interface NavItem {
  path: string;
  icon: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { path: "/", icon: "fa-clipboard-list", label: "Pedidos" },
  { path: "/insumos", icon: "fa-boxes-stacked", label: "Insumos" },
  { path: "/equipos", icon: "fa-print", label: "Equipos" },
  { path: "/nuevo-pedido", icon: "fa-plus-circle", label: "Nuevo" },
  { path: "/precios", icon: "fa-dollar-sign", label: "Precios" },
  { path: "/historial", icon: "fa-clock-rotate-left", label: "Historial" },
  { path: "/reportes", icon: "fa-chart-line", label: "Reportes" }
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-100 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex items-stretch">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);
          const isNuevo = item.path === "/nuevo-pedido";

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 cursor-pointer transition-colors ${
                isNuevo
                  ? "text-white"
                  : isActive
                    ? "text-blue-600"
                    : "text-slate-400 active:text-slate-600"
              }`}
            >
              {isNuevo ? (
                <span className="w-12 h-12 rounded-2xl bg-blue-600 shadow-lg shadow-blue-200 flex items-center justify-center -mt-5">
                  <i className={`fas ${item.icon} text-lg text-white`} />
                </span>
              ) : (
                <i className={`fas ${item.icon} text-lg`} />
              )}
              <span
                className={`text-[9px] font-bold uppercase tracking-wider ${isNuevo ? "text-blue-600 mt-0.5" : ""}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
