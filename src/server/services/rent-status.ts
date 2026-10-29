import { Prisma } from "@/generated/prisma/client";
import type { RentStatus } from "@/generated/prisma/enums";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Calcula el estado de un Rent a partir de los montos y la fecha de vencimiento.
 *
 * Saldo = amountDue - amountPaid - amountWaived
 *
 * Reglas (alineadas con la política CRT de 3 avisos antes de desalojo):
 *  - Si saldo <= 0:
 *      · y amountWaived > 0 y amountPaid == 0  → WAIVED (condonación pura)
 *      · cualquier otro caso (hubo pago real)  → PAID
 *  - amountPaid > 0 y saldo > 0                 → PARTIAL
 *  - amountPaid == 0 y saldo > 0:
 *      · dueDate en el futuro      → PENDING
 *      · 0..29 días vencido        → DUE
 *      · 30..59 días vencido       → OVERDUE_1M  (dispara aviso 1)
 *      · 60..89 días vencido       → OVERDUE_2M  (dispara aviso 2)
 *      · ≥ 90 días vencido         → OVERDUE_3M  (dispara aviso 3 — desalojo)
 *
 * Si ya estaba en WAIVED y no se ha movido nada, el caller debe respetar
 * el estado para no resucitarlo desde un recalc; ver payments.recalcRentInTx.
 */
export function computeRentStatus(
  amountPaid: Prisma.Decimal | number | string,
  amountDue: Prisma.Decimal | number | string,
  dueDate: Date,
  now: Date = new Date(),
  amountWaived: Prisma.Decimal | number | string = 0,
): RentStatus {
  const paid = new Prisma.Decimal(amountPaid);
  const waived = new Prisma.Decimal(amountWaived);
  const due = new Prisma.Decimal(amountDue);
  const balance = due.minus(paid).minus(waived);

  if (balance.lte(0)) {
    if (waived.gt(0) && paid.eq(0)) return "WAIVED";
    return "PAID";
  }
  if (paid.gt(0)) return "PARTIAL";

  // POLÍTICA DE ZONA HORARIA: todo el sistema opera en UTC puro. dueDate se
  // materializa a medianoche UTC (rent-generation) y los umbrales 0/30/60/90
  // se evalúan contra `now` UTC. Tenant.timezone NO participa: el cron corre a
  // las 16:00 UTC (09:00 Hermosillo), así que los cruces de umbral se aplican
  // efectivamente la mañana del día correcto en hora local. Si algún día se
  // opera en otra TZ, revisar docs/decisiones-negocio-pendientes.md.
  const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY);
  if (daysOverdue < 0) return "PENDING";
  if (daysOverdue < 30) return "DUE";
  if (daysOverdue < 60) return "OVERDUE_1M";
  if (daysOverdue < 90) return "OVERDUE_2M";
  return "OVERDUE_3M";
}

/**
 * Adeudo total de un Rent = amountDue + lateFeeAccrued - amountPaid - amountWaived.
 *
 * Es la fuente única de verdad para el saldo: úsala en avisos, PDFs, dashboard
 * y notificaciones. Restar `amountWaived` es obligatorio — omitirlo hace que las
 * rentas condonadas aparezcan como adeudo. `lateFeeAccrued` (interés moratorio
 * acumulado, política CRT 5% mensual) se suma al adeudo real; es opcional y por
 * defecto 0 para call-sites que solo necesitan el saldo de principal.
 * Devuelve Prisma.Decimal para no perder precisión; usa `.toNumber()` en el
 * caller si necesitas un number.
 */
export function computeBalance(
  amountDue: Prisma.Decimal | number | string,
  amountPaid: Prisma.Decimal | number | string,
  amountWaived: Prisma.Decimal | number | string = 0,
  lateFeeAccrued: Prisma.Decimal | number | string = 0,
): Prisma.Decimal {
  return new Prisma.Decimal(amountDue)
    .plus(new Prisma.Decimal(lateFeeAccrued))
    .minus(new Prisma.Decimal(amountPaid))
    .minus(new Prisma.Decimal(amountWaived));
}

/** Días vencidos respecto a `now`. Negativo si aún no vence. */
export function daysOverdue(dueDate: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY);
}
