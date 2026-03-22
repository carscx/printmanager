/**
 * Desplaza la ventana para que el campo quede visible bajo barras fijas.
 * Evita depender solo de scrollIntoView (a veces no mueve el scroll principal).
 */
export function scrollFieldIntoView(
  element: HTMLElement | null,
  options?: { offsetTop?: number; focusAfterMs?: number; thenFocus?: () => void }
): void {
  if (!element || typeof window === "undefined") return;
  const offset = options?.offsetTop ?? 96;
  const focusAfter = options?.focusAfterMs ?? 420;

  requestAnimationFrame(() => {
    const rect = element.getBoundingClientRect();
    const top = rect.top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

    if (options?.thenFocus) {
      window.setTimeout(() => options.thenFocus!(), focusAfter);
    }
  });
}
