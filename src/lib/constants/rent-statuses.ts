import type { RentStatus } from "@/generated/prisma/enums";

/**
 * Estados de renta que representan saldo pendiente de cobro. Reutilizable
 * en cualquier vista/filtro que liste rentas con adeudo (Por cobrar, dashboard,
 * notificaciones de morosidad, reportes, PDFs).
 *
 * Vive en `lib/constants` (no en `lib/services`) para que pueda importarse
 * desde Client Components sin arrastrar el cliente de Prisma al bundle.
 */
export const OUTSTANDING_STATUSES: RentStatus[] = [
  "DUE",
  "PARTIAL",
  "OVERDUE_1M",
  "OVERDUE_2M",
  "OVERDUE_3M",
];
