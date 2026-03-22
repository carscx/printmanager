/** Fecha calendario YYYY-MM-DD en America/Argentina/Buenos_Aires (alineado con vistas SQL). */
export function toDateStringAR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

/** Suma días al “hoy” local y devuelve YYYY-MM-DD en zona AR (para entregas rápidas). */
export function addCalendarDaysFromTodayAR(dias: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return toDateStringAR(d);
}
