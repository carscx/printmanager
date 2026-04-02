import type { TonerModeloReferencia } from "../types/tonerModelo";

/**
 * Si la migración 57 no está aplicada o falla la red, el formulario de tóner
 * sigue ofreciendo perfiles de referencia (no persisten FK hasta usar la tabla).
 */
export const TONER_MODELOS_FALLBACK: TonerModeloReferencia[] = [
  {
    id: "__fb_oficina__",
    codigo: "oficina_mixta",
    nombre: "Oficina / texto mixto",
    notas: "Referencia típica; mismo efecto que 60 g y 60 mg/cara.",
    gramos_por_cartucho: 60,
    mg_por_cara: 60,
    activo: true,
    orden: 10
  },
  {
    id: "__fb_texto_fino__",
    codigo: "texto_fino",
    nombre: "Texto fino / bajo mg",
    notas: "Menor depositación por cara.",
    gramos_por_cartucho: 60,
    mg_por_cara: 45,
    activo: true,
    orden: 20
  },
  {
    id: "__fb_graficos__",
    codigo: "graficos",
    nombre: "Gráficos / mayor cobertura",
    notas: "Más mg por cara.",
    gramos_por_cartucho: 60,
    mg_por_cara: 90,
    activo: true,
    orden: 30
  },
  {
    id: "__fb_alto__",
    codigo: "cartucho_alto",
    nombre: "Cartucho alto rendimiento (~80 g)",
    notas: "Ej. cartuchos XL.",
    gramos_por_cartucho: 80,
    mg_por_cara: 60,
    activo: true,
    orden: 40
  }
];
