"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createBudgetSchema,
  upsertBudgetLineSchema,
  type CreateBudgetInput,
  type UpsertBudgetLineInput,
} from "@/lib/validators/budget";
import { MONTH_KEYS } from "@/lib/services/budgets-types";

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

export async function actionUpsertBudgetLine(input: UpsertBudgetLineInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  const data = upsertBudgetLineSchema.parse(input);

  await prisma.budget.findFirstOrThrow({
    where: { id: data.budgetId, tenantId },
    select: { id: true, isLocked: true },
  }).then((b) => {
    if (b.isLocked) throw new Error("El presupuesto está cerrado y no puede modificarse.");
  });

  const monthData = Object.fromEntries(
    MONTH_KEYS.map((k) => [k, new Prisma.Decimal(data.months[k])]),
  );

  if (data.lineId) {
    await prisma.budgetLine.update({
      where: { id: data.lineId },
      data: {
        conceptType: data.conceptType,
        conceptLabel: data.conceptLabel,
        ...monthData,
      },
    });
  } else {
    await prisma.budgetLine.create({
      data: {
        budgetId: data.budgetId,
        conceptType: data.conceptType,
        conceptLabel: data.conceptLabel,
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
