import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";
import { uploadFile } from "@/lib/storage/r2";
import {
  ACCOUNT_STATEMENT,
  reminderConfigByLevel,
  resolveTokens,
  type ReminderLevel,
} from "@/lib/pdf/template-config";
import { AccountStatementPdf } from "@/lib/pdf/templates/account-statement";
import { DashboardSummaryPdf } from "@/lib/pdf/templates/dashboard-summary";
import { OverdueReminderPdf } from "@/lib/pdf/templates/overdue-reminder";
import {
  getDashboardMetrics,
  type DashboardOptions,
} from "@/lib/services/dashboard-metrics";
import { capitalizeFirst } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";
import { formatPeriodLong } from "@/lib/format-date";

// day+month:"long"+year → no mapea a formatDate (que usa month short). Inline.
const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export interface GeneratedPdf {
  buffer: Buffer;
  filename: string;
  mimeType: "application/pdf";
  /** URL pública si se subió (R2 o /generated-pdfs/...). null si persist=false. */
  url: string | null;
  documentId: string | null;
}

export interface GenerateOptions {
  /** Si true, sube a R2 (o local) y crea fila en Document. Default: true. */
  persist?: boolean;
  uploadedById?: string | null;
}

// ============================================================================
// Estado de cuenta
// ============================================================================

export async function generateAccountStatement(
  tenantId: string,
  lesseeId: string,
  options: GenerateOptions = {},
): Promise<GeneratedPdf> {
  const persist = options.persist ?? true;

  // Datos: tenant + lessee + sus contratos con rents.
  const [tenant, lessee] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.lessee.findFirstOrThrow({
      where: { id: lesseeId, tenantId },
      include: {
        contracts: {
          orderBy: { startDate: "desc" },
          include: {
            unit: {
              select: {
                code: true,
                name: true,
                property: {
                  select: {
                    name: true,
                    managerEntity: {
                      select: { legalName: true, rfc: true, address: true },
                    },
                  },
                },
              },
            },
            rents: {
              orderBy: { period: "asc" },
            },
          },
        },
      },
    }),
  ]);

  // Asumimos que todos los contratos del lessee facturan por la misma
  // managerEntity. Si no, tomamos la del primer contrato (caso típico CRT).
  const billingEntity = lessee.contracts[0]?.unit.property.managerEntity ?? {
    legalName: tenant.name,
    rfc: null,
    address: null,
  };

  let totalDue = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  const contractBlocks = lessee.contracts.map((c) => {
    for (const r of c.rents) {
      totalDue = totalDue.plus(new Prisma.Decimal(r.amountDue));
      totalPaid = totalPaid.plus(new Prisma.Decimal(r.amountPaid));
    }
    return {
      contractId: c.id,
      propertyName: c.unit.property.name,
      unitCode: c.unit.code,
      unitName: c.unit.name,
      monthlyAmount: c.monthlyAmount.toString(),
      rents: c.rents.map((r) => ({
        period: r.period,
        amountDue: r.amountDue.toString(),
        amountPaid: r.amountPaid.toString(),
        status: r.status,
      })),
    };
  });
  const balance = totalDue.minus(totalPaid);

  const asOfDate = new Date();
  const tokens = {
    billingEntityName: billingEntity.legalName,
    asOfDate: capitalizeFirst(DATE.format(asOfDate)),
    lesseeName: lessee.legalName,
  };

  const buffer = await renderToBuffer(
    <AccountStatementPdf
      tenant={{
        name: tenant.name,
        brandLogoUrl: tenant.brandLogoUrl,
        brandPrimaryColor: tenant.brandPrimaryColor,
      }}
      billingEntity={billingEntity}
      lessee={{
        legalName: lessee.legalName,
        contactName: lessee.contactName,
        rfc: lessee.rfc,
      }}
      asOfDate={asOfDate}
      contracts={contractBlocks}
      totals={{
        totalDue: totalDue.toString(),
        totalPaid: totalPaid.toString(),
        balance: balance.toString(),
      }}
      contactInfo={buildContactInfo(billingEntity)}
      texts={{
        title: ACCOUNT_STATEMENT.title,
        intro: resolveTokens(ACCOUNT_STATEMENT.intro, tokens),
        closing: resolveTokens(ACCOUNT_STATEMENT.closing, tokens),
      }}
    />,
  );

  const filename = `estado-de-cuenta-${slug(lessee.legalName)}-${asOfDate
    .toISOString()
    .slice(0, 10)}.pdf`;

  if (!persist) {
    return { buffer, filename, mimeType: "application/pdf", url: null, documentId: null };
  }

  const { url } = await uploadFile(
    `${tenantId}/account-statements/${asOfDate.toISOString().slice(0, 10)}/${randomSuffix()}-${filename}`,
    buffer,
    "application/pdf",
  );

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: "OTHER",
      filename,
      url,
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
      uploadedById: options.uploadedById ?? null,
      notes: `Estado de cuenta de ${lessee.legalName} al ${capitalizeFirst(DATE.format(asOfDate))}.`,
    },
  });

  return {
    buffer,
    filename,
    mimeType: "application/pdf",
    url,
    documentId: doc.id,
  };
}

