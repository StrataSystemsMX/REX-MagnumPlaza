import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";
import { computeBalance } from "@/lib/services/rent-status";
import type { RentStatus } from "@/generated/prisma/enums";

const OUTSTANDING_STATUSES: RentStatus[] = [
  "DUE",
  "PARTIAL",
  "OVERDUE_1M",
  "OVERDUE_2M",
  "OVERDUE_3M",
];

export interface MorositySnapshotResult {
  date: Date;
  byStatus: Record<string, number>;
  totalAmount: string;
  overdueAmount: string;
}

/**
 * Toma una "foto" del estado actual de la cartera de Rents del tenant y la
 * guarda en MorosityDailySnapshot. Idempotente por día: si ya hay registro
 * de hoy lo sobrescribe (útil cuando el operador corre el cron a mano
 * después del cron automático).
 */
export async function recordMorosityDailySnapshot(
  tenantId: string,
  options: { now?: Date } = {},
): Promise<MorositySnapshotResult> {
  const now = options.now ?? new Date();
  // Snapshot indexado por día UTC (sin hora).
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const counts = await prisma.rent.groupBy({
    by: ["status"],
    where: { tenantId },
    _count: { _all: true },
  });
  const byStatus: Record<string, number> = {};
  for (const row of counts) {
    byStatus[row.status] = row._count._all;
  }

  const all = await prisma.rent.findMany({
    where: { tenantId },
    select: { amountDue: true, amountPaid: true, amountWaived: true, status: true },
  });
  const totalAmount = all.reduce(
    (acc, r) => acc.plus(new Prisma.Decimal(r.amountDue)),
    new Prisma.Decimal(0),
  );
  const overdueAmount = all
    .filter((r) => OUTSTANDING_STATUSES.includes(r.status))
    .reduce(
      (acc, r) => acc.plus(computeBalance(r.amountDue, r.amountPaid, r.amountWaived)),
      new Prisma.Decimal(0),
    );

  await prisma.morosityDailySnapshot.upsert({
    where: { tenantId_date: { tenantId, date } },
    create: {
      tenantId,
      date,
      byStatus: byStatus as Prisma.InputJsonValue,
      totalAmount,
      overdueAmount,
    },
    update: {
      byStatus: byStatus as Prisma.InputJsonValue,
      totalAmount,
      overdueAmount,
    },
  });

  return {
    date,
    byStatus,
    totalAmount: totalAmount.toString(),
    overdueAmount: overdueAmount.toString(),
  };
}
