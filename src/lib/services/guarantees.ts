"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  applyGuaranteeToDebtSchema,
  createGuaranteeSchema,
  returnGuaranteeSchema,
  type ApplyGuaranteeToDebtInput,
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
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType: "Guarantee",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

export async function actionCreateGuarantee(input: CreateGuaranteeInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

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
  await requirePermission(dbUser.id, "expense.update");

  const data = returnGuaranteeSchema.parse(input);

  const guarantee = await prisma.guarantee.findFirstOrThrow({
    where: { id: data.guaranteeId, tenantId, status: { in: ["HELD", "PARTIALLY_RETURNED"] } },
    select: { id: true, amount: true, contractId: true },
  });

  const totalDeductions = data.deductions.reduce((acc, d) => acc + d.amount, 0);
  const newStatus =
    data.returnedAmount >= guarantee.amount.toNumber() - totalDeductions
      ? "RETURNED"
      : "PARTIALLY_RETURNED";

  const updated = await prisma.guarantee.update({
    where: { id: data.guaranteeId },
    data: {
      status: newStatus,
      returnedDate: data.returnedDate,
      returnedAmount: new Prisma.Decimal(data.returnedAmount),
      deductions: data.deductions.length > 0 ? (data.deductions as Prisma.InputJsonValue) : Prisma.JsonNull,
      notes: data.notes ?? null,
    },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", guarantee.id, {
    action: "RETURN",
    returnedAmount: data.returnedAmount,
    deductions: data.deductions,
    newStatus,
  });

  revalidatePath("/fianzas");
  revalidatePath(`/contracts/${guarantee.contractId}`);
  return updated;
}

export async function actionApplyGuaranteeToDebt(input: ApplyGuaranteeToDebtInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  const data = applyGuaranteeToDebtSchema.parse(input);

  const guarantee = await prisma.guarantee.findFirstOrThrow({
    where: { id: data.guaranteeId, tenantId, status: { in: ["HELD", "PARTIALLY_RETURNED"] } },
    select: { id: true, contractId: true },
  });

  const updated = await prisma.guarantee.update({
    where: { id: data.guaranteeId },
    data: {
      status: "APPLIED_TO_DEBT",
      notes: data.notes ?? null,
    },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", guarantee.id, {
    action: "APPLY_TO_DEBT",
    notes: data.notes,
  });

  revalidatePath("/fianzas");
  revalidatePath(`/contracts/${guarantee.contractId}`);
  return updated;
}
