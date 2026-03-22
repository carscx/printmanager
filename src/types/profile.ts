import type { UserRole } from "./auth";

export interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string | null;
  comision_pct?: number | null;
}
