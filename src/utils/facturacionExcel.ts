import * as XLSX from "xlsx";
import type { LineaFacturacion } from "./facturacionBatching";

export function descargarFacturacionExcel(
  lineas: LineaFacturacion[],
  nombreArchivo: string
): void {
  const rows = lineas.map((l) => ({
    "ID Interno": l.idInterno,
    "Fecha Emisión Sugerida": l.fechaEmisionSugerida,
    Descripción: l.descripcion,
    "Importe Total": l.importeTotal
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Facturación");
  XLSX.writeFile(wb, nombreArchivo.endsWith(".xlsx") ? nombreArchivo : `${nombreArchivo}.xlsx`);
}
