/** Fecha calendario YYYY-MM-DD en America/Argentina/Buenos_Aires (alineado con vistas SQL). */
export function toDateStringAR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

/**
 * Día calendario YYYY-MM-DD.
 * Acepta un input `type="date"` o un ISO (`2026-10-20T03:00:00.000Z`)
 * y no desplaza el día por la zona horaria.
 */
export function toCalendarDateYmd(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/** Suma días al “hoy” local y devuelve YYYY-MM-DD en zona AR (para entregas rápidas). */
export function addCalendarDaysFromTodayAR(dias: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return toDateStringAR(d);
}
