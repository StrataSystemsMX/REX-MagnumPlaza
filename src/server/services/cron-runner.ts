import { revalidateTag } from "next/cache";
import { prismaUnsafe } from "@/server/prisma/client";
import { recordMorosityDailySnapshot } from "@/server/services/morosity-snapshot";
import { sendContractExpiringNotices } from "@/server/services/notifications";
import { generateMonthlyRents } from "@/server/services/rent-generation";
import { updateRentStatuses } from "@/server/services/rent-status-updater";
import type { RentStatus } from "@/generated/prisma/enums";

export interface CronRunSummary {
  tenantsProcessed: number;
  rentsGenerated: number;
  rentsUpdated: number;
  overdueTransitions: number;
  byNewStatus: Partial<Record<RentStatus, number>>;
  contractExpiringSent: number;
  snapshotDate: string | null;
  runAt: string;
}

/**
 * Itera todos los tenants activos: genera rentas faltantes + actualiza
 * statuses + escribe snapshot. Compartido entre el endpoint de Vercel Cron y
 * el endpoint de dev.
 */
export async function runDailyMorosityCron(
  options: { now?: Date } = {},
): Promise<CronRunSummary> {
  const now = options.now ?? new Date();
  const tenants = await prismaUnsafe.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let rentsGenerated = 0;
  let rentsUpdated = 0;
  let overdueTransitions = 0;
  let contractExpiringSent = 0;
  const byNewStatus: Partial<Record<RentStatus, number>> = {};
  let snapshotDate: Date | null = null;

  for (const t of tenants) {
    // Materializa rentas faltantes ANTES de evaluar morosidad, para cubrir
    // contratos extendidos o activados sin generación inicial. Idempotente
    // por el unique [contractId, period].
    const gen = await generateMonthlyRents(t.id, { now });
    rentsGenerated += gen.reduce((sum, g) => sum + g.created, 0);

    const u = await updateRentStatuses(t.id, { now });
    rentsUpdated += u.rentsUpdated;
    overdueTransitions += u.overdueTransitions;
    for (const [k, v] of Object.entries(u.byNewStatus) as [RentStatus, number][]) {
      byNewStatus[k] = (byNewStatus[k] ?? 0) + v;
    }
    // Aviso de contratos por vencer (30 días, sin autoRenew, un aviso por
    // contrato). Best-effort: un fallo aquí no debe tumbar el resto del cron.
    try {
      const exp = await sendContractExpiringNotices(t.id, { now });
      contractExpiringSent += exp.sent;
    } catch (err) {
      console.error("[cron] contract-expiring sweep failed", { tenantId: t.id, err });
    }

    const snap = await recordMorosityDailySnapshot(t.id, { now });
    snapshotDate = snap.date;
    revalidateTag(`kpi-${t.id}`);
  }

  return {
    tenantsProcessed: tenants.length,
    rentsGenerated,
    rentsUpdated,
    overdueTransitions,
    byNewStatus,
    contractExpiringSent,
    snapshotDate: snapshotDate ? snapshotDate.toISOString().slice(0, 10) : null,
    runAt: now.toISOString(),
  };
}
