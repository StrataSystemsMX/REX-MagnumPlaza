import type { Prisma } from "@/generated/prisma/client";

/**
 * Formateadores de moneda y porcentaje centralizados.
 *
 * Antes existían 60+ definiciones de `new Intl.NumberFormat("es-MX", ...)`
 * dispersas por la app, con variantes inconsistentes de decimales. Toda la UI,
 * PDFs y notificaciones deben pasar por estas funciones.
 */

type Numeric = number | string | Prisma.Decimal;

// Prisma.Decimal, string ("1234.50") y number son aceptados; se normalizan a number.
function toNumber(value: Numeric): number {
  return typeof value === "number" ? value : Number(value);
}

/**
 * Moneda MXN. Por defecto 0 decimales (el caso más común en tablas y tarjetas).
 * Usa `decimals: 2` para montos exactos (pagos, estados de cuenta).
 */
export function formatMXN(value: Numeric, decimals: 0 | 1 | 2 = 0): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(value));
}

/**
 * Moneda MXN en notación compacta (p.ej. "$1.2 M"). Para ejes de gráficas.
 */
export function formatMXNCompact(value: Numeric): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

/**
 * Porcentaje. El valor entra como fracción (0.15 → "15%").
 */
export function formatPercent(value: number, decimals = 1): string {
  return new Intl.NumberFormat("es-MX", {
    style: "percent",
    maximumFractionDigits: decimals,
  }).format(value);
}
