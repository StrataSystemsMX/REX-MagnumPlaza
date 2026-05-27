"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createPayrollSchema,
  deletePayrollSchema,
  updatePayrollSchema,
  type CreatePayrollInput,
  type DeletePayrollInput,
  type UpdatePayrollInput,
} from "@/lib/validators/payroll";

const PAYROLL_PERM = {
  create: "expense.create",
  update: "expense.update",
  delete: "expense.delete",
} as const;

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType: "Payroll",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

function toPeriod(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

async function ensureLegalEntityInTenant(
  tenantId: string,
  legalEntityId: string,
): Promise<void> {
  await prisma.legalEntity.findFirstOrThrow({
    where: { id: legalEntityId, tenantId, isActive: true },
    select: { id: true },
  });
}

export async function actionCreatePayroll(
  input: CreatePayrollInput,
): Promise<{ id: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, PAYROLL_PERM.create);

  const data = createPayrollSchema.parse(input);
  await ensureLegalEntityInTenant(tenantId, data.legalEntityId);

  const created = await prisma.payroll.create({
    data: {
      tenantId,
      legalEntityId: data.legalEntityId,
      period: toPeriod(data.year, data.month),
      type: data.type,
      amount: decimal(data.amount),
      amountWithoutTax:
        data.amountWithoutTax !== undefined
          ? decimal(data.amountWithoutTax)
          : null,
      taxAmount: data.taxAmount !== undefined ? decimal(data.taxAmount) : null,
      description: data.description ?? null,
      notes: data.notes ?? null,
    },
    select: { id: true },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", created.id, {
    legalEntityId: data.legalEntityId,
    year: data.year,
    month: data.month,
    type: data.type,
    amount: data.amount,
  });

  revalidatePath("/nominas");
  return created;
}

export async function actionUpdatePayroll(
  input: UpdatePayrollInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, PAYROLL_PERM.update);

  const data = updatePayrollSchema.parse(input);
  await ensureLegalEntityInTenant(tenantId, data.legalEntityId);

  // Tenant guardrail antes de mutar.
  await prisma.payroll.findFirstOrThrow({
    where: { id: data.id, tenantId },
    select: { id: true },
  });

  await prisma.payroll.update({
    where: { id: data.id, tenantId },
    data: {
      legalEntityId: data.legalEntityId,
      period: toPeriod(data.year, data.month),
      type: data.type,
      amount: decimal(data.amount),
      amountWithoutTax:
        data.amountWithoutTax !== undefined
          ? decimal(data.amountWithoutTax)
          : null,
      taxAmount: data.taxAmount !== undefined ? decimal(data.taxAmount) : null,
      description: data.description ?? null,
      notes: data.notes ?? null,
    },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", data.id, {
    legalEntityId: data.legalEntityId,
    year: data.year,
    month: data.month,
    type: data.type,
    amount: data.amount,
  });

  revalidatePath("/nominas");
}

export async function actionDeletePayroll(
  input: DeletePayrollInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, PAYROLL_PERM.delete);

  const { id } = deletePayrollSchema.parse(input);

  await prisma.payroll.findFirstOrThrow({
    where: { id, tenantId },
    select: { id: true },
  });

  await prisma.payroll.delete({ where: { id, tenantId } });

  await logAudit(tenantId, dbUser.id, "DELETE", id);

  revalidatePath("/nominas");
}
