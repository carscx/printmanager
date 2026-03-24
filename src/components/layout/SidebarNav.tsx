import { useNavigate, useLocation } from "react-router-dom";
import { buildNavItems, isNavItemActive } from "../../config/navItems";
import { useStockBajo } from "../../hooks/useInsumos";
import { StockAlertasCriticas } from "../dashboard/StockAlertasCriticas";
import type { UserRole } from "../../types/auth";

export function SidebarNav({
  isAdmin,
  role
}: {
  isAdmin: boolean;
  role: UserRole;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const items = buildNavItems(isAdmin, role);
  const { alertas } = useStockBajo(true);

  return (
    <aside className="hidden lg:flex flex-col w-56 min-h-screen bg-white border-r border-slate-100 py-8 px-4 shadow-sm">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-2.5 h-8 bg-blue-600 rounded-full shadow-sm" />
        <span className="text-xl font-black italic uppercase tracking-tighter">
          Gestión Moni
        </span>
      </div>
      <nav className="flex flex-col gap-1 flex-1 min-h-0">
        {items.map((item) => {
          const isActive = isNavItemActive(item.path, location.pathname);
          return (
            <button
              key={`${item.path}-${item.label}`}
              onClick={() =>
                navigate(
                  item.path,
                  item.path === "/nuevo-pedido"
                    ? { state: { modo: "nuevo" } }
                    : undefined
                )
              }
              className={`flex items-center gap-3 px-4 py-3 rounded-sm font-bold text-base transition-colors text-left w-full ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow"
                  : "text-slate-500 hover:bg-slate-50 hover:text-blue-600"
              }`}
            >
              <i className={`fas ${item.icon} text-lg shrink-0`} />
              <span className="flex-1 min-w-0 text-left">{item.label}</span>
              {item.path === "/insumos" && alertas.length > 0 && (
                <span
                  className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center"
                  title="Insumos en o bajo el mínimo"
                >
                  {alertas.length > 99 ? "99+" : alertas.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto pt-4 border-t border-slate-100 shrink-0">
        <StockAlertasCriticas alertas={alertas} compact />
      </div>
    </aside>
  );
}
