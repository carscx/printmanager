import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";

/** Admin → /dashboard; operador → /pedidos */
export function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/pedidos" replace />;
}
