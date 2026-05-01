import { prismaUnsafe } from "@/lib/prisma/client";
import { recordMorosityDailySnapshot } from "@/lib/services/morosity-snapshot";
import { updateRentStatuses } from "@/lib/services/rent-status-updater";
import type { RentStatus } from "@/generated/prisma/enums";

export interface CronRunSummary {
  tenantsProcessed: number;
  rentsUpdated: number;
  overdueTransitions: number;
  byNewStatus: Partial<Record<RentStatus, number>>;
  snapshotDate: string | null;
  runAt: string;
}

/**
 * Itera todos los tenants activos: actualiza statuses + escribe snapshot.
 * Compartido entre el endpoint de Vercel Cron y el endpoint de dev.
 */
export async function runDailyMorosityCron(
  options: { now?: Date } = {},
): Promise<CronRunSummary> {
  const now = options.now ?? new Date();
  const tenants = await prismaUnsafe.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let rentsUpdated = 0;
  let overdueTransitions = 0;
  const byNewStatus: Partial<Record<RentStatus, number>> = {};
  let snapshotDate: Date | null = null;

  for (const t of tenants) {
    const u = await updateRentStatuses(t.id, { now });
    rentsUpdated += u.rentsUpdated;
    overdueTransitions += u.overdueTransitions;
    for (const [k, v] of Object.entries(u.byNewStatus) as [RentStatus, number][]) {
      byNewStatus[k] = (byNewStatus[k] ?? 0) + v;
    }
    const snap = await recordMorosityDailySnapshot(t.id, { now });
    snapshotDate = snap.date;
  }

  return {
    tenantsProcessed: tenants.length,
    rentsUpdated,
    overdueTransitions,
    byNewStatus,
    snapshotDate: snapshotDate ? snapshotDate.toISOString().slice(0, 10) : null,
    runAt: now.toISOString(),
  };
}