// ============================================================================
// Aviso de mora (1M / 2M / 3M)
// ============================================================================

export async function generateOverdueReminder(
  tenantId: string,
  rentId: string,
  level: ReminderLevel,
  options: GenerateOptions = {},
): Promise<GeneratedPdf> {
  const persist = options.persist ?? true;

  const [tenant, rent] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.rent.findFirstOrThrow({
      where: { id: rentId, tenantId },
      include: {
        contract: {
          include: {
            lessee: true,
            unit: {
              select: {
                code: true,
                name: true,
                property: {
                  select: {
                    name: true,
                    managerEntity: {
                      select: { legalName: true, rfc: true, address: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  // Otros rents pendientes del mismo contrato — para mostrar el adeudo total.
  const additional = await prisma.rent.findMany({
    where: {
      tenantId,
      contractId: rent.contractId,
      id: { not: rent.id },
      status: { in: ["DUE", "PARTIAL", "OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"] },
    },
    orderBy: { period: "asc" },
  });

  const now = new Date();
  const days = (d: Date) =>
    Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  const allRents = [rent, ...additional];
  const balance = allRents.reduce(
    (acc, r) =>
      acc.plus(new Prisma.Decimal(r.amountDue).minus(new Prisma.Decimal(r.amountPaid))),
    new Prisma.Decimal(0),
  );

  const billingEntity = rent.contract.unit.property.managerEntity;
  const lessee = rent.contract.lessee;
  const config = reminderConfigByLevel(level);
  const unitLabel = `${rent.contract.unit.property.name} ${rent.contract.unit.code}`;
  const contractSignedDate = rent.contract.signedDate
    ? capitalizeFirst(DATE.format(rent.contract.signedDate))
    : capitalizeFirst(DATE.format(rent.contract.startDate));

  const tokens: Record<string, string> = {
    lesseeName: lessee.legalName,
    period: formatPeriodLong(rent.period),
    unitLabel,
    daysOverdue: String(days(rent.dueDate)),
    balance: formatMXN(balance, 2),
    contractSignedDate,
    paymentDay: String(rent.contract.paymentDay),
    billingEntityName: billingEntity.legalName,
  };

  const buffer = await renderToBuffer(
    <OverdueReminderPdf
      level={level}
      tenant={{
        name: tenant.name,
        brandLogoUrl: tenant.brandLogoUrl,
        brandPrimaryColor: tenant.brandPrimaryColor,
      }}
      billingEntity={billingEntity}
      lessee={{
        legalName: lessee.legalName,
        contactName: lessee.contactName,
        rfc: lessee.rfc,
      }}
      unitLabel={unitLabel}
      primaryRent={{
        period: rent.period,
        amountDue: rent.amountDue.toString(),
        amountPaid: rent.amountPaid.toString(),
        daysOverdue: days(rent.dueDate),
        status: rent.status,
      }}
      additionalRents={additional.map((r) => ({
        period: r.period,
        amountDue: r.amountDue.toString(),
        amountPaid: r.amountPaid.toString(),
        daysOverdue: days(r.dueDate),
        status: r.status,
      }))}
      totals={{ balance: balance.toString() }}
      contactInfo={buildContactInfo(billingEntity)}
      asOfDate={now}
      texts={{
        title: config.title,
        greeting: resolveTokens(config.greeting, tokens),
        body: resolveTokens(config.body, tokens),
        legalNote: resolveTokens(config.legalNote, tokens),
        closing: resolveTokens(config.closing, tokens),
      }}
    />,
  );

  const filename = `aviso-${level.toLowerCase()}-${slug(lessee.legalName)}-${now
    .toISOString()
    .slice(0, 10)}.pdf`;

  if (!persist) {
    return { buffer, filename, mimeType: "application/pdf", url: null, documentId: null };
  }

  const { url } = await uploadFile(
    `${tenantId}/overdue-reminders/${level}/${now.toISOString().slice(0, 10)}/${randomSuffix()}-${filename}`,
    buffer,
    "application/pdf",
  );

  // Tipo de documento según nivel: 1M/2M = aviso, 3M = carta de desalojo.
  const docType = level === "3M" ? "EVICTION_LETTER" : "PAYMENT_REMINDER";

  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: docType,
      filename,
      url,
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
      uploadedById: options.uploadedById ?? null,
      contractId: rent.contractId,
      notes: `Aviso ${level} de ${lessee.legalName} — ${formatPeriodLong(rent.period)}.`,
    },
  });

  // NotificationLog: queda como PENDING (canal IN_PERSON) hasta que se mande
  // por WhatsApp/Email — eso lo conectaremos en Prompt 9.
  await prisma.notificationLog.create({
    data: {
      tenantId,
      recipientType: "LESSEE",
      recipientId: lessee.id,
      channel: "IN_PERSON",
      templateCode:
        level === "3M" ? "EVICTION_INITIATION" : `RENT_REMINDER_${level}`,
      subject: config.title,
      body: `PDF generado: ${filename}. URL: ${url}`,
      status: "PENDING",
    },
  });

  return {
    buffer,
    filename,
    mimeType: "application/pdf",
    url,
    documentId: doc.id,
  };
}

// ============================================================================
// Dashboard ejecutivo
// ============================================================================

export async function generateDashboardSummary(
  tenantId: string,
  options: DashboardOptions = {},
  generateOptions: GenerateOptions = {},
): Promise<GeneratedPdf> {
  const persist = generateOptions.persist ?? false;
  const [tenant, metrics] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    getDashboardMetrics(tenantId, options),
  ]);

  // Para el header del PDF tomamos la primera LegalEntity del tenant —
  // típicamente CRT, que es la operadora.
  const operatorEntity = await prisma.legalEntity.findFirst({
    where: { tenantId, isActive: true, isOperator: true },
    select: { legalName: true, rfc: true, address: true },
  });
  const fallback = await prisma.legalEntity.findFirst({
    where: { tenantId, isActive: true },
    select: { legalName: true, rfc: true, address: true },
  });
  const billingEntity = operatorEntity ??
    fallback ?? { legalName: tenant.name, rfc: null, address: null };

  const generatedAt = new Date();
  const buffer = await renderToBuffer(
    <DashboardSummaryPdf
      tenant={{
        name: tenant.name,
        brandLogoUrl: tenant.brandLogoUrl,
        brandPrimaryColor: tenant.brandPrimaryColor,
      }}
      billingEntity={billingEntity}
      contactInfo={buildContactInfo(billingEntity)}
      asOfMonth={metrics.asOf.month}
      generatedAt={generatedAt}
      summary={metrics.summary}
      byProperty={metrics.byProperty}
      byLegalEntity={metrics.byLegalEntity}
      topOverdue={metrics.topOverdue}
    />,
  );

  const filename = `dashboard-${metrics.asOf.month}.pdf`;

  if (!persist) {
    return { buffer, filename, mimeType: "application/pdf", url: null, documentId: null };
  }

  const { url } = await uploadFile(
    `${tenantId}/dashboard-exports/${metrics.asOf.month}/${randomSuffix()}-${filename}`,
    buffer,
    "application/pdf",
  );
  const doc = await prisma.document.create({
    data: {
      tenantId,
      type: "OTHER",
      filename,
      url,
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
      uploadedById: generateOptions.uploadedById ?? null,
      notes: `Dashboard ejecutivo — ${metrics.asOf.month}.`,
    },
  });

  return { buffer, filename, mimeType: "application/pdf", url, documentId: doc.id };
}

// ============================================================================
// Helpers
// ============================================================================

function buildContactInfo(billingEntity: {
  legalName: string;
  rfc: string | null;
  address: string | null;
}): string {
  const parts = [billingEntity.legalName];
  if (billingEntity.rfc) parts.push(`RFC ${billingEntity.rfc}`);
  if (billingEntity.address) parts.push(billingEntity.address);
  return parts.join(" · ");
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
