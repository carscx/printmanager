import type { User } from "@supabase/supabase-js";

export type UserRole = "admin" | "operador" | "vendedor";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  raw: User;
}
