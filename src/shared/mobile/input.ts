/** Fecha local de hoy en formato `<input type="date">` (YYYY-MM-DD). */
export function todayDateInput(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "12,500.50" / "$12500" → 12500.5. Devuelve NaN si no hay número. */
export function parseAmountInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  return cleaned ? Number(cleaned) : Number.NaN;
}
