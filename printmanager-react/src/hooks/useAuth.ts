import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "../types/auth";
import * as authService from "../services/auth";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session on mount
    authService.getSession().then((result) => {
      setUser(result?.user ?? null);
      setLoading(false);
    });

    // Listen to auth changes
    const {
      data: { subscription }
    } = authService.onAuthChange((u) => {
      setUser(u);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await authService.login(email, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const isAdmin = user?.role === "admin";

  return { user, loading, login, logout, isAdmin };
}
