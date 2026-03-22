/**
 * Abre api.whatsapp.com (wa.me) con texto de presupuesto Carscx Fotocopias.
 */

export function normalizarTelefonoWhatsapp(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54") && d.length >= 11) return d;
  if (d.length === 10 && !d.startsWith("54")) return `54${d}`;
  if (d.length === 11 && d.startsWith("9")) return `54${d}`;
  return d;
}

export function buildWhatsappPresupuestoUrl(params: {
  telefono: string;
  cliente: string;
  descripcion: string;
  monto: number;
  fechaVencimientoLabel: string;
  numeroPedido: number | string;
}): string {
  const phone = normalizarTelefonoWhatsapp(params.telefono);
  const montoFmt = params.monto.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  const text = `Hola ${params.cliente.trim() || "cliente"}, este es el presupuesto de Carscx Fotocopias para tu trabajo: ${params.descripcion.trim() || "—"}.
Total: $${montoFmt}
Vence el: ${params.fechaVencimientoLabel}
Nro de Pedido: #${params.numeroPedido}.
Para confirmar, por favor envíanos el comprobante de la seña.`;
  const encoded = encodeURIComponent(text);
  if (phone.length >= 10) {
    return `https://wa.me/${phone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function abrirWhatsappPresupuesto(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
