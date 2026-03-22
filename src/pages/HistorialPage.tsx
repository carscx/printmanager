import { Navigate } from "react-router-dom";

/** Compatibilidad: la lista unificada vive en `/pedidos`. */
const HistorialPage = () => <Navigate to="/pedidos" replace />;

export default HistorialPage;
