import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Pedido, PedidoItem } from "../types/pedido";
import { formatCurrency, formatDateFromInput } from "../utils/formatters";
import { totalVentaPedido } from "../utils/pedidoTotalVenta";
import {
  esItemProductoCerrado,
  nombreProductoCerrado
} from "../utils/pedidoItemProducto";

type JsPDFWithPlugin = jsPDF & {
  lastAutoTable?: { finalY: number };
};

function formatAnillado(item: PedidoItem): string {
  const raw = String(item.anillado ?? "").trim();
  if (!raw) return "Sin anillado";
  const mm =
    typeof item.anillado_medida_mm === "number" && item.anillado_medida_mm > 0
      ? `${item.anillado_medida_mm} mm`
      : "";
  const texto = mm ? raw.replace(/\b0+\s*mm\b/gi, mm) : raw;
  const limpio = texto
    .replace(/\b0+\s*mm\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+·/g, " ·")
    .replace(/·\s*$/g, "")
    .trim();
  return limpio || "Con anillado";
}

function nombreArchivoControl(pedido: Pedido): string {
  const n = pedido.numero_publico != null ? `#${pedido.numero_publico}` : pedido.id;
  return `control-interno-pedido-${String(n).replace(/[^\w#-]+/g, "_")}.pdf`;
}

const LEYENDA_LEGAL =
  "Este comprobante es de control interno y no posee valor fiscal. Para solicitar su Factura C (Consumidor Final o Nominativa), por favor envie su CUIT/CUIL/DNI y Razon Social a karscx@gmail.com o Whatsapp +54 9 11 4190-9107 dentro de las 48hs de realizado el pago. Los servicios facturados corresponden al periodo de ejecucion del pedido.";

export type FormaPagoComprobante = "Efectivo" | "Transferencia";

export function descargarPedidoControlPdf(
  pedido: Pedido,
  formaPago: FormaPagoComprobante
): string {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  }) as JsPDFWithPlugin;
  const items = pedido.pedido_items ?? [];
  const total = totalVentaPedido(pedido);
  const fechaEntrega = pedido.fecha_entrega
    ? formatDateFromInput(pedido.fecha_entrega)
    : "Sin fecha";
  const numeroPedido = pedido.numero_publico != null ? `#${pedido.numero_publico}` : pedido.id;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("CONTROL INTERNO DE PEDIDO", 14, 18);

  doc.setTextColor(190, 24, 24);
  doc.setFontSize(20);
  doc.text("DOCUMENTO NO VALIDO COMO FACTURA", 14, 30);
  doc.setTextColor(17, 24, 39);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Pedido: ${numeroPedido}`, 14, 40);
  doc.text(`Cliente: ${pedido.cliente || "Sin nombre"}`, 14, 46);
  doc.text(`Estado: ${pedido.estado.toUpperCase()}`, 14, 52);
  doc.text(`Fecha de entrega: ${fechaEntrega}`, 14, 58);
  doc.text(`Forma de pago: ${formaPago}`, 14, 64);
  doc.text(`Total: ${formatCurrency(total)}`, 14, 70);

  autoTable(doc, {
    startY: 78,
    head: [["Archivo", "Detalle", "Anillado", "Importe"]],
    body: items.map((it, i) => {
      const copias = it.copias ?? 1;
      const detalle = esItemProductoCerrado(it)
        ? `${nombreProductoCerrado(it)}${copias > 1 ? ` x${copias}` : ""}`
        : `${it.paginas || 0} pág${copias > 1 ? ` x${copias}` : ""} · ${it.tipo_impresion || "-"}`;
      return [
        it.nombre_archivo || (esItemProductoCerrado(it) ? nombreProductoCerrado(it) : `Archivo ${i + 1}`),
        detalle,
        esItemProductoCerrado(it) ? "—" : formatAnillado(it),
        formatCurrency(Number(it.precio_unitario || 0))
      ];
    }),
    styles: { fontSize: 9, cellPadding: 2.2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    margin: { left: 14, right: 14 }
  });

  let finalY = (doc.lastAutoTable?.finalY ?? 78) + 10;
  if (finalY > 248) {
    doc.addPage("a4", "portrait");
    finalY = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`TOTAL PEDIDO: ${formatCurrency(total)}`, 14, finalY);

  let legalY = finalY + 8;
  if (legalY > 255) {
    doc.addPage("a4", "portrait");
    legalY = 20;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const legalLines = doc.splitTextToSize(LEYENDA_LEGAL, 182);
  doc.text(legalLines, 14, legalY);
  doc.setTextColor(17, 24, 39);

  const filename = nombreArchivoControl(pedido);
  doc.save(filename);
  return filename;
}
