import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { BottomSheet } from "../ui/BottomSheet";
import { buildNavItems, isNavItemActive, type NavItem } from "../../config/navItems";

export type { NavItem };

/** En mobile "Más": todo excepto Pedidos y Nuevo (van fijos en la barra). */
function buildMobileMore(isAdmin: boolean): NavItem[] {
  return buildNavItems(isAdmin).filter(
    (i) => i.path !== "/pedidos" && i.path !== "/nuevo-pedido"
  );
}

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileMore = buildMobileMore(isAdmin);

  const isActive = (path: string) => isNavItemActive(path, location.pathname);

  const handleMoreItem = (path: string) => {
    navigate(path);
    setMoreOpen(false);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-100 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="flex items-stretch">
          <button
            onClick={() => navigate("/pedidos")}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 cursor-pointer transition-colors ${
              isActive("/pedidos") ? "text-blue-600" : "text-slate-400 active:text-slate-600"
            }`}
          >
            <i className="fas fa-clipboard-list text-lg" />
            <span className="text-[9px] font-bold uppercase tracking-wider">
              Pedidos
            </span>
          </button>

          <button
            onClick={() => navigate("/nuevo-pedido")}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 cursor-pointer transition-colors ${
              isActive("/nuevo-pedido") ? "text-blue-600" : "text-slate-400"
            }`}
          >
            <span className="w-12 h-12 rounded-xl bg-blue-600 shadow-lg shadow-blue-200 flex items-center justify-center -mt-5 text-white">
              <i className="fas fa-plus-circle text-lg" />
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 mt-0.5">
              Nuevo
            </span>
          </button>

          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 cursor-pointer transition-colors ${
              mobileMore.some((i) => isActive(i.path))
                ? "text-blue-600"
                : "text-slate-400 active:text-slate-600"
            }`}
          >
            <i className="fas fa-ellipsis-h text-lg" />
            <span className="text-[9px] font-bold uppercase tracking-wider">
              Más
            </span>
          </button>
        </div>
      </nav>

      <BottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Más opciones"
      >
        <div className="space-y-1 pb-6">
          {mobileMore.map((item) => (
            <button
              key={`${item.path}-${item.label}`}
              onClick={() => handleMoreItem(item.path)}
              className={`w-full flex items-center gap-4 px-4 py-4 rounded-sm text-left font-bold transition-colors cursor-pointer active:scale-[0.99] ${
                isActive(item.path)
                  ? "bg-blue-50 text-blue-700"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <i className={`fas ${item.icon} text-xl text-slate-400`} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
