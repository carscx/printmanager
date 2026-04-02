import type { UserRole } from "../types/auth";

export interface NavItem {
  path: string;
  icon: string;
  label: string;
}

const TAIL: NavItem[] = [
  {
    path: "/nuevo-pedido",
    icon: "fa-file-invoice-dollar",
    label: "Pedido / Presupuesto"
  },
  { path: "/insumos", icon: "fa-boxes-stacked", label: "Insumos" },
  { path: "/equipos", icon: "fa-print", label: "Equipos" },
  { path: "/precios", icon: "fa-dollar-sign", label: "Precios" },
  { path: "/plantillas-whatsapp", icon: "fa-comment-dots", label: "Plantillas WA" },
  { path: "/reportes", icon: "fa-chart-line", label: "Reportes" }
];

/** Admin: Inicio → dashboard; operador: Inicio → pedidos (sin duplicar Pedidos). */
export function buildNavItems(isAdmin: boolean, role: UserRole): NavItem[] {
  const tail =
    role === "operador"
      ? TAIL.filter(
          (i) => i.path !== "/precios" && i.path !== "/equipos"
        )
      : TAIL;
  const facturacion: NavItem = {
    path: "/facturacion",
    icon: "fa-file-invoice",
    label: "Facturación"
  };
  if (isAdmin) {
    return [
      { path: "/dashboard", icon: "fa-home", label: "Inicio" },
      { path: "/pedidos", icon: "fa-clipboard-list", label: "Pedidos" },
      ...tail,
      facturacion,
      { path: "/admin/gastos", icon: "fa-receipt", label: "Gastos fijos" },
      {
        path: "/admin/toner-modelos",
        icon: "fa-circle-nodes",
        label: "Perfiles tóner"
      }
    ];
  }
  /** Vendedor: misma sección que admin (no es el listado de pedidos). Operador no la ve. */
  const base = [{ path: "/pedidos", icon: "fa-home", label: "Inicio" }, ...tail];
  if (role !== "operador") {
    return [...base, facturacion];
  }
  return base;
}

export function isNavItemActive(path: string, pathname: string): boolean {
  if (path === "/dashboard") return pathname === "/dashboard";
  if (path === "/pedidos") {
    return pathname === "/pedidos" || pathname.startsWith("/pedido/");
  }
  if (path === "/nuevo-pedido") {
    return (
      pathname === "/nuevo-pedido" || pathname === "/venta"
    );
  }
  if (path === "/") return pathname === "/";
  if (path === "/facturacion") return pathname === "/facturacion";
  if (path === "/admin/gastos") return pathname === "/admin/gastos";
  if (path === "/admin/toner-modelos") return pathname === "/admin/toner-modelos";
  return pathname.startsWith(path);
}
