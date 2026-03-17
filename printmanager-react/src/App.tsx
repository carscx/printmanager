import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { BottomNav } from "./components/layout/BottomNav";
import { SidebarNav } from "./components/layout/SidebarNav";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { ToastContainer } from "./components/ui/Toast";
import { ConfigPanel } from "./components/config/ConfigPanel";
import { DashboardPage } from "./pages/DashboardPage";
import { NuevoPedidoPage } from "./pages/NuevoPedidoPage";
import { InsumosPage } from "./pages/InsumosPage";
import { EquiposPage } from "./pages/EquiposPage";
import { PreciosPage } from "./pages/PreciosPage";
import { LoginPage } from "./pages/LoginPage";
import HistorialPage from "./pages/HistorialPage";
import ReportesPage from "./pages/ReportesPage";
import { WhatsappPreviewPage } from "./pages/WhatsappPreviewPage";
import { useConfig } from "./hooks/useConfig";
import { useAuth } from "./hooks/useAuth";
import { showToast } from "./components/ui/Toast";

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const { settings, loading: configLoading, saveAll } = useConfig(!!user);
  const [showConfig, setShowConfig] = useState(false);

  const handleSaveConfig = async (values: Record<string, string>) => {
    try {
      await saveAll(values);
      showToast("CONFIGURACIÓN GUARDADA");
    } catch {
      showToast("ERROR AL GUARDAR CONFIG", "error");
    }
  };

  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
  };

  // Show spinner while checking auth session
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

  // If not authenticated, show login (wrapped in Router for Navigate to work)
  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    );
  }

  // Authenticated — wait for config
  if (configLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <i className="fas fa-circle-notch fa-spin fa-2x text-blue-600 mb-4" />
          <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">
            Cargando configuración...
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="bg-slate-50 min-h-screen pb-20 lg:pb-6 font-sans text-slate-900">
        <div className="flex lg:max-w-7xl lg:mx-auto">
          <SidebarNav />
          <div className="flex-1">
            <div className="px-3 pt-3 pb-2 lg:px-8 lg:pt-4">
              <Header
                onOpenSettings={() => setShowConfig(true)}
                user={user}
                onLogout={logout}
              />
            </div>
            <main className="px-3 lg:px-8">
              <Routes>
                <Route
                  path="/"
                  element={
                    <ProtectedRoute user={user}>
                      <DashboardPage settings={settings} />
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
                  path="/precios"
                  element={
                    <ProtectedRoute user={user}>
                      <PreciosPage />
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
                      <EquiposPage />
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
                  path="/pedido/:id/whatsapp"
                  element={
                    <ProtectedRoute user={user}>
                      <WhatsappPreviewPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="*"
                  element={<DashboardPage settings={settings} />}
                />
              </Routes>
            </main>
          </div>
        </div>
        <BottomNav />
        <ToastContainer />
        {showConfig && (
          <ConfigPanel
            settings={settings}
            onSave={handleSaveConfig}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
    </BrowserRouter>
  );
}
