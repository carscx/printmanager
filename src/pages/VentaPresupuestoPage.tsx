import { Navigate } from "react-router-dom";

/** Ruta legacy: mismo flujo que nuevo pedido (sin seña = presupuesto). */
export function VentaPresupuestoPage() {
  return <Navigate to="/nuevo-pedido" replace />;
}
