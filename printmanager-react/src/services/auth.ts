import { sb } from "../config/supabase";
import type { AuthUser, UserRole } from "../types/auth";
import type { User, Session } from "@supabase/supabase-js";

function mapUser(user: User): AuthUser {
  // Custom claim inyectado en app_metadata por el trigger de DB
  const role = (user.app_metadata?.role as UserRole) ?? "operador";
  const name = (user.user_metadata?.full_name as string) ?? "";
  return {
    id: user.id,
    email: user.email ?? "",
    name,
    role,
    raw: user
  };
}

export async function login(
  email: string,
  password: string
): Promise<AuthUser> {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return mapUser(data.user);
}

export async function logout(): Promise<void> {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<{
  user: AuthUser;
  session: Session;
} | null> {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  return { user: mapUser(data.session.user), session: data.session };
}

export function onAuthChange(callback: (user: AuthUser | null) => void) {
  return sb.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ? mapUser(session.user) : null);
  });
}
