import { capitalizeFirst } from "@/lib/utils";

/**
 * Formateadores de fecha centralizados (locale es-MX, zona UTC).
 *
 * Las fechas del dominio son date-only en UTC (periodos de renta, vencimientos),
 * por eso `timeZone: "UTC"` está fijo: evita corrimientos de día por zona horaria
 * local. Las funciones que muestran el mes ya aplican `capitalizeFirst`
 * internamente — el producto siempre muestra el mes con mayúscula inicial
 * (ver nota en utils.ts), así que NO hay que envolver el resultado.
 */

type DateInput = Date | string;

/** "Mayo de 2026" — periodo con mes completo. */
export function formatPeriodLong(date: DateInput): string {
  return capitalizeFirst(
    new Intl.DateTimeFormat("es-MX", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(date)),
  );
}

/** "May 2026" — periodo con mes abreviado. */
export function formatPeriodShort(date: DateInput): string {
  return capitalizeFirst(
    new Intl.DateTimeFormat("es-MX", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(date)),
  );
}

/** "05 may 2026" — fecha completa con día (mes abreviado). */
export function formatDate(date: DateInput): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

/** "Mayo" — solo mes completo (encabezados de KPIs). */
export function formatMonthLong(date: DateInput): string {
  return capitalizeFirst(
    new Intl.DateTimeFormat("es-MX", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(date)),
  );
}

/** "May" — solo mes abreviado (ejes de gráficas). */
export function formatMonthShort(date: DateInput): string {
  return capitalizeFirst(
    new Intl.DateTimeFormat("es-MX", {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(date)),
  );
}
