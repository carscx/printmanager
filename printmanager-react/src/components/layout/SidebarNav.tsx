import { useNavigate, useLocation } from "react-router-dom";

// Reutilizamos el mismo array de navegación que BottomNav
export const NAV_ITEMS = [
  { path: "/", icon: "fa-clipboard-list", label: "Pedidos" },
  { path: "/nuevo-pedido", icon: "fa-plus-circle", label: "Nuevo Pedido" },
  { path: "/insumos", icon: "fa-boxes-stacked", label: "Insumos" },
  { path: "/equipos", icon: "fa-print", label: "Equipos" },
  { path: "/precios", icon: "fa-dollar-sign", label: "Precios" },
  { path: "/historial", icon: "fa-clock-rotate-left", label: "Historial" },
  { path: "/reportes", icon: "fa-chart-line", label: "Reportes" }
];

export function SidebarNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="hidden lg:flex flex-col w-56 min-h-screen bg-white border-r border-slate-100 py-8 px-4 gap-2 shadow-sm">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-2.5 h-8 bg-blue-600 rounded-full shadow-sm" />
        <span className="text-xl font-black italic uppercase tracking-tighter">
          Gestión Moni
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-base transition-colors text-left ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow"
                  : "text-slate-500 hover:bg-slate-50 hover:text-blue-600"
              }`}
            >
              <i className={`fas ${item.icon} text-lg`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
