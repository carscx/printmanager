import {
  apiGet,
  apiRequest,
  getAccessToken,
  setAccessToken
} from "../config/apiClient";
import type { AuthUser, UserRole } from "../types/auth";

const ROLES: UserRole[] = ["admin", "operador", "vendedor"];

function isUserRole(r: unknown): r is UserRole {
  return typeof r === "string" && ROLES.includes(r as UserRole);
}

type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: string;
};

function mapUser(u: MeResponse): AuthUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name || "",
    role: isUserRole(u.role) ? u.role : "operador",
    raw: u
  };
}

export async function login(
  email: string,
  password: string
): Promise<AuthUser> {
  const data = await apiRequest<{
    access_token: string;
    user: MeResponse;
  }>("/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password })
  });
  setAccessToken(data.access_token);
  const user = mapUser(data.user);
  window.dispatchEvent(new CustomEvent("pm:auth-changed", { detail: user }));
  return user;
}

export async function logout(): Promise<void> {
  setAccessToken(null);
  window.dispatchEvent(new CustomEvent("pm:auth-changed", { detail: null }));
}

export async function getSession(): Promise<{
  user: AuthUser;
  session: { access_token: string };
} | null> {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const me = await apiGet<MeResponse>("/auth/me");
    return { user: mapUser(me), session: { access_token: token } };
  } catch {
    setAccessToken(null);
    return null;
  }
}

export function onAuthChange(callback: (user: AuthUser | null) => void) {
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent<AuthUser | null>).detail;
    callback(detail ?? null);
  };
  window.addEventListener("pm:auth-changed", handler);
  return {
    data: {
      subscription: {
        unsubscribe: () =>
          window.removeEventListener("pm:auth-changed", handler)
      }
    }
  };
}
