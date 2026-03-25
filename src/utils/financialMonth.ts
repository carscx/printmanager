/** Zona horaria usada en el negocio (misma que dashboard). */
const TZ = "America/Argentina/Buenos_Aires";

function partesFechaLocal(d: Date): { y: number; m: number; day: number } {
  const s = d.toLocaleDateString("en-CA", { timeZone: TZ });
  const [y, m, day] = s.split("-").map(Number);
  return { y, m, day };
}

/** Días del mes civil actual (AR). */
export function diasEnMesActual(): number {
  const { y, m } = partesFechaLocal(new Date());
  return new Date(y, m, 0).getDate();
}

/** Día del mes actual (1–31) en AR. */
export function diaDelMesActual(): number {
  return partesFechaLocal(new Date()).day;
}

/**
 * Fracción del mes transcurrido (día actual / días del mes).
 * Ej.: día 15 de 31 → ~0.484
 */
export function fraccionMesTranscurrido(): number {
  const d = diasEnMesActual();
  if (d <= 0) return 0;
  return Math.min(1, diaDelMesActual() / d);
}

/** Gastos fijos devengados hasta hoy (proporcional al mes). */
export function gastosFijosDevengadosHastaHoy(totalMensual: number): number {
  return totalMensual * fraccionMesTranscurrido();
}
