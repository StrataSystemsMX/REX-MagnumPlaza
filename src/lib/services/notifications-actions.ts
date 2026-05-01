"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { isMaster } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  sendContractExpiringNotice,
  sendPaymentConfirmation,
  sendRentReminder,
  type NotificationDispatchResult,
} from "@/lib/services/notifications";
import { isWhatsAppConfigured } from "@/lib/whatsapp/client";
import type { ReminderLevel } from "@/lib/pdf/template-config";

/**
 * Server Action para mandar manualmente un aviso desde la UI de morosidad.
 * Siempre forceSend (el operador ya confirmó). Permite incluso 3M con
 * confirmación humana explícita.
 */
export async function actionSendRentReminderManual(
  rentId: string,
  level: ReminderLevel,
): Promise<NotificationDispatchResult> {
  const { tenantId, dbUser } = await requireAuth();

  const result = await sendRentReminder(tenantId, rentId, level, {
    forceSend: true,
    uploadedById: dbUser.id,
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: dbUser.id,
      action: "CREATE",
      entityType: "NotificationLog",
      entityId: result.notificationLogId,
      changes: {
        manual: true,
        level,
        rentId,
        status: result.status,
        externalId: result.externalId,
        failureReason: result.failureReason,
      },
    },
  });

  revalidatePath("/collections/overdue");
  revalidatePath("/lessees");
  return result;
}

export async function actionSendPaymentConfirmationManual(
  paymentId: string,
): Promise<NotificationDispatchResult> {
  const { tenantId, dbUser } = await requireAuth();
  const result = await sendPaymentConfirmation(tenantId, paymentId, {
    forceSend: true,
  });
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: dbUser.id,
      action: "CREATE",
      entityType: "NotificationLog",
      entityId: result.notificationLogId,
      changes: { manual: true, paymentId, status: result.status },
    },
  });
  revalidatePath("/collections");
  return result;
}

export async function actionSendContractExpiringManual(
  contractId: string,
): Promise<NotificationDispatchResult> {
  const { tenantId, dbUser } = await requireAuth();
  const result = await sendContractExpiringNotice(tenantId, contractId, {
    forceSend: true,
  });
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: dbUser.id,
      action: "CREATE",
      entityType: "NotificationLog",
      entityId: result.notificationLogId,
      changes: { manual: true, contractId, status: result.status },
    },
  });
  revalidatePath(`/contracts/${contractId}`);
  return result;
}

/**
 * Reintenta un envío fallido. Para avisos 1M/2M/3M reusa la lógica de
 * sendRentReminder con datos frescos: identifica el rent original a partir
 * de la auditoría que lo creó.
 */
export async function actionRetryNotification(
  notificationLogId: string,
): Promise<NotificationDispatchResult> {
  const { tenantId } = await requireAuth();

  const log = await prisma.notificationLog.findFirstOrThrow({
    where: { id: notificationLogId, tenantId },
  });
  if (log.channel !== "WHATSAPP") {
    throw new Error("Sólo se pueden reintentar notificaciones de WhatsApp.");
  }

  // Buscamos el AuditLog que lo creó para sacar rentId / paymentId / contractId.
  const audit = await prisma.auditLog.findFirst({
    where: { tenantId, entityType: "NotificationLog", entityId: notificationLogId },
    orderBy: { createdAt: "desc" },
  });
  const changes = (audit?.changes ?? {}) as Record<string, unknown>;

  if (
    log.templateCode === "RENT_REMINDER_1M" ||
    log.templateCode === "RENT_REMINDER_2M" ||
    log.templateCode === "RENT_REMINDER_3M_LEGAL"
  ) {
    const rentId = typeof changes["rentId"] === "string" ? (changes["rentId"] as string) : null;
    if (!rentId) {
      throw new Error(
        "No se pudo determinar el Rent original. Reintenta el envío manualmente desde la página de morosidad.",
      );
    }
    const level: ReminderLevel =
      log.templateCode === "RENT_REMINDER_1M"
        ? "1M"
        : log.templateCode === "RENT_REMINDER_2M"
          ? "2M"
          : "3M";
    return actionSendRentReminderManual(rentId, level);
  }

  if (log.templateCode === "PAYMENT_RECEIVED") {
    const paymentId =
      typeof changes["paymentId"] === "string" ? (changes["paymentId"] as string) : null;
    if (!paymentId) {
      throw new Error("No se pudo determinar el pago original.");
    }
    return actionSendPaymentConfirmationManual(paymentId);
  }

  if (log.templateCode === "CONTRACT_EXPIRING") {
    const contractId =
      typeof changes["contractId"] === "string" ? (changes["contractId"] as string) : null;
    if (!contractId) {
      throw new Error("No se pudo determinar el contrato original.");
    }
    return actionSendContractExpiringManual(contractId);
  }

  throw new Error(`Plantilla no soportada para reintento: ${log.templateCode ?? "desconocida"}`);
}

// ============================================================================
// Configuración del tenant (switches MASTER)
// ============================================================================

export interface TenantNotificationSettings {
  autoSendOverdueNotifications: boolean;
  autoSendPaymentConfirmations: boolean;
  whatsappConfigured: boolean;
}

export async function actionGetTenantNotificationSettings(): Promise<TenantNotificationSettings> {
  const { tenantId } = await requireAuth();
  const t = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      autoSendOverdueNotifications: true,
      autoSendPaymentConfirmations: true,
    },
  });
  return {
    autoSendOverdueNotifications: t.autoSendOverdueNotifications,
    autoSendPaymentConfirmations: t.autoSendPaymentConfirmations,
    whatsappConfigured: isWhatsAppConfigured(),
  };
}

export async function actionUpdateTenantNotificationSettings(input: {
  autoSendOverdueNotifications: boolean;
  autoSendPaymentConfirmations: boolean;
}): Promise<TenantNotificationSettings> {
  const { tenantId, dbUser } = await requireAuth();
  const master = await isMaster(dbUser.id);
  if (!master) {
    throw new Error("Sólo MASTER puede cambiar la configuración de notificaciones.");
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      autoSendOverdueNotifications: input.autoSendOverdueNotifications,
      autoSendPaymentConfirmations: input.autoSendPaymentConfirmations,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: dbUser.id,
      action: "UPDATE",
      entityType: "Tenant",
      entityId: tenantId,
      changes: {
        autoSendOverdueNotifications: input.autoSendOverdueNotifications,
        autoSendPaymentConfirmations: input.autoSendPaymentConfirmations,
      },
    },
  });

  revalidatePath("/configuracion/notificaciones");
  return actionGetTenantNotificationSettings();
}
