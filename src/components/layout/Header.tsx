import { useLocation } from "react-router-dom";
import type { AuthUser } from "../../types/auth";

interface HeaderProps {
  onOpenSettings?: () => void;
  user: AuthUser;
  onLogout: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Pedidos",
  "/nuevo-pedido": "Pedido / Presupuesto",
  "/insumos": "Insumos",
  "/equipos": "Equipos"
};

export function Header({ onOpenSettings, user, onLogout }: HeaderProps) {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] || "Gestión Moni";

  return (
    <header className="flex justify-between items-center bg-white px-4 py-3 rounded-sm shadow-sm border border-gray-100">
      {/* Logo + page title */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-2 h-7 bg-blue-600 rounded-full flex-shrink-0" />
        <div className="min-w-0">
          <h1 className="text-base font-black tracking-tighter italic uppercase leading-none truncate lg:text-xl">
            {pageTitle}
          </h1>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate hidden sm:block">
            {user.name || user.email}
          </p>
        </div>
      </div>

      {/* Actions - minimal on mobile */}
      <div className="flex items-center gap-1.5">
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-sm active:bg-blue-600 active:text-white transition-colors cursor-pointer"
          >
            <i className="fas fa-cog" />
          </button>
        )}
        <button
          onClick={onLogout}
          className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-sm active:bg-red-500 active:text-white transition-colors cursor-pointer"
          title="Cerrar sesión"
        >
          <i className="fas fa-sign-out-alt" />
        </button>
      </div>
    </header>
  );
}
