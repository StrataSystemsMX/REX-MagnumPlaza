import { Prisma } from "@/generated/prisma/client";
import type { RentStatus } from "@/generated/prisma/enums";
import { daysOverdue } from "@/lib/services/rent-status";

export interface LateFeeResult {
  daysOverdue: number;
  /** Monto de interés moratorio acumulado a la fecha. */
  amount: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Calcula el interés moratorio sobre el saldo pendiente del Rent.
 *
 * Política CRT: lateFeePercentage es un porcentaje **mensual** (típicamente 5%).
 * Se prorratea por días: si la renta lleva 45 días vencida con 5% mensual,
 * el interés es saldo_pendiente × 5% × (45/30) = saldo × 7.5%.
 *
 * El monto se persiste en Rent.lateFeeAccrued (snapshot) desde el cron diario y
 * desde recalcRentInTx en cada pago, y se suma al adeudo total vía computeBalance.
 *
 * Esta función es PURA y devuelve 0 cuando el saldo de principal es 0; la
 * política de CONGELAR el interés devengado al saldar el principal con pagos
 * tardíos (decisión CRT 2026-07-16) vive en las capas que persisten el
 * snapshot: recalcRentInTx y updateRentStatuses.
 */
export function calculateLateFee(
  rent: {
    amountDue: Prisma.Decimal | number | string;
    amountPaid: Prisma.Decimal | number | string;
    amountWaived?: Prisma.Decimal | number | string;
    dueDate: Date;
    status: RentStatus;
  },
  contract: { lateFeePercentage: Prisma.Decimal | number | string | null },
  asOfDate: Date = new Date(),
): LateFeeResult {
  if (
    contract.lateFeePercentage === null ||
    contract.lateFeePercentage === undefined ||
    rent.status === "PAID" ||
    rent.status === "WAIVED"
  ) {
    return { daysOverdue: 0, amount: ZERO };
  }

  const days = daysOverdue(rent.dueDate, asOfDate);
  if (days <= 0) return { daysOverdue: 0, amount: ZERO };

  const waived = new Prisma.Decimal(rent.amountWaived ?? 0);
  const outstanding = new Prisma.Decimal(rent.amountDue)
    .minus(new Prisma.Decimal(rent.amountPaid))
    .minus(waived);
  if (outstanding.lte(0)) return { daysOverdue: days, amount: ZERO };

  const monthlyRate = new Prisma.Decimal(contract.lateFeePercentage).div(100);
  const monthsOverdue = new Prisma.Decimal(days).div(30);
  const amount = outstanding.mul(monthlyRate).mul(monthsOverdue);

  return { daysOverdue: days, amount };
}
