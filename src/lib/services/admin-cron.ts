"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { isMaster } from "@/lib/auth/permissions";
import { recordMorosityDailySnapshot } from "@/lib/services/morosity-snapshot";
import { updateRentStatuses } from "@/lib/services/rent-status-updater";
import type { RentStatus } from "@/generated/prisma/enums";

export interface ManualCronResult {
  rentsUpdated: number;
  overdueTransitions: number;
  byNewStatus: Partial<Record<RentStatus, number>>;
  snapshotDate: string;
  runAt: string;
}

/**
 * Versión "manual desde UI" del cron de morosidad. Sólo procesa el tenant
 * del usuario actual y exige rol MASTER (no se siembra ningún permission
 * que dé acceso a esto, así que el bypass de MASTER es lo único que pasa).
 */
export async function actionRunMorosityCron(): Promise<ManualCronResult> {
  const { tenantId, dbUser } = await requireAuth();
  const master = await isMaster(dbUser.id);
  if (!master) {
    throw new Error("Solo el rol MASTER puede correr el cron manualmente.");
  }

  const now = new Date();
  const update = await updateRentStatuses(tenantId, { now });
  const snap = await recordMorosityDailySnapshot(tenantId, { now });

  revalidatePath("/collections");
  revalidatePath("/collections/overdue");
  revalidatePath("/configuracion/sistema");

  return {
    rentsUpdated: update.rentsUpdated,
    overdueTransitions: update.overdueTransitions,
    byNewStatus: update.byNewStatus,
    snapshotDate: snap.date.toISOString().slice(0, 10),
    runAt: now.toISOString(),
  };
}
