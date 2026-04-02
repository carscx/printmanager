/**
 * Debe coincidir con `public.normalizar_texto_busqueda` (sql/58_pedidos_busqueda_sin_acentos.sql).
 */
const ACCENTED =
  "áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ";
const PLAIN =
  "aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN";

export function normalizarTextoBusquedaPedido(s: string): string {
  const t = s.trim().toLowerCase();
  let out = "";
  for (const ch of t) {
    const i = ACCENTED.indexOf(ch);
    out += i >= 0 ? PLAIN[i]! : ch;
  }
  return out;
}

/** Evita que % y _ actúen como comodines en ILIKE. */
export function escaparPatronIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Caracteres que rompen la sintaxis `.or(...)` de PostgREST si quedan sin escapar.
 */
export function sanitizarTextoParaFiltroOr(s: string): string {
  return s.replace(/[,()]/g, " ").trim();
}

/** Patrón listo para `ILIKE %…%` en PostgREST (normalizado + seguro). */
export function patronBusquedaPedidoParaSql(raw: string): string {
  const limpio = sanitizarTextoParaFiltroOr(raw.trim());
  if (!limpio) return "";
  return escaparPatronIlike(normalizarTextoBusquedaPedido(limpio));
}
