"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { getOutstandingRentsForLessee } from "@/lib/services/payments-queries";
import { sendPaymentConfirmation } from "@/lib/services/notifications";
import { computeRentStatus } from "@/lib/services/rent-status";
import {
  bulkPaymentSchema,
  registerPaymentSchema,
  type BulkPaymentInput,
  type RegisterPaymentInput,
} from "@/lib/validators/payment";
import type { PaymentModel } from "@/generated/prisma/models";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function decimal(n: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "DELETE",
  entityId: string,
  changes: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType: "Payment",
      entityId,
      changes,
    },
  });
}

/**
 * Recalcula amountPaid (suma de Payments asociados) y status del Rent.
 * Debe correr dentro de la misma transacción que crea/borra el Payment para
 * que la suma incluya/excluya correctamente el movimiento recién hecho.
 *
 * Respeta WAIVED: si el operador condonó la renta no recalculamos el status.
 */
async function recalcRentInTx(
  tx: TxClient,
  tenantId: string,
  rentId: string,
  now: Date,
): Promise<{ amountPaid: Prisma.Decimal; status: string }> {
  const payments = await tx.payment.findMany({
    where: { tenantId, rentId },
    select: { amount: true },
  });
  const amountPaid = payments.reduce(
    (acc, p) => acc.plus(new Prisma.Decimal(p.amount)),
    new Prisma.Decimal(0),
  );

  const rent = await tx.rent.findFirstOrThrow({
    where: { id: rentId, tenantId },
    select: { amountDue: true, dueDate: true, status: true },
  });

  const status =
    rent.status === "WAIVED"
      ? "WAIVED"
      : computeRentStatus(amountPaid, rent.amountDue, rent.dueDate, now);

  await tx.rent.updateMany({
    where: { id: rentId, tenantId },
    data: { amountPaid, status },
  });

  return { amountPaid, status };
}

/**
 * Cuando un Rent queda PAID dispara la confirmación por WhatsApp.
 * Respeta el flag tenant.autoSendPaymentConfirmations: si está apagado
 * solo crea el NotificationLog en PENDING para que el operador lo mande
 * manualmente. Errores se loguean pero NO abortan el registro del pago
 * — la cobranza es lo crítico, la notificación es secundaria.
 */
