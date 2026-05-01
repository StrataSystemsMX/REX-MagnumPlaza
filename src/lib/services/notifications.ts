import { Prisma } from "@/generated/prisma/client";
import { generateOverdueReminder } from "@/lib/pdf/generator";
import { prisma } from "@/lib/prisma/client";
import { sendTemplate, WhatsAppError } from "@/lib/whatsapp/client";
import type { ReminderLevel } from "@/lib/pdf/template-config";
import type { NotificationLogModel } from "@/generated/prisma/models";

/**
 * Plantillas pre-aprobadas en Meta Business. Los nombres deben coincidir
 * exactamente con los aprobados en el dashboard.
 */
export const WHATSAPP_TEMPLATES = {
  RENT_REMINDER_1M: "rent_reminder_1m",
  RENT_REMINDER_2M: "rent_reminder_2m",
  RENT_REMINDER_3M_LEGAL: "rent_reminder_3m_legal",
  PAYMENT_RECEIVED: "payment_received",
  CONTRACT_EXPIRING: "contract_expiring",
} as const;

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const PERIOD = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export interface NotificationDispatchResult {
  notificationLogId: string;
  status: "SENT" | "PENDING" | "FAILED";
  externalId: string | null;
  failureReason: string | null;
}

interface SendContext {
  tenantId: string;
  recipientId: string;
  recipientType: "LESSEE";
  templateCode: string;
  templateName: string;
  parameters: ReadonlyArray<string>;
  to: string | null;
  /** Texto que guardamos como `body` para mostrar en la bitácora. */
  bodyPreview: string;
  subject?: string;
  /**
   * Si es false sólo crea el NotificationLog en PENDING (no manda).
   * Útil para que el sistema marque "este aviso debería irse" cuando
   * autoSendOverdueNotifications está apagado, y un humano lo revise.
   */
  send: boolean;
}

/**
 * Crea el NotificationLog y, si send=true, intenta el envío. Maneja todos
 * los modos posibles: sin token (simulado → SENT), con token OK (SENT),
 * con token y falla (FAILED), o solo registro (PENDING).
 */
async function dispatchWhatsApp(ctx: SendContext): Promise<NotificationDispatchResult> {
  const log = await prisma.notificationLog.create({
    data: {
      tenantId: ctx.tenantId,
      recipientType: ctx.recipientType,
      recipientId: ctx.recipientId,
      channel: "WHATSAPP",
      templateCode: ctx.templateCode,
      subject: ctx.subject ?? null,
      body: ctx.bodyPreview,
      status: "PENDING",
    },
  });

  if (!ctx.send) {
    return {
      notificationLogId: log.id,
      status: "PENDING",
      externalId: null,
      failureReason: null,
    };
  }

  if (!ctx.to) {
    await prisma.notificationLog.updateMany({
      where: { id: log.id, tenantId: ctx.tenantId },
      data: {
        status: "FAILED",
        failureReason: "El inquilino no tiene número de WhatsApp registrado.",
      },
    });
    return {
      notificationLogId: log.id,
      status: "FAILED",
      externalId: null,
      failureReason: "El inquilino no tiene número de WhatsApp registrado.",
    };
  }

  try {
    const result = await sendTemplate(ctx.to, ctx.templateName, ctx.parameters);
    await prisma.notificationLog.updateMany({
      where: { id: log.id, tenantId: ctx.tenantId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        externalId: result.messageId,
      },
    });
    return {
      notificationLogId: log.id,
      status: "SENT",
      externalId: result.messageId,
      failureReason: null,
    };
  } catch (e) {
    const reason =
      e instanceof WhatsAppError
        ? `[${e.code}] ${e.message}${e.graphCode ? ` (graph ${e.graphCode})` : ""}`
        : e instanceof Error
          ? e.message
          : "Error desconocido al enviar WhatsApp.";
    await prisma.notificationLog.updateMany({
      where: { id: log.id, tenantId: ctx.tenantId },
      data: {
        status: "FAILED",
        failureReason: reason,
      },
    });
    return {
      notificationLogId: log.id,
      status: "FAILED",
      externalId: null,
      failureReason: reason,
    };
  }
}

