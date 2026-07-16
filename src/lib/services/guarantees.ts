"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { logAudit as logAuditCore } from "@/lib/services/audit";
import {
  createGuaranteeSchema,
  returnGuaranteeSchema,
  type CreateGuaranteeInput,
  type ReturnGuaranteeInput,
} from "@/lib/validators/guarantee";

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
) {
  await logAuditCore({ tenantId, userId, action, entityType: "Guarantee", entityId, changes });
}

export async function actionCreateGuarantee(input: CreateGuaranteeInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "guarantee.create");

  const data = createGuaranteeSchema.parse(input);

  await prisma.contract.findFirstOrThrow({
    where: { id: data.contractId, tenantId },
    select: { id: true },
  });

  const guarantee = await prisma.guarantee.create({
    data: {
      tenantId,
      contractId: data.contractId,
      amount: new Prisma.Decimal(data.amount),
      receivedDate: data.receivedDate,
      notes: data.notes ?? null,
      status: "HELD",
    },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", guarantee.id, {
    amount: data.amount,
    contractId: data.contractId,
  });

  revalidatePath("/fianzas");
  revalidatePath(`/contracts/${data.contractId}`);
  return guarantee;
}

export async function actionReturnGuarantee(input: ReturnGuaranteeInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "guarantee.update");

  const data = returnGuaranteeSchema.parse(input);

  const guarantee = await prisma.guarantee.findFirstOrThrow({
    where: {
      id: data.guaranteeId,
      tenantId,
      status: { in: ["HELD", "PARTIALLY_RETURNED", "RETURNED"] },
    },
    select: { id: true, amount: true, contractId: true },
  });

  const depositAmount = guarantee.amount.toNumber();
  if (data.returnedAmount > depositAmount) {
    throw new Error(
      `El monto devuelto no puede exceder el depósito original ($${depositAmount.toFixed(2)}).`,
    );
  }

  const totalDeductions = data.deductions.reduce((acc, d) => acc + d.amount, 0);
  const newStatus =
    data.returnedAmount >= depositAmount - totalDeductions
      ? "RETURNED"
      : "PARTIALLY_RETURNED";

  // Devolución + regeneración de mantenimientos por deducciones en UNA
  // transacción: un fallo a medias no debe dejar la fianza devuelta sin sus
  // mantenimientos (o viceversa).
  await prisma.$transaction(async (tx) => {
    await tx.guarantee.updateMany({
      where: { id: data.guaranteeId, tenantId },
      data: {
        status: newStatus,
        returnedDate: data.returnedDate,
        returnedAmount: new Prisma.Decimal(data.returnedAmount),
        deductions:
          data.deductions.length > 0
            ? (data.deductions as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        notes: data.notes ?? null,
      },
    });

    // Sincroniza las deducciones por daños como mantenimientos correctivos
    // (responsabilidad del inquilino, marcados completados). Los identificamos
    // con un marcador en `notes` para regenerarlos limpiamente si la devolución
    // se edita más adelante.
    const deductionMarker = `[deposit:${guarantee.id}]`;
    await tx.maintenance.deleteMany({
      where: { tenantId, notes: { contains: deductionMarker } },
    });

    if (data.deductions.length > 0) {
      const contract = await tx.contract.findFirstOrThrow({
        where: { id: guarantee.contractId, tenantId },
        select: { unit: { select: { id: true, propertyId: true } } },
      });

      await tx.maintenance.createMany({
        data: data.deductions.map((d) => ({
          tenantId,
          propertyId: contract.unit.propertyId,
          unitId: contract.unit.id,
          title: d.concept,
          type: "CORRECTIVE" as const,
          responsibility: "LESSEE" as const,
          status: "COMPLETED" as const,
          completedDate: data.returnedDate,
          cost: new Prisma.Decimal(d.amount),
          notes: `Generado desde devolución de fianza ${deductionMarker}`,
        })),
      });
    }
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", guarantee.id, {
    action: "RETURN",
    returnedAmount: data.returnedAmount,
    deductions: data.deductions,
    newStatus,
  });

  revalidatePath("/fianzas");
  revalidatePath("/mantenimientos");
  revalidatePath(`/contracts/${guarantee.contractId}`);
}
