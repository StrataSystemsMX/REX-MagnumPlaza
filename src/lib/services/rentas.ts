"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { generateMonthlyRents } from "@/lib/services/rent-generation";

/**
 * Genera las rentas faltantes para todos los contratos activos del tenant.
 * Idempotente: si la renta del periodo ya existe, la salta.
 *
 * El parámetro `now` permite forzar la generación apuntando a un mes específico
 * (ej. desde la UI cuando el usuario está viendo un mes anterior y faltan rentas).
 */
export async function actionGenerateMissingRents(now?: string): Promise<{
  contractsProcessed: number;
  rentsCreated: number;
  rentsSkipped: number;
}> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "contract.update");

  const results = await generateMonthlyRents(tenantId, {
    now: now ? new Date(now) : undefined,
  });

  const summary = results.reduce(
    (acc, r) => ({
      contractsProcessed: acc.contractsProcessed + 1,
      rentsCreated: acc.rentsCreated + r.created,
      rentsSkipped: acc.rentsSkipped + r.skipped,
    }),
    { contractsProcessed: 0, rentsCreated: 0, rentsSkipped: 0 },
  );

  revalidatePath("/rentas");
  revalidatePath("/collections");
  revalidatePath("/");
  return summary;
}
