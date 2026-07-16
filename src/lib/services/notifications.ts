import { Prisma } from "@/generated/prisma/client";
import { generateOverdueReminder } from "@/lib/pdf/generator";
import { prisma } from "@/lib/prisma/client";
import {
  getResendClient,
  getResendFromAddress,
} from "@/lib/services/email/resend-client";
import { sendTemplate, WhatsAppError } from "@/lib/whatsapp/client";
import type { ReminderLevel } from "@/lib/pdf/template-config";
import type { NotificationLogModel } from "@/generated/prisma/models";
import type { NotificationRecipientType } from "@/generated/prisma/enums";
import { computeBalance } from "@/lib/services/rent-status";
import { capitalizeFirst } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";
import { formatPeriodLong } from "@/lib/format-date";

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

// day+month:"long"+year → no mapea a formatDate (que usa month short). Inline.
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
  recipientType: NotificationRecipientType;
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

interface EmailDispatchContext {
  tenantId: string;
  recipientId: string;
  recipientType: NotificationRecipientType;
  templateCode: string;
  to: string | null;
  subject: string;
  bodyText: string;
  attachment?: {
    filename: string;
    content: Buffer;
    contentType: string;
  };
}

/**
 * Crea NotificationLog channel=EMAIL e intenta enviar vía Resend.
 * Sin RESEND_API_KEY → deja log en FAILED con reason explícita.
 */
async function dispatchEmail(
  ctx: EmailDispatchContext,
): Promise<NotificationDispatchResult> {
  const log = await prisma.notificationLog.create({
    data: {
      tenantId: ctx.tenantId,
      recipientType: ctx.recipientType,
      recipientId: ctx.recipientId,
      channel: "EMAIL",
      templateCode: ctx.templateCode,
      subject: ctx.subject,
      body: ctx.bodyText,
      status: "PENDING",
    },
  });

  if (!ctx.to) {
    const reason = "Falta destinatario de correo.";
    await prisma.notificationLog.updateMany({
      where: { id: log.id, tenantId: ctx.tenantId },
      data: { status: "FAILED", failureReason: reason },
    });
    return {
      notificationLogId: log.id,
      status: "FAILED",
      externalId: null,
      failureReason: reason,
    };
  }

  const resend = getResendClient();
  if (!resend) {
    const reason = "resend_api_key_missing";
    await prisma.notificationLog.updateMany({
      where: { id: log.id, tenantId: ctx.tenantId },
      data: { status: "FAILED", failureReason: reason },
    });
    return {
      notificationLogId: log.id,
      status: "FAILED",
      externalId: null,
      failureReason: reason,
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getResendFromAddress(),
      to: ctx.to,
      subject: ctx.subject,
      text: ctx.bodyText,
      attachments: ctx.attachment
        ? [
            {
              filename: ctx.attachment.filename,
              content: ctx.attachment.content,
            },
          ]
        : undefined,
    });
    if (error) throw new Error(error.message ?? "Resend error");
    await prisma.notificationLog.updateMany({
      where: { id: log.id, tenantId: ctx.tenantId },
      data: { status: "SENT", sentAt: new Date(), externalId: data?.id ?? null },
    });
    return {
      notificationLogId: log.id,
      status: "SENT",
      externalId: data?.id ?? null,
      failureReason: null,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Error desconocido al enviar correo.";
    await prisma.notificationLog.updateMany({
      where: { id: log.id, tenantId: ctx.tenantId },
      data: { status: "FAILED", failureReason: reason },
    });
    return {
      notificationLogId: log.id,
      status: "FAILED",
      externalId: null,
      failureReason: reason,
    };
  }
}

/**
 * Construye URL click-to-chat de WhatsApp con texto pre-llenado.
 * El operador abre wa.me y manda él mismo el mensaje desde WhatsApp Web/app.
 */
