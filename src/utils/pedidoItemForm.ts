import type { PedidoItem } from "../types/pedido";
import {
  perfilTintaEfectivo,
  type PerfilTintaImpresion,
  type PrecioImpresion,
  type SlugLineaImpresion
} from "../types/precio";

/** Reconstruye línea, perfil de tinta y doble faz desde el ítem (prioriza tarifa vinculada). */
export function parseTipoImpresionFromItem(
  item: PedidoItem,
  precios?: PrecioImpresion[]
): {
  tipo: SlugLineaImpresion;
  perfil_tinta: PerfilTintaImpresion;
  dobleFaz: boolean;
} {
  if (item.precio_impresion_id && precios?.length) {
    const pi = precios.find((p) => p.id === item.precio_impresion_id);
    if (pi) {
      return {
        tipo: pi.tipo,
        perfil_tinta: perfilTintaEfectivo(pi),
        dobleFaz:
          typeof item.doble_faz === "boolean" ? item.doble_faz : pi.doble_faz
      };
    }
  }
  if (typeof item.doble_faz === "boolean") {
    return parseLegacyTipoImpresionFlags(item.tipo_impresion, item.doble_faz);
  }
  return parseTipoImpresionString(item.tipo_impresion);
}

function parseLegacyTipoImpresionFlags(
  tipoImpresion: string | undefined,
  dobleFaz: boolean
): {
  tipo: SlugLineaImpresion;
  perfil_tinta: PerfilTintaImpresion;
  dobleFaz: boolean;
} {
  const u = (tipoImpresion || "").toUpperCase();
  if (u.includes("STICKERS")) {
    return { tipo: "stickers", perfil_tinta: "color", dobleFaz };
  }
  if (u.includes("COLOR")) {
    return { tipo: "color", perfil_tinta: "color", dobleFaz };
  }
  if (u.includes("B/N") || u.includes("B&N")) {
    return { tipo: "bn", perfil_tinta: "bn", dobleFaz };
  }
  return { tipo: "bn", perfil_tinta: "bn", dobleFaz };
}

function parseTipoImpresionString(s: string): {
  tipo: SlugLineaImpresion;
  perfil_tinta: PerfilTintaImpresion;
  dobleFaz: boolean;
} {
  const u = (s || "").toUpperCase();
  if (u.includes("SOLO ANILLADO") || u.includes("MIGRADO")) {
    return { tipo: "bn", perfil_tinta: "bn", dobleFaz: false };
  }
  if (u.includes("STICKERS")) {
    const df = u.includes("DF") || u.includes("DOBLE FAZ");
    return { tipo: "stickers", perfil_tinta: "color", dobleFaz: df };
  }
  const color = u.includes("COLOR");
  const df = u.includes("DF") || u.includes("DOBLE FAZ");
  return {
    tipo: color ? "color" : "bn",
    perfil_tinta: color ? "color" : "bn",
    dobleFaz: df
  };
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
