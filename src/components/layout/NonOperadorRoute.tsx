import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { AuthUser } from "../../types/auth";

/** Pantallas reservadas a admin / vendedor (p. ej. tarifas y costos). */
export function NonOperadorRoute({
  user,
  children,
  redirectTo = "/pedidos"
}: {
  user: AuthUser;
  children: ReactNode;
  redirectTo?: string;
}) {
  if (user.role === "operador") {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
}
