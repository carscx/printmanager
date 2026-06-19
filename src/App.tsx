import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { BottomNav } from "./components/layout/BottomNav";
import { SidebarNav } from "./components/layout/SidebarNav";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { AdminRoute } from "./components/layout/AdminRoute";
import { ToastContainer } from "./components/ui/Toast";
import { HomeRedirect } from "./pages/HomeRedirect";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { PedidosPage } from "./pages/PedidosPage";
import { NuevoPedidoPage } from "./pages/NuevoPedidoPage";
import { VentaPresupuestoPage } from "./pages/VentaPresupuestoPage";
import { InsumosPage } from "./pages/InsumosPage";
import { EquiposPage } from "./pages/EquiposPage";
import { PreciosPage } from "./pages/PreciosPage";
import { LoginPage } from "./pages/LoginPage";
import HistorialPage from "./pages/HistorialPage";
import ReportesPage from "./pages/ReportesPage";
import { WhatsappPreviewPage } from "./pages/WhatsappPreviewPage";
import { PlantillasWhatsappPage } from "./pages/PlantillasWhatsappPage";
import { FacturacionPage } from "./pages/FacturacionPage";
import { GastosFijosPage } from "./pages/GastosFijosPage";
import { TonerModelosPage } from "./pages/TonerModelosPage";
import { useAuth } from "./hooks/AuthContext";
import { OfflineBanner } from "./components/ui/OfflineBanner";
import ReloadPrompt from "./components/ReloadPrompt";
import { NonOperadorRoute } from "./components/layout/NonOperadorRoute";
import type { AuthUser } from "./types/auth";

function LoginWithHomeRedirect({
  login,
  onLoginSuccess
}: {
  login: (email: string, password: string) => Promise<unknown>;
  onLoginSuccess: () => void;
}) {
  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
    onLoginSuccess();
  };
  return <LoginPage onLogin={handleLogin} />;
}

function AuthenticatedShell({
  user,
  onLogout,
  postLoginRedirect,
  onConsumePostLoginRedirect
}: {
  user: AuthUser;
  onLogout: () => void;
  postLoginRedirect: boolean;
  onConsumePostLoginRedirect: () => void;
}) {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (!postLoginRedirect) return;
    if (user.role === "admin") {
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/pedidos", { replace: true });
    }
    onConsumePostLoginRedirect();
  }, [postLoginRedirect, navigate, user.role, onConsumePostLoginRedirect]);

  return (
    <div className="bg-slate-50 min-h-screen pb-20 lg:pb-6 font-sans text-slate-900">
      <div className="flex lg:max-w-7xl lg:mx-auto">
        <SidebarNav isAdmin={user.role === "admin"} role={user.role} />
        <div className="flex-1 min-w-0">
          <div className="px-3 pt-3 pb-2 lg:px-8 lg:pt-4">
            <Header
              onOpenSettings={
                user.role === "operador"
                  ? undefined
                  : () => navigate("/precios")
              }
              user={user}
              onLogout={onLogout}
            />
          </div>
          <main className="px-3 lg:px-8 min-w-0">
            <Routes>
              <Route
                path="/"
                element={
                  <ProtectedRoute user={user}>
                    <HomeRedirect />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute user={user}>
                    <AdminRoute>
                      <AdminDashboardPage />
                    </AdminRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pedidos"
                element={
                  <ProtectedRoute user={user}>
                    <PedidosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/nuevo-pedido"
                element={
                  <ProtectedRoute user={user}>
                    <NuevoPedidoPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/venta"
                element={
                  <ProtectedRoute user={user}>
                    <VentaPresupuestoPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/precios"
                element={
                  <ProtectedRoute user={user}>
                    <PreciosPage soloLectura={user.role === "operador"} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/insumos"
                element={
                  <ProtectedRoute user={user}>
                    <InsumosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/equipos"
                element={
                  <ProtectedRoute user={user}>
                    <NonOperadorRoute user={user}>
                      <EquiposPage />
                    </NonOperadorRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/historial"
                element={
                  <ProtectedRoute user={user}>
                    <HistorialPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reportes"
                element={
                  <ProtectedRoute user={user}>
                    <ReportesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/facturacion"
                element={
                  <ProtectedRoute user={user}>
                    <NonOperadorRoute user={user}>
                      <FacturacionPage />
                    </NonOperadorRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/gastos"
                element={
                  <ProtectedRoute user={user}>
                    <AdminRoute>
                      <GastosFijosPage />
                    </AdminRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/toner-modelos"
                element={
                  <ProtectedRoute user={user}>
                    <AdminRoute>
                      <TonerModelosPage />
                    </AdminRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/facturacion-arca"
                element={<Navigate to="/facturacion" replace />}
              />
              <Route
                path="/pedido/:id/whatsapp"
                element={
                  <ProtectedRoute user={user}>
                    <WhatsappPreviewPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/plantillas-whatsapp"
                element={
                  <ProtectedRoute user={user}>
                    <PlantillasWhatsappPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="*"
                element={
                  <ProtectedRoute user={user}>
                    <Navigate to="/" replace />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </div>
      <BottomNav isAdmin={user.role === "admin"} role={user.role} />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const [postLoginRedirect, setPostLoginRedirect] = useState(false);

  const onLoginSuccess = useCallback(() => setPostLoginRedirect(true), []);
  const onConsumePostLoginRedirect = useCallback(
    () => setPostLoginRedirect(false),
    []
  );

  useEffect(() => {
    if (!user) setPostLoginRedirect(false);
  }, [user]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <i className="fas fa-circle-notch fa-spin fa-2x text-blue-600 mb-4" />
          <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ReloadPrompt />
      {!user ? (
        <>
          <OfflineBanner />
          <Routes>
            <Route
              path="*"
              element={
                <LoginWithHomeRedirect
                  login={login}
                  onLoginSuccess={onLoginSuccess}
                />
              }
            />
          </Routes>
          <ToastContainer />
        </>
      ) : (
        <>
          <OfflineBanner />
          <AuthenticatedShell
            user={user}
            onLogout={logout}
            postLoginRedirect={postLoginRedirect}
            onConsumePostLoginRedirect={onConsumePostLoginRedirect}
          />
        </>
      )}
    </BrowserRouter>
  );
}