export function buildWhatsAppDeepLink(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

/**
 * Registra un NotificationLog para un envío manual por wa.me — no llamamos
 * a Meta Cloud API. El log queda en PENDING porque no podemos confirmar
 * que el operador realmente apretó "enviar" en WhatsApp Web.
 */
async function recordWhatsAppManualLog(
  tenantId: string,
  recipientId: string,
  templateCode: string,
  subject: string,
  bodyPreview: string,
): Promise<string> {
  const log = await prisma.notificationLog.create({
    data: {
      tenantId,
      recipientType: "LESSEE",
      recipientId,
      channel: "WHATSAPP",
      templateCode,
      subject,
      body: bodyPreview,
      status: "PENDING",
    },
  });
  return log.id;
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
  /**
   * Override manual: canal explícito + destino. Si se provee, se ignora
   * lessee.whatsapp y el flujo de Meta Cloud API.
   * - EMAIL: envía vía Resend con PDF adjunto.
   * - WHATSAPP: NO llama Meta API — devuelve un waUrl (wa.me/...) listo
   *   para que el cliente lo abra en un tab nuevo. El log queda PENDING.
   */
  manualChannel?: {
    channel: "WHATSAPP" | "EMAIL";
    to: string;
  };
}

export type SendRentReminderResult = NotificationDispatchResult & {
  /** Si manualChannel.channel = WHATSAPP, URL wa.me para abrir en el cliente. */
  waUrl?: string;
};

/**
 * Envía una COPIA del aviso a la oficina (Eli) por correo y/o WhatsApp.
 * Best-effort: cualquier fallo se loguea pero NUNCA aborta el aviso al inquilino,
 * que es la notificación primaria. Solo corre si el tenant configuró contacto de
 * oficina. Registra NotificationLog con recipientType OFFICE.
 */
async function notifyOfficeCopy(params: {
  tenantId: string;
  office: { officeEmail: string | null; officeWhatsapp: string | null };
  level: ReminderLevel;
  propertyName: string;
  lesseeName: string;
  summary: string;
  pdf: { buffer: Buffer | null; filename: string; mimeType: string };
  whatsapp?: { templateName: string; templateCode: string; parameters: string[] };
}): Promise<void> {
  const { tenantId, office, level } = params;
  const subject = `[Copia oficina] Aviso ${level} — ${params.propertyName} · ${params.lesseeName}`;
  if (office.officeEmail) {
    try {
      await dispatchEmail({
        tenantId,
        recipientId: tenantId,
        recipientType: "OFFICE",
        templateCode: `OFFICE_COPY_${level}`,
        to: office.officeEmail,
        subject,
        bodyText: params.summary,
        attachment: params.pdf.buffer
          ? {
              filename: params.pdf.filename,
              content: params.pdf.buffer,
              contentType: params.pdf.mimeType,
            }
          : undefined,
      });
    } catch (e) {
      console.error(
        "[notifications] copia a oficina (email) falló:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  if (office.officeWhatsapp && params.whatsapp) {
    try {
      await dispatchWhatsApp({
        tenantId,
        recipientId: tenantId,
        recipientType: "OFFICE",
        templateCode: params.whatsapp.templateCode,
        templateName: params.whatsapp.templateName,
        parameters: params.whatsapp.parameters,
        to: office.officeWhatsapp,
        bodyPreview: params.summary,
        subject,
        send: true,
      });
    } catch (e) {
      console.error(
        "[notifications] copia a oficina (WhatsApp) falló:",
        e instanceof Error ? e.message : e,
      );
    }
  }
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
): Promise<SendRentReminderResult> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      autoSendOverdueNotifications: true,
      officeEmail: true,
      officeWhatsapp: true,
    },
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
    select: { amountDue: true, amountPaid: true, amountWaived: true, lateFeeAccrued: true },
  });
  const totalBalance = allPending.reduce(
    (acc, r) =>
      acc.plus(computeBalance(r.amountDue, r.amountPaid, r.amountWaived, r.lateFeeAccrued)),
    new Prisma.Decimal(0),
  );
  const overdueCount = allPending.length;

  const lessee = rent.contract.lessee;
  const periodLabel = formatPeriodLong(rent.period);
  const balanceFormatted = formatMXN(totalBalance, 2);
  const monthlyAmount = formatMXN(rent.amountDue, 2);
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
    parameters = [lessee.legalName, capitalizeFirst(DATE.format(limit)), balanceFormatted];
    bodyPreview = `Aviso 3 (desalojo) — saldo ${balanceFormatted}. PDF: ${pdfUrl}`;
  }

  // === Override manual: el operador eligió canal y destino explícitos. ===
  if (options.manualChannel) {
    const subject = `Aviso ${level} — ${rent.contract.unit.property.name}`;
    // El operador está enviando: la oficina recibe copia también.
    const officeCopy = () =>
      notifyOfficeCopy({
        tenantId,
        office: { officeEmail: tenant.officeEmail, officeWhatsapp: tenant.officeWhatsapp },
        level,
        propertyName: rent.contract.unit.property.name,
        lesseeName: lessee.legalName,
        summary: bodyPreview,
        pdf,
        whatsapp: { templateName, templateCode, parameters },
      });
    if (options.manualChannel.channel === "EMAIL") {
      const result = await dispatchEmail({
        tenantId,
        recipientId: lessee.id,
        recipientType: "LESSEE",
        templateCode,
        to: options.manualChannel.to,
        subject,
        bodyText: bodyPreview,
        attachment: pdf.buffer
          ? {
              filename: pdf.filename,
              content: pdf.buffer,
              contentType: pdf.mimeType,
            }
          : undefined,
      });
      await officeCopy();
      return result;
    }
    await officeCopy();
    // WHATSAPP manual → wa.me click-to-chat, sin Meta API.
    const logId = await recordWhatsAppManualLog(
      tenantId,
      lessee.id,
      templateCode,
      subject,
      bodyPreview,
    );
    return {
      notificationLogId: logId,
      status: "PENDING",
      externalId: null,
      failureReason: null,
      waUrl: buildWhatsAppDeepLink(options.manualChannel.to, bodyPreview),
    };
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

  // Copia a la oficina (Eli) solo cuando el aviso al inquilino se envía de verdad
  // (no cuando queda PENDING/manual ni en el 3M automático).
  if (send) {
    await notifyOfficeCopy({
      tenantId,
      office: { officeEmail: tenant.officeEmail, officeWhatsapp: tenant.officeWhatsapp },
      level,
      propertyName: rent.contract.unit.property.name,
      lesseeName: lessee.legalName,
      summary: bodyPreview,
      pdf,
      whatsapp: { templateName, templateCode, parameters },
    });
  }

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
  const amount = formatMXN(payment.amount, 2);
  const concept = `Renta ${formatPeriodLong(payment.rent.period)} — ${payment.rent.contract.unit.property.name} ${payment.rent.contract.unit.code}`;
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
    capitalizeFirst(DATE.format(contract.endDate)),
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
    bodyPreview: `Recordatorio: contrato de ${unitLabel} vence el ${capitalizeFirst(DATE.format(contract.endDate))}`,
    subject: "Contrato por vencer",
    send: options.forceSend ?? true,
  });
}

