import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { AuthUser } from "../types/auth";
import * as authService from "../services/auth";

/** Tras `login()`, `onAuthStateChange` puede pisar el usuario con rol operador si la 2.ª lectura de `profiles` falla. */
const GUARD_MS_TRAS_LOGIN = 1200;

function debePreservarRolTrasLogin(
  prev: AuthUser | null,
  next: AuthUser | null,
  loginAt: number
): boolean {
  if (!prev || !next || prev.id !== next.id) return false;
  if (Date.now() - loginAt > GUARD_MS_TRAS_LOGIN) return false;
  return prev.role === "admin" && next.role === "operador";
}

export type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  isAdmin: boolean;
};

const AuthStateContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const loginCompletadoEn = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    authService
      .getSession()
      .then((result) => {
        if (!cancelled) setUser(result?.user ?? null);
      })
      .catch((e) => {
        console.error("Auth: getSession", e);
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription }
    } = authService.onAuthChange((u) => {
      setUser((prev) => {
        if (!u) return null;
        if (debePreservarRolTrasLogin(prev, u, loginCompletadoEn.current)) {
          return prev;
        }
        return u;
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    loginCompletadoEn.current = Date.now();
    const u = await authService.login(email, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      isAdmin: user?.role === "admin"
    }),
    [user, loading, login, logout]
  );

  return (
    <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthStateContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