async function dispatchRentPaidEvent(tenantId: string, paymentId: string): Promise<void> {
  try {
    await sendPaymentConfirmation(tenantId, paymentId);
  } catch (e) {
    console.error(
      `[payments] sendPaymentConfirmation failed (payment ${paymentId}):`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Aplicación automática de sobrante: si el monto registrado supera el saldo de
 * la renta seleccionada, el excedente se reparte sobre las rentas futuras del
 * mismo contrato en orden cronológico hasta agotarse. Si tras cubrir todas las
 * futuras todavía sobra, el remanente queda en la renta original como ABONO.
 */
export interface RegisterPaymentResult {
  payment: PaymentModel;
  rentStatus: string;
  cascade: Array<{ rentId: string; period: Date; amount: number; status: string }>;
  remainderApplied: number;
}

export async function actionRegisterPayment(
  input: RegisterPaymentInput,
): Promise<RegisterPaymentResult> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "payment.register");

  const data = registerPaymentSchema.parse(input);

  // Verificar que el Rent pertenece al tenant + obtener contractId/period/saldo.
  const rent = await prisma.rent.findFirst({
    where: { id: data.rentId, tenantId },
    select: {
      id: true,
      contractId: true,
      period: true,
      amountDue: true,
      amountPaid: true,
    },
  });
  if (!rent) {
    throw new Error("Renta no encontrada o fuera de tu tenant.");
  }

  const balance = new Prisma.Decimal(rent.amountDue).minus(
    new Prisma.Decimal(rent.amountPaid),
  );
  const total = new Prisma.Decimal(data.amount);
  const excess = total.greaterThan(balance)
    ? total.minus(balance)
    : new Prisma.Decimal(0);
  const primaryAmount = excess.greaterThan(0) ? balance : total;

  // Si hay sobrante, prefetch de rentas futuras del mismo contrato (no PAID/WAIVED).
  const futureRents = excess.greaterThan(0)
    ? await prisma.rent.findMany({
        where: {
          tenantId,
          contractId: rent.contractId,
          period: { gt: rent.period },
          status: { notIn: ["PAID", "WAIVED"] },
        },
        orderBy: { period: "asc" },
        select: { id: true, period: true, amountDue: true, amountPaid: true },
      })
    : [];

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    // 1. Pago primario sobre la renta seleccionada (capped al saldo si hubo sobrante).
    const primary = await tx.payment.create({
      data: {
        tenantId,
        rentId: data.rentId,
        amount: primaryAmount,
        paymentDate: data.paymentDate,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
      },
    });
    const primaryRecalc = await recalcRentInTx(tx, tenantId, data.rentId, now);

    // 2. Cascada del sobrante sobre rentas futuras del mismo contrato.
    let remaining = excess;
    const cascade: Array<{
      paymentId: string;
      rentId: string;
      period: Date;
      amount: Prisma.Decimal;
      status: string;
    }> = [];

    for (const fr of futureRents) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const frBalance = new Prisma.Decimal(fr.amountDue).minus(
        new Prisma.Decimal(fr.amountPaid),
      );
      if (frBalance.lessThanOrEqualTo(0)) continue;
      const apply = Prisma.Decimal.min(remaining, frBalance);
      const noteSuffix = `Aplicado automáticamente desde sobrante de la renta de ${formatPeriodEs(rent.period)}.`;
      const cascadePayment = await tx.payment.create({
        data: {
          tenantId,
          rentId: fr.id,
          amount: apply,
          paymentDate: data.paymentDate,
          method: data.method,
          reference: data.reference,
          notes: data.notes ? `${data.notes}\n${noteSuffix}` : noteSuffix,
        },
      });
      const recalc = await recalcRentInTx(tx, tenantId, fr.id, now);
      cascade.push({
        paymentId: cascadePayment.id,
        rentId: fr.id,
        period: fr.period,
        amount: apply,
        status: recalc.status,
      });
      remaining = remaining.minus(apply);
    }

    // 3. Si tras todas las futuras sigue sobrando, el remanente queda en la renta
    //    original como ABONO (no había más mensualidades a cubrir).
    let remainderAmount = new Prisma.Decimal(0);
    if (remaining.greaterThan(0)) {
      const remainderNote =
        "Sobrante a favor: no hay más mensualidades pendientes en este contrato.";
      await tx.payment.create({
        data: {
          tenantId,
          rentId: data.rentId,
          amount: remaining,
          paymentDate: data.paymentDate,
          method: data.method,
          reference: data.reference,
          notes: data.notes ? `${data.notes}\n${remainderNote}` : remainderNote,
        },
      });
      await recalcRentInTx(tx, tenantId, data.rentId, now);
      remainderAmount = remaining;
    }

    return {
      primary,
      primaryStatus: primaryRecalc.status,
      cascade,
      remainderAmount,
    };
  });

  // Audit log por cada Payment creado.
  await logAudit(tenantId, dbUser.id, "CREATE", result.primary.id, {
    rentId: data.rentId,
    amount: primaryAmount.toString(),
    method: data.method,
    paymentDate: data.paymentDate.toISOString(),
    rentStatusAfter: result.primaryStatus,
  });
  for (const c of result.cascade) {
    await logAudit(tenantId, dbUser.id, "CREATE", c.paymentId, {
      rentId: c.rentId,
      amount: c.amount.toString(),
      method: data.method,
      paymentDate: data.paymentDate.toISOString(),
      cascadedFrom: data.rentId,
      rentStatusAfter: c.status,
    });
  }

  // Notificar por cada renta que quedó PAID.
  if (result.primaryStatus === "PAID") {
    await dispatchRentPaidEvent(tenantId, result.primary.id);
  }
  for (const c of result.cascade) {
    if (c.status === "PAID") {
      await dispatchRentPaidEvent(tenantId, c.paymentId);
    }
  }

  revalidatePath("/collections");
  revalidatePath("/ingresos");

  return {
    payment: result.primary,
    rentStatus: result.primaryStatus,
    cascade: result.cascade.map((c) => ({
      rentId: c.rentId,
      period: c.period,
      amount: c.amount.toNumber(),
      status: c.status,
    })),
    remainderApplied: result.remainderAmount.toNumber(),
  };
}

