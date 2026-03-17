export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR");
}

export function formatDateFromInput(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR");
}
