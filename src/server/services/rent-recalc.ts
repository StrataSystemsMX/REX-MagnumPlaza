import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/prisma/client";
import { computeRentStatus } from "@/server/services/rent-status";
import { calculateLateFee } from "@/server/services/late-fees";

/** Cliente transaccional de Prisma (el `tx` de `prisma.$transaction`). */
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Recalcula amountPaid (suma de Payments asociados) y status del Rent.
 * Debe correr dentro de la misma transacción que crea/borra el Payment para
 * que la suma incluya/excluya correctamente el movimiento recién hecho.
 *
 * Respeta WAIVED: si el operador condonó la renta no recalculamos el status.
 *
 * Vive en su propio módulo (no en payments.ts) para poder reutilizarse desde
 * el deshacer del historial sin acoplarse a un archivo `"use server"`.
 */
export async function recalcRentInTx(
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
    select: {
      amountDue: true,
      dueDate: true,
      status: true,
      amountWaived: true,
      lateFeeAccrued: true,
      contract: { select: { lateFeePercentage: true } },
    },
  });

  // Si la renta fue completamente condonada (WAIVED puro, sin pagos), no
  // modificamos el status — sigue siendo terminal hasta que el operador
  // reverse la condonación.
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

  // Interés moratorio. Política CRT (docs/decisiones-negocio-pendientes.md #1):
  // si el principal queda saldado CON PAGOS tardíos, el interés ya devengado se
  // CONGELA (sigue exigible como concepto aparte — computeBalance lo suma al
  // adeudo) en vez de limpiarse. El snapshot congelado es el que mantuvo el
  // cron diario, así que su devengo corre hasta la víspera del pago.
  // La condonación (waived cubre el principal sin pagos) sí perdona el interés.
  const principalBalance = new Prisma.Decimal(rent.amountDue)
    .minus(amountPaid)
    .minus(new Prisma.Decimal(rent.amountWaived ?? 0));
  const settledWithPayments = principalBalance.lte(0) && amountPaid.gt(0);
  const lateFeeAccrued = settledWithPayments
    ? new Prisma.Decimal(rent.lateFeeAccrued ?? 0)
    : calculateLateFee(
        { amountDue: rent.amountDue, amountPaid, amountWaived: rent.amountWaived, dueDate: rent.dueDate, status },
        { lateFeePercentage: rent.contract?.lateFeePercentage ?? null },
        now,
      ).amount.toDecimalPlaces(2);

  await tx.rent.updateMany({
    where: { id: rentId, tenantId },
    data: { amountPaid, status, lateFeeAccrued },
  });

  return { amountPaid, status };
}
