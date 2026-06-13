"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { getOutstandingRentsForLessee } from "@/lib/services/payments-queries";
import { sendPaymentConfirmation } from "@/lib/services/notifications";
import { computeRentStatus } from "@/lib/services/rent-status";
import {
  bulkPaymentSchema,
  registerPaymentSchema,
  waiveRentsSchema,
  type BulkPaymentInput,
  type RegisterPaymentInput,
  type WaiveRentsInput,
} from "@/lib/validators/payment";
import type { PaymentModel } from "@/generated/prisma/models";
import type { RentStatus } from "@/generated/prisma/enums";
import { capitalizeFirst } from "@/lib/utils";

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
    select: { amountDue: true, dueDate: true, status: true, amountWaived: true },
  });

  // Si la renta fue completamente condonada (WAIVED puro, sin pagos), no
  // modificamos el status — sigue siendo terminal hasta que el operador
  // reverse la condonación. Cualquier pago entrante hace que el flujo normal
  // recalcule (puede pasar de WAIVED a PAID si llega pago manual posterior).
  const isFullyWaivedPure =
    rent.status === "WAIVED" &&
    amountPaid.eq(0) &&
    new Prisma.Decimal(rent.amountWaived ?? 0).gte(rent.amountDue);

  const status = isFullyWaivedPure
    ? "WAIVED"
    : computeRentStatus(
        amountPaid,
        rent.amountDue,
        rent.dueDate,
        now,
        rent.amountWaived,
      );

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
 *
 * Escribe AuditLog con paymentId aunque el envío quede PENDING — así el
 * botón "Enviar" de la bitácora puede recuperar el paymentId después.
 */
