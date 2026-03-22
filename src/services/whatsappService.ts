import type { Pedido, PedidoItem } from "../types/pedido";
import type { PlantillaWhatsapp } from "../types/whatsapp";
import type { ConfigCosto } from "../types/precio";
import { formatCurrency } from "../utils/formatters";

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

/** El cuerpo ya incluye variables de pago; no duplicar bloque automático. */
function cuerpoUsaPlaceholdersPago(cuerpo: string): boolean {
  return (
    /\{\{\s*alias_pago\s*\}\}/.test(cuerpo) ||
    /\{\{\s*cbu\s*\}\}/.test(cuerpo) ||
    /\{\{\s*titular_pago\s*\}\}/.test(cuerpo) ||
    /\{\{\s*banco\s*\}\}/.test(cuerpo)
  );
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

export function renderWhatsappMensaje(ctx: RenderContext): string {
  const { pedido, items, plantilla, datosPago } = ctx;

  const totalP = pedido.total || pedido.total_pedido || 0;
  const senaP = pedido.sena || 0;
  const restaP = totalP - senaP;

  const replacements: Record<string, string> = {
    "{{cliente}}": pedido.cliente,
    "{{detalle}}": buildDetalle(items),
    "{{total}}": formatCurrency(totalP),
    "{{sena}}": formatCurrency(senaP),
    "{{resta}}": formatCurrency(restaP),
    "{{estado}}": pedido.estado,
    "{{fecha_entrega}}": pedido.fecha_entrega ?? "",
    "{{alias_pago}}": valueFromConfig(datosPago, "pago_alias"),
    "{{cbu}}": valueFromConfig(datosPago, "pago_cbu"),
    "{{titular_pago}}": valueFromConfig(datosPago, "pago_titular"),
    "{{banco}}": valueFromConfig(datosPago, "pago_banco"),
    "{{observaciones}}": pedido.observaciones || ""
  };

  let cuerpo = plantilla.cuerpo;
  for (const [token, val] of Object.entries(replacements)) {
    cuerpo = cuerpo.replaceAll(token, val);
  }

  // Convertir secuencias literales "\n" en saltos de línea reales
  cuerpo = cuerpo.replace(/\\n/g, "\n");

  if (plantilla.incluir_datos_pago) {
    const bloque = buildBloqueDatosPago(datosPago);
    if (bloque && !cuerpoUsaPlaceholdersPago(plantilla.cuerpo)) {
      cuerpo = `${cuerpo.trimEnd()}\n\n${bloque}`;
    }
  }

  return cuerpo;
}

