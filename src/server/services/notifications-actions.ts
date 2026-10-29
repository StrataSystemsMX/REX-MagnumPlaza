"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/get-session";
import { isMaster, requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import {
  sendContractExpiringNotice,
  sendPaymentConfirmation,
  sendRentReminder,
  type NotificationDispatchResult,
  type SendRentReminderResult,
} from "@/server/services/notifications";
import { isWhatsAppConfigured } from "@/server/whatsapp/client";
import {
  manualSendRentReminderSchema,
  type ManualSendRentReminderInput,
} from "@/shared/validators/notification";
import type { ReminderLevel } from "@/server/pdf/template-config";

/**
 * Server Action para mandar manualmente un aviso desde la UI de morosidad.
 * Siempre forceSend (el operador ya confirmó). Permite incluso 3M con
 * confirmación humana explícita.
 *
 * Si se provee `override`, se ignora el canal/destino del lessee:
 *  - EMAIL → envío vía Resend (con PDF adjunto).
 *  - WHATSAPP → no llama Meta API: el resultado trae waUrl (wa.me/...)
 *    para que el cliente lo abra en una pestaña nueva.
 */
export async function actionSendRentReminderManual(
  rentId: string,
  level: ReminderLevel,
  override?: { channel: "WHATSAPP" | "EMAIL"; to: string },
): Promise<SendRentReminderResult> {
  const { tenantId, dbUser } = await requireAuth();

  let manualChannel: { channel: "WHATSAPP" | "EMAIL"; to: string } | undefined;
  if (override) {
    const parsed = manualSendRentReminderSchema.parse({
      channel: override.channel,
      to: override.to,
      rentId,
      level,
    } satisfies ManualSendRentReminderInput);
    manualChannel = { channel: parsed.channel, to: parsed.to };
  }

  const result = await sendRentReminder(tenantId, rentId, level, {
    forceSend: true,
    uploadedById: dbUser.id,
    manualChannel,
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
        overrideChannel: manualChannel?.channel ?? null,
        overrideTo: manualChannel?.to ?? null,
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
  const { tenantId, dbUser } = await requireAuth();
  // Reenvía un WhatsApp real (cuesta dinero): requiere permiso explícito.
  await requirePermission(dbUser.id, "notification.retry");

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
  officeEmail: string | null;
  officeWhatsapp: string | null;
  whatsappConfigured: boolean;
}

export async function actionGetTenantNotificationSettings(): Promise<TenantNotificationSettings> {
  const { tenantId } = await requireAuth();
  const t = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      autoSendOverdueNotifications: true,
      autoSendPaymentConfirmations: true,
      officeEmail: true,
      officeWhatsapp: true,
    },
  });
  return {
    autoSendOverdueNotifications: t.autoSendOverdueNotifications,
    autoSendPaymentConfirmations: t.autoSendPaymentConfirmations,
    officeEmail: t.officeEmail,
    officeWhatsapp: t.officeWhatsapp,
    whatsappConfigured: isWhatsAppConfigured(),
  };
}

/** Normaliza un email opcional: trim + lowercase, "" → null. */
function normalizeEmail(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s.length > 0 ? s : null;
}

/** Normaliza un teléfono WhatsApp a E.164 sin "+": solo dígitos, "" → null. */
function normalizeWhatsapp(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/[^\d]/g, "");
  return s.length > 0 ? s : null;
}

export async function actionUpdateTenantNotificationSettings(input: {
  autoSendOverdueNotifications: boolean;
  autoSendPaymentConfirmations: boolean;
  officeEmail?: string | null;
  officeWhatsapp?: string | null;
}): Promise<TenantNotificationSettings> {
  const { tenantId, dbUser } = await requireAuth();
  const master = await isMaster(dbUser.id);
  if (!master) {
    throw new Error("Sólo MASTER puede cambiar la configuración de notificaciones.");
  }

  const officeEmail = normalizeEmail(input.officeEmail);
  const officeWhatsapp = normalizeWhatsapp(input.officeWhatsapp);
  if (officeEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(officeEmail)) {
    throw new Error("El correo de la oficina no es válido.");
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      autoSendOverdueNotifications: input.autoSendOverdueNotifications,
      autoSendPaymentConfirmations: input.autoSendPaymentConfirmations,
      officeEmail,
      officeWhatsapp,
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
        officeEmail,
        officeWhatsapp,
      },
    },
  });

  revalidatePath("/configuracion/notificaciones");
  return actionGetTenantNotificationSettings();
}
