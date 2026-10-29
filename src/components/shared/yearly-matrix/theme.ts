/**
 * Tema visual por razón social y helpers compartidos entre las vistas anuales
 * de Ingresos y Egresos (matrices 12 meses agrupadas por LegalEntity).
 */

export interface EntityTheme {
  dot: string;
  ring: string;
  bg: string;
  text: string;
}

export const ENTITY_THEME: Record<string, EntityTheme> = {
  CRT: { dot: "bg-orange-500", ring: "ring-orange-200", bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300" },
  TSR: { dot: "bg-blue-500", ring: "ring-blue-200", bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300" },
  QHS: { dot: "bg-emerald-500", ring: "ring-emerald-200", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300" },
  JCL: { dot: "bg-violet-500", ring: "ring-violet-200", bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300" },
};

export const DEFAULT_THEME: EntityTheme = {
  dot: "bg-slate-500",
  ring: "ring-slate-200",
  bg: "bg-slate-50 dark:bg-slate-900/30",
  text: "text-slate-700 dark:text-slate-300",
};

export function themeFor(code: string): EntityTheme {
  return ENTITY_THEME[code] ?? DEFAULT_THEME;
}

export const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

/**
 * Montos compactos para celdas/subtotales de la matriz ("$1.2k", "—" si 0).
 * OJO: el output difiere a propósito de formatMXNCompact ("$1.2 M") — las
 * celdas de la matriz son muy angostas.
 */
export function compactMxn(n: number): string {
  if (n === 0) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}
