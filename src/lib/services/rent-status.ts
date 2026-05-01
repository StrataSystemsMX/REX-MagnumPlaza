import { Prisma } from "@/generated/prisma/client";
import type { RentStatus } from "@/generated/prisma/enums";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Calcula el estado de un Rent a partir de los montos y la fecha de vencimiento.
 *
 * Reglas (alineadas con la política CRT de 3 avisos antes de desalojo):
 *  - amountPaid >= amountDue → PAID
 *  - 0 < amountPaid < amountDue → PARTIAL
 *  - amountPaid == 0:
 *      · dueDate en el futuro      → PENDING
 *      · 0..29 días vencido        → DUE
 *      · 30..59 días vencido       → OVERDUE_1M  (dispara aviso 1)
 *      · 60..89 días vencido       → OVERDUE_2M  (dispara aviso 2)
 *      · ≥ 90 días vencido         → OVERDUE_3M  (dispara aviso 3 — desalojo)
 *
 * NO maneja WAIVED: ese estado se marca manualmente y se respeta en el caller.
 */
export function computeRentStatus(
  amountPaid: Prisma.Decimal | number | string,
  amountDue: Prisma.Decimal | number | string,
  dueDate: Date,
  now: Date = new Date(),
): RentStatus {
  const paid = new Prisma.Decimal(amountPaid);
  const due = new Prisma.Decimal(amountDue);

  if (paid.gte(due)) return "PAID";
  if (paid.gt(0)) return "PARTIAL";

  const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY);
  if (daysOverdue < 0) return "PENDING";
  if (daysOverdue < 30) return "DUE";
  if (daysOverdue < 60) return "OVERDUE_1M";
  if (daysOverdue < 90) return "OVERDUE_2M";
  return "OVERDUE_3M";
}

/** Días vencidos respecto a `now`. Negativo si aún no vence. */
export function daysOverdue(dueDate: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY);
}
