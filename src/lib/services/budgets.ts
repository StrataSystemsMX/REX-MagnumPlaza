"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createBudgetSchema,
  createBudgetsBatchSchema,
  upsertBudgetLineSchema,
  type CreateBudgetInput,
  type CreateBudgetsBatchInput,
  type UpsertBudgetLineInput,
} from "@/lib/validators/budget";
import { MONTH_KEYS } from "@/lib/services/budgets-types";

const INCOME_TYPES = new Set([
  "INCOME_RENT",
  "INCOME_BILLBOARD",
  "INCOME_GUARANTEE",
  "INCOME_OTHER",
]);

export async function actionCreateBudget(input: CreateBudgetInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  const data = createBudgetSchema.parse(input);

  await prisma.legalEntity.findFirstOrThrow({
    where: { id: data.legalEntityId, tenantId, isActive: true },
    select: { id: true },
  });

  const budget = await prisma.budget.create({
    data: { tenantId, legalEntityId: data.legalEntityId, year: data.year },
  });

  revalidatePath("/presupuesto");
  return budget;
}

export async function actionCreateBudgetsBatch(input: CreateBudgetsBatchInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  const data = createBudgetsBatchSchema.parse(input);

  const entities = await prisma.legalEntity.findMany({
    where: { tenantId, id: { in: data.legalEntityIds }, isActive: true },
    select: { id: true },
  });
  if (entities.length !== data.legalEntityIds.length) {
    throw new Error("Una o más razones sociales no son válidas.");
  }

  const existing = await prisma.budget.findMany({
    where: { tenantId, year: data.year, legalEntityId: { in: data.legalEntityIds } },
    select: { legalEntityId: true },
  });
  const existingIds = new Set(existing.map((b) => b.legalEntityId));
  const toCreate = data.legalEntityIds.filter((id) => !existingIds.has(id));

  if (toCreate.length > 0) {
    await prisma.budget.createMany({
      data: toCreate.map((legalEntityId) => ({ tenantId, legalEntityId, year: data.year })),
    });
  }

  revalidatePath("/presupuesto");
  return { created: toCreate.length, skipped: existingIds.size };
}

export async function actionUpsertBudgetLine(input: UpsertBudgetLineInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  const data = upsertBudgetLineSchema.parse(input);

  const budget = await prisma.budget.findFirstOrThrow({
    where: { id: data.budgetId, tenantId },
    select: { id: true, isLocked: true },
  });
  if (budget.isLocked) {
    throw new Error("El presupuesto está cerrado y no puede modificarse.");
  }

  // propertyId solo aplica a líneas INCOME_*. Para egresos/estrategia/deuda se ignora.
  const propertyId = INCOME_TYPES.has(data.conceptType) ? data.propertyId ?? null : null;
  if (propertyId) {
    await prisma.property.findFirstOrThrow({
      where: { id: propertyId, tenantId },
      select: { id: true },
    });
  }

  const monthData = Object.fromEntries(
    MONTH_KEYS.map((k) => [k, new Prisma.Decimal(data.months[k])]),
  );

  if (data.lineId) {
    await prisma.budgetLine.update({
      where: { id: data.lineId },
      data: {
        conceptType: data.conceptType,
        conceptLabel: data.conceptLabel,
        propertyId,
        ...monthData,
      },
    });
  } else {
    await prisma.budgetLine.create({
      data: {
        budgetId: data.budgetId,
        conceptType: data.conceptType,
        conceptLabel: data.conceptLabel,
        propertyId,
        ...monthData,
      },
    });
  }

  revalidatePath("/presupuesto");
  revalidatePath("/presupuesto/comparativo");
}

export async function actionDeleteBudgetLine(lineId: string, budgetId: string) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.delete");

  await prisma.budget.findFirstOrThrow({
    where: { id: budgetId, tenantId },
    select: { id: true },
  });

  await prisma.budgetLine.delete({ where: { id: lineId } });

  revalidatePath("/presupuesto");
  revalidatePath("/presupuesto/comparativo");
}
