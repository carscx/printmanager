import type { PedidoItem } from "../types/pedido";

/** Reconstruye tinta y doble faz desde el ítem (prioriza flags persistidos). */
export function parseTipoImpresionFromItem(item: PedidoItem): {
  tipo: "bn" | "color";
  dobleFaz: boolean;
} {
  if (typeof item.doble_faz === "boolean") {
    const u = (item.tipo_impresion || "").toUpperCase();
    const color = u.includes("COLOR");
    return { tipo: color ? "color" : "bn", dobleFaz: item.doble_faz };
  }
  return parseTipoImpresionString(item.tipo_impresion);
}

function parseTipoImpresionString(s: string): {
  tipo: "bn" | "color";
  dobleFaz: boolean;
} {
  const u = (s || "").toUpperCase();
  if (u.includes("SOLO ANILLADO") || u.includes("MIGRADO"))
    return { tipo: "bn", dobleFaz: false };
  const color = u.includes("COLOR");
  const df = u.includes("DF") || u.includes("DOBLE FAZ");
  return { tipo: color ? "color" : "bn", dobleFaz: df };
}

export function descRecStateFromItem(item: PedidoItem): {
  showDescRec: boolean;
  descRecTipo: "descuento" | "recargo";
  descRecModo: "porcentaje" | "monto";
  descRecValor: string;
} {
  const z = {
    showDescRec: false,
    descRecTipo: "descuento" as const,
    descRecModo: "porcentaje" as const,
    descRecValor: ""
  };
  if (item.descuento_porcentaje != null && item.descuento_porcentaje > 0) {
    return {
      showDescRec: true,
      descRecTipo: "descuento",
      descRecModo: "porcentaje",
      descRecValor: String(item.descuento_porcentaje)
    };
  }
  if (item.descuento_monto != null && item.descuento_monto > 0) {
    return {
      showDescRec: true,
      descRecTipo: "descuento",
      descRecModo: "monto",
      descRecValor: String(item.descuento_monto)
    };
  }
  if (item.recargo_porcentaje != null && item.recargo_porcentaje > 0) {
    return {
      showDescRec: true,
      descRecTipo: "recargo",
      descRecModo: "porcentaje",
      descRecValor: String(item.recargo_porcentaje)
    };
  }
  if (item.recargo_monto != null && item.recargo_monto > 0) {
    return {
      showDescRec: true,
      descRecTipo: "recargo",
      descRecModo: "monto",
      descRecValor: String(item.recargo_monto)
    };
  }
  return z;
}