export interface ContractExpiringSweepResult {
  candidates: number;
  sent: number;
  skipped: number;
}

/**
 * Cron diario: avisa por WhatsApp los contratos ACTIVE sin autoRenew cuyo
 * endDate cae dentro de la ventana (default 30 días). Idempotente: un solo
 * aviso por contrato — se dedupe contra el AuditLog de NotificationLog que
 * dejan tanto este sweep como el envío manual (changes.contractId).
 */
export async function sendContractExpiringNotices(
  tenantId: string,
  options: { now?: Date; windowDays?: number } = {},
): Promise<ContractExpiringSweepResult> {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 30;
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const contracts = await prisma.contract.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      autoRenew: false,
      endDate: { gte: now, lte: windowEnd },
    },
    select: { id: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const c of contracts) {
    const already = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        entityType: "NotificationLog",
        changes: { path: ["contractId"], equals: c.id },
      },
      select: { id: true },
    });
    if (already) {
      skipped += 1;
      continue;
    }

    const result = await sendContractExpiringNotice(tenantId, c.id);
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: null,
        action: "CREATE",
        entityType: "NotificationLog",
        entityId: result.notificationLogId,
        changes: {
          auto: true,
          contractId: c.id,
          templateCode: "CONTRACT_EXPIRING",
          status: result.status,
        },
      },
    });
    if (result.status !== "FAILED") sent += 1;
  }

  return { candidates: contracts.length, sent, skipped };
}

export type NotificationLogRow = NotificationLogModel;
