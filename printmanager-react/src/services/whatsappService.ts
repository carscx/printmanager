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

function buildDetalle(items: PedidoItem[]): string {
  if (items.length === 0) return "- (sin items)\n";
  return items
    .map((it) => {
      const paginas = it.paginas || 0;
      const copias = it.copias ?? 1;
      const tipo = it.tipo_impresion || "B/N";
      const ani = it.anillado ? ` + ${it.anillado}` : "";
      const copiasTxt = copias > 1 ? ` x${copias}` : "";
      return `- ${paginas} pág ${tipo}${ani}${copiasTxt}`;
    })
    .join("\n");
}

function valueFromConfig(datosPago: ConfigCosto[], key: string): string {
  return datosPago.find((c) => c.key === key)?.value ?? "";
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
    "{{observaciones}}": pedido.observaciones || ""
  };

  let cuerpo = plantilla.cuerpo;
  for (const [token, val] of Object.entries(replacements)) {
    cuerpo = cuerpo.replaceAll(token, val);
  }

  // Convertir secuencias literales "\n" en saltos de línea reales
  cuerpo = cuerpo.replace(/\\n/g, "\n");

  return cuerpo;
}

