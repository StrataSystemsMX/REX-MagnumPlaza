import type { RentStatus } from "@/generated/prisma/enums";

// Helpers puros de la vista móvil. Viven fuera de `lib/services` para que los
// Client Components los importen sin arrastrar Prisma al bundle.

export function currentPeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** "Plaza Magnum Progreso" → "Progreso". Nombres sin prefijo se quedan igual. */
export function shortPropertyName(name: string): string {
  return name.replace(/^plaza\s+(magnum\s+)?/i, "").trim() || name;
}

/** Abreviatura bajo el código del local: "Progreso" → "Progr", "Quiroga 1" → "Quir 1". */
export function propertyAbbr(name: string): string {
  const words = shortPropertyName(name).split(/\s+/);
  // Saltamos artículos cortos: "La Chila Garmendia" → "Chila".
  const first = words.find((w) => w.length > 2 && !/^\d+$/.test(w)) ?? words[0] ?? "";
  const num = words.find((w) => /^\d+$/.test(w));
  return num ? `${first.slice(0, 4)} ${num}` : first.slice(0, 5);
}

// Conectores y sufijos societarios que no cuentan para las iniciales.
const INITIALS_STOPWORDS = new Set(["de", "del", "la", "las", "los", "el", "y", "sa", "sab", "cv", "rl"]);

/** Iniciales para avatares: "Farmacias Benavides S.A.B de C.V." → "FB", "Goyoma S.A." → "GO". */
export function initials(name: string): string {
  const words = name
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => (w.length > 1 || /\d/.test(w)) && !INITIALS_STOPWORDS.has(w.toLowerCase()));
  const [first = "", second] = words;
  return (second ? first[0]! + second[0]! : first.slice(0, 2)).toUpperCase() || "?";
}

// Orden de la lista de cobranza: lo más grave primero (README del handoff).
const SEVERITY: Record<RentStatus, number> = {
  OVERDUE_3M: 0,
  OVERDUE_2M: 1,
  OVERDUE_1M: 2,
  DUE: 3,
  PARTIAL: 4,
  PENDING: 5,
  PAID: 6,
  WAIVED: 7,
};

export function rentSeverity(status: RentStatus): number {
  return SEVERITY[status];
}

export function isOverdueStatus(status: RentStatus): boolean {
  return status === "OVERDUE_1M" || status === "OVERDUE_2M" || status === "OVERDUE_3M";
}

/** Rentas que todavía se pueden cobrar (abre el sheet de pago al tocarlas). */
export function isPayableStatus(status: RentStatus): boolean {
  return status !== "PAID" && status !== "WAIVED";
}

/** Porcentaje de cobranza → tono (mismos umbrales que el dashboard web). */
export function collectionTone(pct: number): { text: string; bar: string } {
  if (pct >= 90) return { text: "text-emerald-600", bar: "bg-emerald-500" };
  if (pct >= 70) return { text: "text-blue-600", bar: "bg-blue-500" };
  if (pct >= 50) return { text: "text-amber-600", bar: "bg-amber-500" };
  return { text: "text-rose-600", bar: "bg-rose-500" };
}
