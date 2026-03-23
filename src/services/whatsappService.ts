import type { Pedido, PedidoItem } from "../types/pedido";
import type {
  MatchCriterioPlantilla,
  PlantillaWhatsapp
} from "../types/whatsapp";
import type { ConfigCosto } from "../types/precio";
import { formatCurrency, formatDateFromInput } from "../utils/formatters";
import { totalVentaPedido } from "../utils/pedidoTotalVenta";

interface RenderContext {
  pedido: Pedido;
  items: PedidoItem[];
  plantilla: PlantillaWhatsapp;
  datosPago: ConfigCosto[];
}

const ETIQUETA_CATEGORIA_ANILLADO: Record<string, string> = {
  chico: "Chico",
  mediano: "Mediano",
  grande: "Grande"
};

/**
 * Texto de anillado para el cliente (WhatsApp): "Anillado Chico|Mediano|Grande",
 * sin mm de espiral ni "hasta X hjs".
 */
function anilladoTextoCliente(anillado: string | null | undefined): string {
  const t = (anillado ?? "").trim();
  if (!t) return "";
  const cat = t.match(/^(Chico|Mediano|Grande)\s*·/i);
  if (cat) {
    const key = cat[1].toLowerCase();
    const nombre = ETIQUETA_CATEGORIA_ANILLADO[key] ?? cat[1];
    return `Anillado ${nombre}`;
  }
  const sinMedida = t
    .replace(/\s*\d+mm/gi, "")
    .replace(/\s*\(hasta\s*\d+\s*hjs\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const soloCat = sinMedida.match(/^(Chico|Mediano|Grande)$/i);
  if (soloCat) {
    const key = soloCat[1].toLowerCase();
    const nombre = ETIQUETA_CATEGORIA_ANILLADO[key] ?? soloCat[1];
    return `Anillado ${nombre}`;
  }
  return sinMedida || "Anillado";
}

function buildDetalle(items: PedidoItem[]): string {
  if (items.length === 0) return "- (sin items)\n";
  return items
    .map((it) => {
      const paginas = it.paginas || 0;
      const copias = it.copias ?? 1;
      const tipo = it.tipo_impresion || "B/N";
      const aniLabel = anilladoTextoCliente(it.anillado);
      const ani = aniLabel ? ` + ${aniLabel}` : "";
      const copiasTxt = copias > 1 ? ` x${copias}` : "";
      return `- ${paginas} pág ${tipo}${ani}${copiasTxt}`;
    })
    .join("\n");
}

function valueFromConfig(datosPago: ConfigCosto[], key: string): string {
  return datosPago.find((c) => c.key === key)?.value ?? "";
}

function buildBloqueDatosPago(datosPago: ConfigCosto[]): string {
  const alias = valueFromConfig(datosPago, "pago_alias").trim();
  const cbu = valueFromConfig(datosPago, "pago_cbu").trim();
  const tit = valueFromConfig(datosPago, "pago_titular").trim();
  const banco = valueFromConfig(datosPago, "pago_banco").trim();
  const lines: string[] = [];
  if (alias) lines.push(`Alias: ${alias}`);
  if (cbu) lines.push(`CBU: ${cbu}`);
  if (tit) lines.push(`Titular: ${tit}`);
  if (banco) lines.push(`Banco: ${banco}`);
  if (lines.length === 0) return "";
  return `*Datos de pago*\n${lines.join("\n")}`;
}

/** Texto al final del mensaje cuando la plantilla pide datos de pago pero no hay nada cargado en Tarifas. */
const BLOQUE_PAGO_VACIO =
  "*Datos de pago*\n_(Configurá alias, CBU y titular en Tarifas → Pagos / resumen.)_";

/** Tolerancia en moneda local para considerar “pagó el total”. */
const EPS_PESOS = 0.5;

function leerMatchCriterio(p: PlantillaWhatsapp): MatchCriterioPlantilla {
  const m = (p as PlantillaWhatsapp & { match_criterio?: string }).match_criterio;
  if (
    m === "any" ||
    m === "pago_total" ||
    m === "con_sena" ||
    m === "sin_sena"
  ) {
    return m;
  }
  return "any";
}

/**
 * Criterio de pago del pedido (no depende del estado; se usa junto a `match_criterio` de la plantilla).
 */
export function criterioPagoDesdePedido(
  pedido: Pedido
): MatchCriterioPlantilla {
  const totalP = totalVentaPedido(pedido) || 0;
  const senaP = Number(pedido.sena ?? 0) || 0;
  if (totalP <= EPS_PESOS) {
    if (senaP > EPS_PESOS) return "con_sena";
    return "sin_sena";
  }
  if (senaP >= totalP - EPS_PESOS) return "pago_total";
  if (senaP > EPS_PESOS) return "con_sena";
  return "sin_sena";
}

/** Cliente pagó el total (seña cubre el importe del pedido). */
export function esPagoTotalAnticipado(pedido: Pedido): boolean {
  return criterioPagoDesdePedido(pedido) === "pago_total";
}

/**
 * Elige plantilla por `estado_destino` (ya filtrado) + `match_criterio` vs situación de pago del pedido.
 * Si no hay coincidencia exacta, usa la plantilla con criterio `any`; si no existe, la primera.
 */
export function selectPlantillaParaPedido(
  pedido: Pedido,
  plantillas: PlantillaWhatsapp[]
): PlantillaWhatsapp | null {
  if (!plantillas.length) return null;
  const necesario = criterioPagoDesdePedido(pedido);

  const exacta = plantillas.find((p) => leerMatchCriterio(p) === necesario);
  if (exacta) return exacta;

  const respaldo = plantillas.find((p) => leerMatchCriterio(p) === "any");
  if (respaldo) return respaldo;

  return plantillas[0];
}

export function renderWhatsappMensaje(ctx: RenderContext): string {
  const { pedido, items, plantilla, datosPago } = ctx;

  const totalP = totalVentaPedido(pedido) || 0;
  const senaP = Number(pedido.sena ?? 0) || 0;
  const restaP = Math.max(0, totalP - senaP);
  const pagoTotal = esPagoTotalAnticipado(pedido);

  const lineaSena =
    pagoTotal || senaP <= EPS_PESOS
      ? ""
      : `💰 Seña: ${formatCurrency(senaP)} · Resto a pagar: ${formatCurrency(restaP)}`;
  const fechaEntregaTexto = pedido.fecha_entrega
    ? formatDateFromInput(pedido.fecha_entrega)
    : "";

  const replacements: Record<string, string> = {
    "{{cliente}}": pedido.cliente,
    "{{detalle}}": buildDetalle(items),
    "{{total}}": formatCurrency(totalP),
    "{{sena}}": formatCurrency(senaP),
    "{{resta}}": formatCurrency(restaP),
    "{{linea_sena}}": lineaSena,
    "{{estado}}": pedido.estado,
    "{{fecha_entrega}}": fechaEntregaTexto,
    "{{alias_pago}}": pagoTotal ? "" : valueFromConfig(datosPago, "pago_alias"),
    "{{cbu}}": pagoTotal ? "" : valueFromConfig(datosPago, "pago_cbu"),
    "{{titular_pago}}": pagoTotal ? "" : valueFromConfig(datosPago, "pago_titular"),
    "{{banco}}": pagoTotal ? "" : valueFromConfig(datosPago, "pago_banco"),
    "{{observaciones}}": pedido.observaciones || ""
  };

  let cuerpo = plantilla.cuerpo;
  for (const [token, val] of Object.entries(replacements)) {
    cuerpo = cuerpo.replaceAll(token, val);
  }

  // Convertir secuencias literales "\n" en saltos de línea reales
  cuerpo = cuerpo.replace(/\\n/g, "\n");

  // Casilla "Incluir datos de pago": SIEMPRE se agrega un bloque al final del mensaje
  // (no importa si el cuerpo tenía {{alias_pago}} u otras variables).
  const rawIncluir = (plantilla as { incluir_datos_pago?: unknown })
    .incluir_datos_pago;
  const incluirDatosPagoAlFinal =
    rawIncluir === true || rawIncluir === "true" || rawIncluir === 1;
  if (incluirDatosPagoAlFinal && !pagoTotal) {
    const bloque = buildBloqueDatosPago(datosPago);
    const sufijo = bloque || BLOQUE_PAGO_VACIO;
    cuerpo = `${cuerpo.trimEnd()}\n\n${sufijo}`;
  }

  return cuerpo;
}

