import { sb } from "../config/supabase";
import type { AuthUser, UserRole } from "../types/auth";
import type { User, Session } from "@supabase/supabase-js";

function nombreDesdeUserMetadata(user: User): string {
  const m = user.user_metadata as Record<string, string | undefined> | undefined;
  if (!m) return "";
  return (
    m.full_name?.trim() ||
    m.name?.trim() ||
    (m.display_name as string | undefined)?.trim() ||
    ""
  );
}

/**
 * Nombre visible: prioriza `profiles.full_name` (tabla pública, triggers en sql/02 y sql/18).
 * Si está vacío, user_metadata de Auth (full_name / name / display_name).
 */
function mapUser(user: User, profileFullName?: string | null): AuthUser {
  // Custom claim inyectado en app_metadata por el trigger de DB
  const role = (user.app_metadata?.role as UserRole) ?? "operador";
  const name =
    profileFullName?.trim() ||
    nombreDesdeUserMetadata(user) ||
    "";
  return {
    id: user.id,
    email: user.email ?? "",
    name,
    role,
    raw: user
  };
}

async function fetchProfileFullName(userId: string): Promise<string | null> {
  const { data, error } = await sb
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("auth: no se pudo leer profiles.full_name", error.message);
    return null;
  }
  const row = data as { full_name: string | null } | null;
  return row?.full_name?.trim() || null;
}

async function mapUserWithProfile(user: User): Promise<AuthUser> {
  const fullName = await fetchProfileFullName(user.id);
  return mapUser(user, fullName);
}

export async function login(
  email: string,
  password: string
): Promise<AuthUser> {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return mapUserWithProfile(data.user);
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
  const user = await mapUserWithProfile(data.session.user);
  return { user, session: data.session };
}

export function onAuthChange(callback: (user: AuthUser | null) => void) {
  return sb.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }
    void mapUserWithProfile(session.user).then(callback);
  });
}
