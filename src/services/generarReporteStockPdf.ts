import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Insumo } from "../types/insumo";
import { INSUMO_CATEGORIA_LABELS } from "../types/insumo";
import {
  stockFisicoTexto,
  stockHumanoTexto,
  ultimoPrecioCompraBulto,
  valorInventarioUltimoPrecioBulto
} from "../utils/insumoStockHuman";

type JsPDFWithPlugin = jsPDF & {
  lastAutoTable?: { finalY: number };
};

function formatArDateTime(): string {
  return new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function formatNumAr(n: number, opts?: { prefix?: string }): string {
  const p = opts?.prefix ?? "";
  return `${p}${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Convierte el favicon SVG público a PNG (data URL) para addImage.
 * Si falla (CORS, canvas), devuelve null.
 */
export async function cargarLogoAppPngDataUrl(): Promise<string | null> {
  try {
    const base = import.meta.env.BASE_URL || "/";
    const res = await fetch(`${base}favicon.svg`);
    if (!res.ok) return null;
    const svg = await res.text();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("img"));
      img.src = url;
    });
    const w = 48;
    const h = 46;
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return null;
    }
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export interface OpcionesReporteStockPdf {
  insumos: Insumo[];
  /** Texto que describe filtros activos (categoría, búsqueda, inactivos). */
  filtrosDescripcion: string;
}

/**
 * PDF: stock en BD; papel/tóner en bultos vía rendimiento; tinta en litros (ml÷1000) × $/litro.
 */
export async function generarReporteStockPdf(
  opts: OpcionesReporteStockPdf
): Promise<void> {
  const { insumos, filtrosDescripcion } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  const logoDataUrl = await cargarLogoAppPngDataUrl();
  const logoW = 14;
  const logoH = 13;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, y, logoW, logoH);
    } catch {
      /* logo opcional */
    }
  }

  const textLeft = logoDataUrl ? margin + logoW + 4 : margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 32, 42);
  doc.text("Reporte de Stock - Gestión Moni", textLeft, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(82, 88, 102);
  doc.text(formatArDateTime(), textLeft, y + 11);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const filtrosLines = doc.splitTextToSize(
    filtrosDescripcion,
    pageW - margin * 2 - (logoDataUrl ? logoW + 4 : 0)
  );
  doc.text(filtrosLines, textLeft, y + 16);

  y = y + (logoDataUrl ? 24 : 22);

  const body: string[][] = [];
  let capitalTotal = 0;

  for (const ins of insumos) {
    const valor = valorInventarioUltimoPrecioBulto(ins);
    const pBulto = ultimoPrecioCompraBulto(ins);
    capitalTotal += valor;
    body.push([
      ins.nombre,
      INSUMO_CATEGORIA_LABELS[ins.categoria],
      stockFisicoTexto(ins),
      stockHumanoTexto(ins),
      pBulto > 0 ? formatNumAr(pBulto, { prefix: "$" }) : "—",
      formatNumAr(valor, { prefix: "$" })
    ]);
  }

  if (body.length === 0) {
    body.push([
      "Sin insumos con los filtros actuales",
      "—",
      "—",
      "—",
      "—",
      "—"
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [
      [
        "Nombre del insumo",
        "Categoría",
        "Stock físico (BD)",
        "Stock (bultos / L)",
        "Últ. precio compra",
        "Valor total"
      ]
    ],
    body,
    theme: "striped",
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center"
    },
    styles: {
      fontSize: 8,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.1
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 24 },
      2: { halign: "right", cellWidth: 28 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 26 },
      5: { halign: "right", cellWidth: 28 }
    },
    margin: { left: margin, right: margin },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2
  });

  const lastY =
    (doc as JsPDFWithPlugin).lastAutoTable?.finalY ?? y + 30;

  let boxY = lastY + 10;
  const notaLeg = doc.splitTextToSize(
    "Papel/tóner: valor = (stock ÷ rendimiento) × precio por bulto. Tinta: valor = (ml ÷ 1000) × precio por litro. Sin costo promedio.",
    pageW - margin * 2 - 8
  );
  const lineH = 3.5;
  const boxH = 18 + Math.max(0, (notaLeg.length - 1) * lineH);

  if (boxY + boxH > pageH - margin) {
    doc.addPage();
    boxY = margin;
  }

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(148, 163, 184);
  doc.roundedRect(margin, boxY, pageW - margin * 2, boxH, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("Capital total en stock", margin + 4, boxY + 8);

  doc.setFontSize(12);
  doc.setTextColor(16, 185, 129);
  doc.text(
    formatNumAr(capitalTotal, { prefix: "$" }),
    pageW - margin,
    boxY + 8,
    { align: "right" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(notaLeg, margin + 4, boxY + 14);

  const safeName = `stock-gestion-moni-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(safeName);
}