async function dispatchRentPaidEvent(
  tenantId: string,
  paymentId: string,
  userId: string,
): Promise<void> {
  try {
    const result = await sendPaymentConfirmation(tenantId, paymentId);
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "CREATE",
        entityType: "NotificationLog",
        entityId: result.notificationLogId,
        changes: {
          manual: false,
          paymentId,
          status: result.status,
          externalId: result.externalId,
          failureReason: result.failureReason,
        },
      },
    });
  } catch (e) {
    console.error(
      `[payments] sendPaymentConfirmation failed (payment ${paymentId}):`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Aplicación automática de sobrante: si el monto registrado supera el saldo de
 * la renta seleccionada, el excedente se reparte sobre las demás rentas impagas
 * del mismo contrato dentro del MISMO AÑO, en orden cronológico (de la más
 * antigua a la más reciente). Así los meses anteriores al seleccionado que aún
 * deben pago se liquidan primero, y solo después los meses siguientes del año.
 * Si tras cubrir el año todavía sobra, el remanente queda como saldo a favor en
 * la renta original.
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
      amountWaived: true,
    },
  });
  if (!rent) {
    throw new Error("Renta no encontrada o fuera de tu tenant.");
  }

  // Saldo real = cargo - pagado - condonado. La condonación NO se cuenta como
  // saldo cobrable (si no, el pago se acumula y produce saldo negativo).
  const balance = new Prisma.Decimal(rent.amountDue)
    .minus(new Prisma.Decimal(rent.amountPaid))
    .minus(new Prisma.Decimal(rent.amountWaived ?? 0));
  const total = new Prisma.Decimal(data.amount);
  const excess = total.greaterThan(balance)
    ? total.minus(balance)
    : new Prisma.Decimal(0);
  const primaryAmount = excess.greaterThan(0)
    ? Prisma.Decimal.max(balance, new Prisma.Decimal(0))
    : total;

  // Si hay sobrante, prefetch de las demás rentas impagas del MISMO AÑO del mes
  // seleccionado (no PAID/WAIVED), en orden cronológico ascendente. Así el
  // excedente liquida primero los meses más antiguos —incluidos los anteriores
  // al mes seleccionado— y solo después los siguientes.
  // Incluimos amountWaived para calcular su saldo real al cascadear.
  const yearStart = new Date(Date.UTC(rent.period.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(rent.period.getUTCFullYear() + 1, 0, 1));
  const cascadeRents = excess.greaterThan(0)
    ? await prisma.rent.findMany({
        where: {
          tenantId,
          contractId: rent.contractId,
          id: { not: rent.id },
          period: { gte: yearStart, lt: yearEnd },
          status: { notIn: ["PAID", "WAIVED"] },
        },
        orderBy: { period: "asc" },
        select: {
          id: true,
          period: true,
          amountDue: true,
          amountPaid: true,
          amountWaived: true,
        },
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

    // 2. Cascada del sobrante sobre las demás rentas impagas del año, de la más
    //    antigua a la más reciente (los meses anteriores al seleccionado se
    //    liquidan primero).
    let remaining = excess;
    const cascade: Array<{
      paymentId: string;
      rentId: string;
      period: Date;
      amount: Prisma.Decimal;
      status: string;
    }> = [];

    for (const cr of cascadeRents) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const crBalance = new Prisma.Decimal(cr.amountDue)
        .minus(new Prisma.Decimal(cr.amountPaid))
        .minus(new Prisma.Decimal(cr.amountWaived ?? 0));
      if (crBalance.lessThanOrEqualTo(0)) continue;
      const apply = Prisma.Decimal.min(remaining, crBalance);
      const noteSuffix = `Aplicado automáticamente desde sobrante de la renta de ${formatPeriodEs(rent.period)}.`;
      const cascadePayment = await tx.payment.create({
        data: {
          tenantId,
          rentId: cr.id,
          amount: apply,
          paymentDate: data.paymentDate,
          method: data.method,
          reference: data.reference,
          notes: data.notes ? `${data.notes}\n${noteSuffix}` : noteSuffix,
        },
      });
      const recalc = await recalcRentInTx(tx, tenantId, cr.id, now);
      cascade.push({
        paymentId: cascadePayment.id,
        rentId: cr.id,
        period: cr.period,
        amount: apply,
        status: recalc.status,
      });
      remaining = remaining.minus(apply);
    }

    // 3. Si tras cubrir las mensualidades del año sigue sobrando, el remanente
    //    queda como saldo a favor en la renta original.
    let remainderAmount = new Prisma.Decimal(0);
    if (remaining.greaterThan(0)) {
      const remainderNote =
        "Sobrante a favor: no hay más mensualidades pendientes del año en este contrato.";
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
    await dispatchRentPaidEvent(tenantId, result.primary.id, dbUser.id);
  }
  for (const c of result.cascade) {
    if (c.status === "PAID") {
      await dispatchRentPaidEvent(tenantId, c.paymentId, dbUser.id);
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
  return capitalizeFirst(PERIOD_ES.format(d));
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
      await dispatchRentPaidEvent(tenantId, p.id, dbUser.id);
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

/**
 * Indica si el usuario actual puede condonar rentas. Solo MASTER/ADMIN.
 * Usado por la UI para mostrar u ocultar el botón "Condonar".
 */
export async function actionCanWaiveRent(): Promise<boolean> {
  const { dbUser } = await requireAuth();
  const codes = await getUserRoleCodes(dbUser.id);
  return codes.includes("MASTER") || codes.includes("ADMIN");
}

/**
 * Establece (REEMPLAZA) la condonación de una o más rentas. Solo MASTER/ADMIN.
 *
 * Semánticas: `amount` es el nuevo total de `amountWaived`, NO un incremento.
 *   - amount = 0     → quita la condonación (si había). Si no había, se ignora.
 *   - amount > 0     → reemplaza amountWaived con el valor exacto.
 *   - amount > (amountDue - amountPaid) → error (no se puede condonar más del cargo neto).
 *
 * Reglas:
 *  - El status se recalcula tras el cambio (PAID/WAIVED/PARTIAL/DUE/…).
 *  - El motivo se apenda a `rent.notes` (autor + timestamp).
 *  - Cada renta afectada genera un AuditLog con el delta.
 */
export async function actionWaiveRents(input: WaiveRentsInput): Promise<{
  affected: Array<{
    rentId: string;
    period: Date;
    amountWaived: number;
    status: string;
  }>;
  totalWaived: number;
}> {
  const { tenantId, dbUser } = await requireAuth();

  const codes = await getUserRoleCodes(dbUser.id);
  if (!codes.includes("MASTER") && !codes.includes("ADMIN")) {
    throw new Error("Solo MASTER o ADMIN pueden condonar rentas.");
  }

  const { items, reason } = waiveRentsSchema.parse(input);

  if (items.length === 0) {
    throw new Error("Selecciona al menos una renta.");
  }

  const rentIds = items.map((it) => it.rentId);
  const rents = await prisma.rent.findMany({
    where: { id: { in: rentIds }, tenantId },
    select: {
      id: true,
      period: true,
      amountDue: true,
      amountPaid: true,
      amountWaived: true,
      dueDate: true,
      status: true,
      notes: true,
      contractId: true,
    },
  });
  const byId = new Map(rents.map((r) => [r.id, r]));

  // Valida todos los ítems antes de tocar nada (fallar rápido).
  for (const it of items) {
    const r = byId.get(it.rentId);
    if (!r) {
      throw new Error(`Renta ${it.rentId} no encontrada o fuera de tu tenant.`);
    }
    const maxWaivable = r.amountDue.minus(r.amountPaid).toNumber();
    if (it.amount > maxWaivable + 0.0001) {
      throw new Error(
        `El monto ${it.amount.toFixed(2)} excede lo condonable (máx ${maxWaivable.toFixed(2)}) en la renta ${r.period.toISOString().slice(0, 7)}.`,
      );
    }
  }

  const stamp = new Date().toISOString();
  const author = dbUser.name ?? dbUser.email ?? "—";
  const affected: Array<{
    rentId: string;
    period: Date;
    amountWaived: number;
    status: string;
  }> = [];
  let totalWaived = 0;
  const contractIds = new Set<string>();

  const now = new Date();

  for (const it of items) {
    const r = byId.get(it.rentId);
    if (!r) continue;

    const target = new Prisma.Decimal(it.amount.toFixed(2));

    // No-op: no había condonación y la nueva es 0.
    if (target.eq(0) && r.amountWaived.eq(0)) continue;

    const isRemoval = target.eq(0);
    const isReplace = !isRemoval && !target.eq(r.amountWaived);
    const delta = target.minus(r.amountWaived);

    const newBalance = r.amountDue.minus(r.amountPaid).minus(target);

    // status: si saldo == 0 y no hubo pagos, marcamos WAIVED. Si hubo pagos
    // parciales y la condonación cierra la deuda, queda PAID. Si la condonación
    // es parcial, recalcular con el gradiente normal.
    let newStatus: RentStatus;
    if (newBalance.lte(0) && target.gt(0)) {
      newStatus = r.amountPaid.eq(0) ? "WAIVED" : "PAID";
    } else {
      newStatus = computeRentStatus(
        r.amountPaid,
        r.amountDue,
        r.dueDate,
        now,
        target,
      );
    }

    const action = isRemoval
      ? `Condonación REMOVIDA (era ${MXNFormat(Number(r.amountWaived))})`
      : isReplace
        ? `Condonación ACTUALIZADA de ${MXNFormat(Number(r.amountWaived))} a ${MXNFormat(it.amount)}`
        : `Condonado ${MXNFormat(it.amount)}`;
    const noteLine = `[${action} — ${stamp} por ${author}] ${reason}`;
    const newNotes = r.notes ? `${r.notes}\n${noteLine}` : noteLine;

    await prisma.rent.updateMany({
      where: { id: r.id, tenantId },
      data: {
        amountWaived: target,
        status: newStatus,
        notes: newNotes,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: dbUser.id,
        action: "UPDATE",
        entityType: "Rent",
        entityId: r.id,
        changes: {
          op: isRemoval ? "WAIVE_REMOVE" : isReplace ? "WAIVE_UPDATE" : "WAIVE",
          reason,
          previousWaived: r.amountWaived.toString(),
          newWaived: target.toString(),
          delta: delta.toString(),
          previousStatus: r.status,
          newStatus,
          period: r.period.toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    affected.push({
      rentId: r.id,
      period: r.period,
      amountWaived: Number(target),
      status: newStatus,
    });
    totalWaived += Number(target);
    contractIds.add(r.contractId);
  }

  revalidatePath("/ingresos");
  revalidatePath("/collections");
  for (const cid of contractIds) {
    revalidatePath(`/contracts/${cid}`);
  }

  return { affected, totalWaived };
}

const MXN_FORMAT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
function MXNFormat(n: number): string {
  return MXN_FORMAT.format(n);
}
