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

export async function actionRegisterPayment(
  input: RegisterPaymentInput,
): Promise<{ payment: PaymentModel; rentStatus: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "payment.register");

  const data = registerPaymentSchema.parse(input);

  // Verificar que el Rent pertenece al tenant.
  const rent = await prisma.rent.findFirst({
    where: { id: data.rentId, tenantId },
    select: { id: true },
  });
  if (!rent) {
    throw new Error("Renta no encontrada o fuera de tu tenant.");
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        tenantId,
        rentId: data.rentId,
        amount: decimal(data.amount),
        paymentDate: data.paymentDate,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
      },
    });
    const recalc = await recalcRentInTx(tx, tenantId, data.rentId, now);
    return { payment, rentStatus: recalc.status };
  });

  await logAudit(tenantId, dbUser.id, "CREATE", result.payment.id, {
    rentId: data.rentId,
    amount: data.amount,
    method: data.method,
    paymentDate: data.paymentDate.toISOString(),
    rentStatusAfter: result.rentStatus,
  });

  if (result.rentStatus === "PAID") {
    await dispatchRentPaidEvent(tenantId, result.payment.id);
  }

  revalidatePath("/collections");
  return result;
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