// ============================================================================
// Aviso de morosidad (1M / 2M / 3M)
// ============================================================================

export interface SendRentReminderOptions {
  /**
   * Si true ignora el flag `autoSendOverdueNotifications` del tenant.
   * Pensado para envíos manuales desde la UI: el operador ya tomó la decisión.
   */
  forceSend?: boolean;
  uploadedById?: string | null;
}

/**
 * Genera el PDF correspondiente al nivel, lo persiste en R2 y manda el
 * mensaje por WhatsApp con la plantilla apropiada.
 *
 * REGLA: el nivel 3M nunca se envía automáticamente. Si forceSend=false
 * (caller automático) deja el log en PENDING. forceSend=true (manual con
 * confirmación humana) sí lo manda.
 */
export async function sendRentReminder(
  tenantId: string,
  rentId: string,
  level: ReminderLevel,
  options: SendRentReminderOptions = {},
): Promise<NotificationDispatchResult> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { autoSendOverdueNotifications: true },
  });

  // 3M nunca se manda solo aunque autoSend esté en true.
  const isAutoCaller = !options.forceSend;
  const send = options.forceSend
    ? true
    : level === "3M"
      ? false
      : tenant.autoSendOverdueNotifications;

  // Generamos el PDF (lo deja en R2 y crea fila Document).
  const pdf = await generateOverdueReminder(tenantId, rentId, level, {
    persist: true,
    uploadedById: options.uploadedById ?? null,
  });

  // Datos del Rent + lessee + adeudos para los parámetros de la plantilla.
  const rent = await prisma.rent.findFirstOrThrow({
    where: { id: rentId, tenantId },
    include: {
      contract: {
        include: {
          lessee: { select: { id: true, legalName: true, whatsapp: true } },
          unit: { select: { code: true, property: { select: { name: true } } } },
        },
      },
    },
  });

  // Saldo total (este Rent + otros pendientes del mismo contrato).
  const allPending = await prisma.rent.findMany({
    where: {
      tenantId,
      contractId: rent.contractId,
      status: { in: ["DUE", "PARTIAL", "OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"] },
    },
    select: { amountDue: true, amountPaid: true },
  });
  const totalBalance = allPending.reduce(
    (acc, r) =>
      acc.plus(new Prisma.Decimal(r.amountDue).minus(new Prisma.Decimal(r.amountPaid))),
    new Prisma.Decimal(0),
  );
  const overdueCount = allPending.length;

  const lessee = rent.contract.lessee;
  const periodLabel = PERIOD.format(rent.period);
  const balanceFormatted = MXN.format(Number(totalBalance));
  const monthlyAmount = MXN.format(Number(rent.amountDue));
  const pdfUrl = pdf.url ?? "";

  let templateName: string;
  let templateCode: string;
  let parameters: string[];
  let bodyPreview: string;

  if (level === "1M") {
    templateName = WHATSAPP_TEMPLATES.RENT_REMINDER_1M;
    templateCode = "RENT_REMINDER_1M";
    parameters = [
      lessee.legalName,
      periodLabel,
      monthlyAmount,
      pdfUrl,
    ];
    bodyPreview = `Aviso 1 (amistoso) — ${periodLabel}. Saldo ${monthlyAmount}. PDF: ${pdfUrl}`;
  } else if (level === "2M") {
    templateName = WHATSAPP_TEMPLATES.RENT_REMINDER_2M;
    templateCode = "RENT_REMINDER_2M";
    parameters = [
      lessee.legalName,
      String(overdueCount),
      balanceFormatted,
      pdfUrl,
    ];
    bodyPreview = `Aviso 2 (formal) — ${overdueCount} mes(es) vencidos. Saldo ${balanceFormatted}. PDF: ${pdfUrl}`;
  } else {
    templateName = WHATSAPP_TEMPLATES.RENT_REMINDER_3M_LEGAL;
    templateCode = "RENT_REMINDER_3M_LEGAL";
    // Fecha límite = hoy + 5 días hábiles (aproximamos a 7 naturales).
    const limit = new Date();
    limit.setUTCDate(limit.getUTCDate() + 7);
    parameters = [lessee.legalName, DATE.format(limit), balanceFormatted];
    bodyPreview = `Aviso 3 (desalojo) — saldo ${balanceFormatted}. PDF: ${pdfUrl}`;
  }

  const result = await dispatchWhatsApp({
    tenantId,
    recipientId: lessee.id,
    recipientType: "LESSEE",
    templateCode,
    templateName,
    parameters,
    to: lessee.whatsapp ?? null,
    bodyPreview,
    subject: `Aviso ${level}`,
    send,
  });

  if (!send && level === "3M" && isAutoCaller) {
    // Dejar evidencia visible en consola: el cron NO mandó solo el 3M.
    console.info(
      `[notifications] Rent ${rentId} (3M) registrado en PENDING — requiere confirmación manual.`,
    );
  }

  return result;
}

