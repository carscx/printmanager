import type { User } from "@supabase/supabase-js";

export type UserRole = "admin" | "operador";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  raw: User;
}
