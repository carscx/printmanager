import { sb } from "../config/supabase";
import type { AuthUser, UserRole } from "../types/auth";
import type { User, Session } from "@supabase/supabase-js";

const ROLES: UserRole[] = ["admin", "operador", "vendedor"];

function isUserRole(r: unknown): r is UserRole {
  return typeof r === "string" && ROLES.includes(r as UserRole);
}

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
 * Nombre: prioriza `profiles.full_name`; si no, user_metadata de Auth.
 * Rol: prioriza `profiles.role` (fuente de verdad en BD); si no, app_metadata del JWT.
 */
function mapUser(
  user: User,
  profile?: { full_name?: string | null; role?: UserRole | null } | null
): AuthUser {
  const roleFromProfile =
    profile?.role && isUserRole(profile.role) ? profile.role : null;
  const roleJwt = user.app_metadata?.role;
  const role: UserRole =
    roleFromProfile ??
    (isUserRole(roleJwt) ? roleJwt : null) ??
    "operador";
  const name =
    profile?.full_name?.trim() ||
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

/** PostgREST puede devolver enum como string; normalizar por si acaso. */
function roleDesdeFila(value: unknown): UserRole | null {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return isUserRole(s) ? s : null;
}

async function fetchProfileForSessionOnce(
  userId: string
): Promise<{
  full_name: string | null;
  role: UserRole | null;
  ok: boolean;
}> {
  const { data, error } = await sb
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("auth: no se pudo leer profiles", error.message);
    return { full_name: null, role: null, ok: false };
  }
  const row = data as { full_name: string | null; role: unknown } | null;
  return {
    full_name: row?.full_name?.trim() || null,
    role: roleDesdeFila(row?.role),
    ok: true
  };
}

async function fetchProfileForSession(userId: string): Promise<{
  full_name: string | null;
  role: UserRole | null;
}> {
  let last = await fetchProfileForSessionOnce(userId);
  if (last.ok) {
    return { full_name: last.full_name, role: last.role };
  }
  await new Promise((r) => setTimeout(r, 200));
  last = await fetchProfileForSessionOnce(userId);
  if (last.ok) {
    return { full_name: last.full_name, role: last.role };
  }
  await new Promise((r) => setTimeout(r, 400));
  last = await fetchProfileForSessionOnce(userId);
  return { full_name: last.full_name, role: last.role };
}

async function mapUserWithProfile(user: User): Promise<AuthUser> {
  const p = await fetchProfileForSession(user.id);
  return mapUser(user, {
    full_name: p.full_name,
    role: p.role
  });
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