const PERIOD_ES = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatPeriodEs(d: Date): string {
  return PERIOD_ES.format(d);
}

export async function actionRegisterBulkPayment(input: BulkPaymentInput): Promise<{
  payments: PaymentModel[];
  rentsUpdated: number;
}> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "payment.register");

  const data = bulkPaymentSchema.parse(input);

  // Verificar que todos los Rents pertenecen al lessee y tenant.
  const rents = await prisma.rent.findMany({
    where: {
      tenantId,
      id: { in: data.splitByRent.map((s) => s.rentId) },
      contract: { lesseeId: data.lesseeId },
    },
    select: { id: true },
  });
  if (rents.length !== data.splitByRent.length) {
    throw new Error(
      "Una o más rentas no pertenecen a este inquilino o no están en tu tenant.",
    );
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const payments: PaymentModel[] = [];
    const statuses: Array<{ rentId: string; status: string }> = [];
    for (const split of data.splitByRent) {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          rentId: split.rentId,
          amount: decimal(split.amount),
          paymentDate: data.paymentDate,
          method: data.method,
          reference: data.reference,
          notes: data.notes,
        },
      });
      payments.push(payment);
      const recalc = await recalcRentInTx(tx, tenantId, split.rentId, now);
      statuses.push({ rentId: split.rentId, status: recalc.status });
    }
    return { payments, statuses };
  });

  for (let i = 0; i < result.payments.length; i++) {
    const p = result.payments[i]!;
    const s = result.statuses[i]!;
    await logAudit(tenantId, dbUser.id, "CREATE", p.id, {
      rentId: s.rentId,
      amount: data.splitByRent[i]!.amount,
      method: data.method,
      paymentDate: data.paymentDate.toISOString(),
      bulk: true,
      rentStatusAfter: s.status,
    });
    if (s.status === "PAID") {
      await dispatchRentPaidEvent(tenantId, p.id);
    }
  }

  revalidatePath("/collections");
  return { payments: result.payments, rentsUpdated: result.payments.length };
}

/**
 * Sólo MASTER puede borrar pagos. Como no se siembra el permission
 * "payment.delete" para ningún rol, MASTER pasa por el bypass de
 * hasPermission y el resto cae con PermissionError.
 */
export async function actionDeletePayment(id: string): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "payment.delete");

  const payment = await prisma.payment.findFirst({
    where: { id, tenantId },
    select: { id: true, rentId: true, amount: true, paymentDate: true, method: true },
  });
  if (!payment) {
    throw new Error("Pago no encontrado o fuera de tu tenant.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { id, tenantId } });
    await recalcRentInTx(tx, tenantId, payment.rentId, now);
  });

  await logAudit(tenantId, dbUser.id, "DELETE", id, {
    rentId: payment.rentId,
    amount: payment.amount.toString(),
    paymentDate: payment.paymentDate.toISOString(),
    method: payment.method,
  });

  revalidatePath("/collections");
}

/** Server Action wrapper: lista los Rents pendientes de un Lessee. */
export async function actionGetOutstandingRentsForLessee(lesseeId: string) {
  return getOutstandingRentsForLessee(lesseeId);
}
