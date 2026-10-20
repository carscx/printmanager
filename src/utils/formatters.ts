import { toCalendarDateYmd } from "./dateAr";

export function formatCurrency(amount: number | string | null | undefined): string {
  const n = Number(amount);
  return `$${(Number.isFinite(n) ? n : 0).toLocaleString("es-AR")}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR");
}

export function formatDateFromInput(dateStr: string): string {
  const ymd = toCalendarDateYmd(dateStr);
  if (!ymd) return "";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR");
}