// ============================================================================
// Confirmación de pago
// ============================================================================

export interface SendPaymentConfirmationOptions {
  /** Saltarse el flag del tenant. Default false. */
  forceSend?: boolean;
}

export async function sendPaymentConfirmation(
  tenantId: string,
  paymentId: string,
  options: SendPaymentConfirmationOptions = {},
): Promise<NotificationDispatchResult> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { autoSendPaymentConfirmations: true },
  });
  const send = options.forceSend || tenant.autoSendPaymentConfirmations;

  const payment = await prisma.payment.findFirstOrThrow({
    where: { id: paymentId, tenantId },
    include: {
      rent: {
        include: {
          contract: {
            include: {
              lessee: { select: { id: true, legalName: true, whatsapp: true } },
              unit: { select: { code: true, property: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const lessee = payment.rent.contract.lessee;
  const amount = MXN.format(Number(payment.amount));
  const concept = `Renta ${PERIOD.format(payment.rent.period)} — ${payment.rent.contract.unit.property.name} ${payment.rent.contract.unit.code}`;
  const parameters = [lessee.legalName, amount, concept];

  return dispatchWhatsApp({
    tenantId,
    recipientId: lessee.id,
    recipientType: "LESSEE",
    templateCode: "PAYMENT_RECEIVED",
    templateName: WHATSAPP_TEMPLATES.PAYMENT_RECEIVED,
    parameters,
    to: lessee.whatsapp ?? null,
    bodyPreview: `Confirmación de pago: ${amount} — ${concept}`,
    subject: "Confirmación de pago",
    send,
  });
}

// ============================================================================
// Contrato por vencer
// ============================================================================

export async function sendContractExpiringNotice(
  tenantId: string,
  contractId: string,
  options: { forceSend?: boolean } = {},
): Promise<NotificationDispatchResult> {
  const contract = await prisma.contract.findFirstOrThrow({
    where: { id: contractId, tenantId },
    include: {
      lessee: { select: { id: true, legalName: true, whatsapp: true } },
      unit: { select: { code: true, property: { select: { name: true } } } },
    },
  });

  const lessee = contract.lessee;
  const unitLabel = `${contract.unit.property.name} ${contract.unit.code}`;
  const parameters = [
    lessee.legalName,
    DATE.format(contract.endDate),
    unitLabel,
  ];

  return dispatchWhatsApp({
    tenantId,
    recipientId: lessee.id,
    recipientType: "LESSEE",
    templateCode: "CONTRACT_EXPIRING",
    templateName: WHATSAPP_TEMPLATES.CONTRACT_EXPIRING,
    parameters,
    to: lessee.whatsapp ?? null,
    bodyPreview: `Recordatorio: contrato de ${unitLabel} vence el ${DATE.format(contract.endDate)}`,
    subject: "Contrato por vencer",
    send: options.forceSend ?? true,
  });
}

export type NotificationLogRow = NotificationLogModel;
