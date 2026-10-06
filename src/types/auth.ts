export type UserRole = "admin" | "operador" | "vendedor";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Payload crudo del backend (compat). */
  raw: unknown;
}
