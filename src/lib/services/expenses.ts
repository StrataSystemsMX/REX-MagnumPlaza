"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createExpenseSchema,
  deleteExpenseSchema,
  markExpenseNotRequiredSchema,
  registerExpenseSchema,
  unmarkExpensePaidSchema,
  updateExpenseSchema,
  type CreateExpenseInput,
  type DeleteExpenseInput,
  type MarkExpenseNotRequiredInput,
  type RegisterExpenseInput,
  type UnmarkExpensePaidInput,
  type UpdateExpenseInput,
} from "@/lib/validators/expense";

const EXPENSE_PERM = {
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
      entityType: "Expense",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
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

async function ensureCategoryInTenant(
  tenantId: string,
  categoryId: string,
): Promise<void> {
  await prisma.expenseCategory.findFirstOrThrow({
    where: { id: categoryId, tenantId },
    select: { id: true },
  });
}

async function ensurePropertyInTenant(
  tenantId: string,
  propertyId: string,
): Promise<void> {
  await prisma.property.findFirstOrThrow({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
}

export async function actionCreateExpense(
  input: CreateExpenseInput,
): Promise<{ id: string }> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, EXPENSE_PERM.create);

  const data = createExpenseSchema.parse(input);

  await ensureLegalEntityInTenant(tenantId, data.legalEntityId);
  await ensureCategoryInTenant(tenantId, data.categoryId);
  if (data.propertyId) await ensurePropertyInTenant(tenantId, data.propertyId);

  const created = await prisma.expense.create({
    data: {
      tenantId,
      legalEntityId: data.legalEntityId,
      categoryId: data.categoryId,
      propertyId: data.propertyId ?? null,
      amount: decimal(data.amount),
      expenseDate: data.expenseDate,
      description: data.description,
      vendor: data.vendor ?? null,
      invoiceNumber: data.invoiceNumber ?? null,
      paymentMethod: data.paymentMethod ?? null,
      isPaid: data.isPaid ?? true,
      notes: data.notes ?? null,
    },
    select: { id: true },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", created.id, {
    legalEntityId: data.legalEntityId,
    categoryId: data.categoryId,
    amount: data.amount,
    expenseDate: data.expenseDate.toISOString(),
  });

  revalidatePath("/egresos");
  return created;
}

export async function actionUpdateExpense(
  input: UpdateExpenseInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, EXPENSE_PERM.update);

  const data = updateExpenseSchema.parse(input);

  await ensureLegalEntityInTenant(tenantId, data.legalEntityId);
  await ensureCategoryInTenant(tenantId, data.categoryId);
  if (data.propertyId) await ensurePropertyInTenant(tenantId, data.propertyId);

  const result = await prisma.expense.updateMany({
    where: { id: data.id, tenantId },
    data: {
      legalEntityId: data.legalEntityId,
      categoryId: data.categoryId,
      propertyId: data.propertyId ?? null,
      amount: decimal(data.amount),
      expenseDate: data.expenseDate,
      description: data.description,
      vendor: data.vendor ?? null,
      invoiceNumber: data.invoiceNumber ?? null,
      paymentMethod: data.paymentMethod ?? null,
      isPaid: data.isPaid ?? true,
      notes: data.notes ?? null,
    },
  });
  if (result.count === 0) {
    throw new Error("Egreso no encontrado o fuera de tu tenant.");
  }

  await logAudit(tenantId, dbUser.id, "UPDATE", data.id, {
    legalEntityId: data.legalEntityId,
    categoryId: data.categoryId,
    amount: data.amount,
    expenseDate: data.expenseDate.toISOString(),
  });

  revalidatePath("/egresos");
}

export async function actionRegisterExpense(
  input: RegisterExpenseInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, EXPENSE_PERM.update);

  const data = registerExpenseSchema.parse(input);

  // Cargar nota previa para concatenar la nueva (no sobrescribir).
  const existing = await prisma.expense.findFirstOrThrow({
    where: { id: data.id, tenantId },
    select: { id: true, notes: true },
  });

  const mergedNotes =
    data.notes && data.notes.trim().length > 0
      ? existing.notes
        ? `${existing.notes}\n${data.notes.trim()}`
        : data.notes.trim()
      : existing.notes;

  const result = await prisma.expense.updateMany({
    where: { id: data.id, tenantId },
    data: {
      amount: decimal(data.amount),
      isPaid: true,
      // Si estaba marcado "Sin egreso" y ahora se registra pago, lo limpiamos.
      isNotRequired: false,
      ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
      notes: mergedNotes,
    },
  });
  if (result.count === 0) {
    throw new Error("Egreso no encontrado o fuera de tu tenant.");
  }

  await logAudit(tenantId, dbUser.id, "UPDATE", data.id, {
    action: "REGISTER",
    amount: data.amount,
    paymentMethod: data.paymentMethod ?? null,
  });

  revalidatePath("/egresos");
}

export async function actionUnmarkExpensePaid(
  input: UnmarkExpensePaidInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, EXPENSE_PERM.update);

  const { id } = unmarkExpensePaidSchema.parse(input);

  const result = await prisma.expense.updateMany({
    where: { id, tenantId },
    data: { isPaid: false },
  });
  if (result.count === 0) {
    throw new Error("Egreso no encontrado o fuera de tu tenant.");
  }

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    action: "UNMARK_PAID",
  });

  revalidatePath("/egresos");
}

/**
 * Marca el egreso como "Sin egreso" — el usuario decide que en este mes
 * no aplica pagar este concepto. Mutuamente exclusivo con isPaid.
 * Si el egreso ya está marcado, esto lo desmarca (toggle).
 */
export async function actionToggleExpenseNotRequired(
  input: MarkExpenseNotRequiredInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, EXPENSE_PERM.update);

  const { id } = markExpenseNotRequiredSchema.parse(input);

  const existing = await prisma.expense.findFirstOrThrow({
    where: { id, tenantId },
    select: { id: true, isNotRequired: true },
  });

  const next = !existing.isNotRequired;

  const result = await prisma.expense.updateMany({
    where: { id, tenantId },
    data: {
      isNotRequired: next,
      // Si lo marcamos como "sin egreso", limpiamos isPaid.
      ...(next ? { isPaid: false } : {}),
    },
  });
  if (result.count === 0) {
    throw new Error("Egreso no encontrado o fuera de tu tenant.");
  }

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    action: next ? "MARK_NOT_REQUIRED" : "UNMARK_NOT_REQUIRED",
  });

  revalidatePath("/egresos");
}

export async function actionDeleteExpense(
  input: DeleteExpenseInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, EXPENSE_PERM.delete);

  const { id } = deleteExpenseSchema.parse(input);

  const result = await prisma.expense.deleteMany({
    where: { id, tenantId },
  });
  if (result.count === 0) {
    throw new Error("Egreso no encontrado o fuera de tu tenant.");
  }

  await logAudit(tenantId, dbUser.id, "DELETE", id);

  revalidatePath("/egresos");
}
