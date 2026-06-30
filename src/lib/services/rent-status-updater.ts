import { prisma } from "@/lib/prisma/client";
import { computeRentStatus } from "@/lib/services/rent-status";
import { calculateLateFee } from "@/lib/services/late-fees";
import { sendRentReminder } from "@/lib/services/notifications";
import type { RentStatus } from "@/generated/prisma/enums";
import type { ReminderLevel } from "@/lib/pdf/template-config";

/**
 * Estados que el cron diario puede mover. PAID y WAIVED son terminales (no
 * vuelven), OVERDUE_3M también es terminal porque el siguiente paso es manual
 * (desalojo) y no queremos que el sistema avance más allá sin intervención.
 */
const ADVANCEABLE_STATUSES: RentStatus[] = [
  "PENDING",
  "DUE",
  "PARTIAL",
  "OVERDUE_1M",
  "OVERDUE_2M",
];

const OVERDUE_LEVEL: Partial<Record<RentStatus, 1 | 2 | 3>> = {
  OVERDUE_1M: 1,
  OVERDUE_2M: 2,
  OVERDUE_3M: 3,
};

export interface UpdateRentStatusesResult {
  rentsUpdated: number;
  byNewStatus: Partial<Record<RentStatus, number>>;
  overdueTransitions: number;
  lateFeesUpdated: number;
}

/** Rentas vivas (no saldadas/condonadas) sobre las que se acumula interés moratorio. */
const FEE_ACCRUABLE_STATUSES: RentStatus[] = [
  "PENDING",
  "DUE",
  "PARTIAL",
  "OVERDUE_1M",
  "OVERDUE_2M",
  "OVERDUE_3M",
];

const LEVEL_TO_REMINDER: Record<1 | 2 | 3, ReminderLevel> = {
  1: "1M",
  2: "2M",
  3: "3M",
};

/**
 * Cuando un Rent transiciona a OVERDUE_* dispara el aviso vía WhatsApp.
 * sendRentReminder respeta el flag tenant.autoSendOverdueNotifications:
 *   - off → crea NotificationLog en PENDING (humano lo manda manual).
 *   - on  → manda inmediato (excepto 3M, que SIEMPRE es manual).
 *
 * Errores se loguean pero no abortan la corrida del cron — un Rent que
 * fallara al notificar no debe impedir actualizar el resto.
 */
async function triggerOverdueNotification(
  tenantId: string,
  rentId: string,
  level: 1 | 2 | 3,
): Promise<void> {
  try {
    await sendRentReminder(tenantId, rentId, LEVEL_TO_REMINDER[level]);
  } catch (e) {
    console.error(
      `[rent-status-updater] sendRentReminder failed (rent ${rentId} → ${level}M):`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Reevalúa el status de los Rents del tenant y avanza los que correspondan.
 * Pensado para correr 1 vez al día desde un cron (Vercel Cron).
 *
 *   PENDING / DUE / PARTIAL / OVERDUE_1M / OVERDUE_2M
 *     → recalcula con computeRentStatus (mismo gradiente que usa el resto
 *       del sistema cuando se registran pagos).
 *
 * Cada transición a OVERDUE_1M / 2M / 3M:
 *   - dispara triggerOverdueNotification(rent, level)
 *   - escribe un AuditLog UPDATE con userId=null (acción del sistema).
 *
 * NO toca PAID/WAIVED/OVERDUE_3M (terminales).
 */
export async function updateRentStatuses(
  tenantId: string,
  options: { now?: Date } = {},
): Promise<UpdateRentStatusesResult> {
  const now = options.now ?? new Date();

  const rents = await prisma.rent.findMany({
    where: { tenantId, status: { in: FEE_ACCRUABLE_STATUSES } },
    select: {
      id: true,
      contractId: true,
      amountDue: true,
      amountPaid: true,
      amountWaived: true,
      lateFeeAccrued: true,
      dueDate: true,
      status: true,
      contract: { select: { lateFeePercentage: true } },
    },
  });

  const byNewStatus: Partial<Record<RentStatus, number>> = {};
  let rentsUpdated = 0;
  let overdueTransitions = 0;
  let lateFeesUpdated = 0;

  for (const r of rents) {
    // 1) Avance de estado: solo para estados avanzables. OVERDUE_3M es terminal,
    //    pero igual entra al loop para seguir acumulando interés.
    const advanceable = ADVANCEABLE_STATUSES.includes(r.status);
    const newStatus = advanceable
      ? computeRentStatus(r.amountPaid, r.amountDue, r.dueDate, now, r.amountWaived)
      : r.status;
    const statusChanged = newStatus !== r.status;

    // 2) Interés moratorio: snapshot recalculado sobre el saldo de principal
    //    (redondeado a 2 decimales para evitar updates espurios por precisión).
    const newLateFee = calculateLateFee(
      {
        amountDue: r.amountDue,
        amountPaid: r.amountPaid,
        amountWaived: r.amountWaived,
        dueDate: r.dueDate,
        status: newStatus,
      },
      { lateFeePercentage: r.contract.lateFeePercentage },
      now,
    ).amount.toDecimalPlaces(2);
    const feeChanged = !newLateFee.eq(r.lateFeeAccrued);

    if (statusChanged || feeChanged) {
      await prisma.rent.updateMany({
        where: { id: r.id, tenantId },
        data: {
          ...(statusChanged ? { status: newStatus } : {}),
          ...(feeChanged ? { lateFeeAccrued: newLateFee } : {}),
        },
      });
    }
    if (feeChanged) lateFeesUpdated += 1;
    if (!statusChanged) continue;

    rentsUpdated += 1;
    byNewStatus[newStatus] = (byNewStatus[newStatus] ?? 0) + 1;

    const level = OVERDUE_LEVEL[newStatus];
    if (level !== undefined) {
      overdueTransitions += 1;
      await triggerOverdueNotification(tenantId, r.id, level);
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: null,
          action: "UPDATE",
          entityType: "Rent",
          entityId: r.id,
          changes: {
            transition: { from: r.status, to: newStatus },
            level,
            triggeredBy: "rent-status-updater-cron",
            at: now.toISOString(),
          },
        },
      });
    }
  }

  return { rentsUpdated, byNewStatus, overdueTransitions, lateFeesUpdated };
}
