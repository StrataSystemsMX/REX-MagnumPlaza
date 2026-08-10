"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/server/auth/get-session";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { logAudit } from "@/server/services/audit";
import {
  createBudgetSchema,
  createBudgetsBatchSchema,
  upsertBudgetLineSchema,
  type CreateBudgetInput,
  type CreateBudgetsBatchInput,
  type UpsertBudgetLineInput,
} from "@/shared/validators/budget";
import { MONTH_KEYS } from "@/server/services/budgets-types";

const INCOME_TYPES = new Set([
  "INCOME_RENT",
  "INCOME_BILLBOARD",
  "INCOME_GUARANTEE",
  "INCOME_OTHER",
]);

export async function actionCreateBudget(input: CreateBudgetInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "budget.create");

  const data = createBudgetSchema.parse(input);

  await prisma.legalEntity.findFirstOrThrow({
    where: { id: data.legalEntityId, tenantId, isActive: true },
    select: { id: true },
  });

  const budget = await prisma.budget.create({
    data: { tenantId, legalEntityId: data.legalEntityId, year: data.year },
  });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "CREATE",
    entityType: "Budget",
    entityId: budget.id,
    changes: { legalEntityId: data.legalEntityId, year: data.year },
  });

  revalidatePath("/presupuesto");
  return budget;
}

export async function actionCreateBudgetsBatch(input: CreateBudgetsBatchInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "budget.create");

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
  await requirePermission(dbUser.id, "budget.update");

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
    // BudgetLine no tiene tenantId propio: su aislamiento va vía Budget.
    // Verificar que la línea pertenezca a ESTE budget (y por tanto al tenant)
    // antes de mutar — evita IDOR con lineId ajeno.
    await prisma.budgetLine.findFirstOrThrow({
      where: { id: data.lineId, budget: { id: data.budgetId, tenantId } },
      select: { id: true },
    });
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

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: data.lineId ? "UPDATE" : "CREATE",
    entityType: "BudgetLine",
    entityId: data.lineId ?? data.budgetId,
    changes: {
      budgetId: data.budgetId,
      conceptType: data.conceptType,
      conceptLabel: data.conceptLabel,
      months: data.months,
    },
  });

  revalidatePath("/presupuesto");
  revalidatePath("/presupuesto/comparativo");
}

export async function actionDeleteBudgetLine(lineId: string, budgetId: string) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "budget.delete");

  const budget = await prisma.budget.findFirstOrThrow({
    where: { id: budgetId, tenantId },
    select: { id: true, isLocked: true },
  });
  if (budget.isLocked) {
    throw new Error("El presupuesto está cerrado y no puede modificarse.");
  }

  // Borrar solo si la línea pertenece a este budget/tenant (evita IDOR).
  const { count } = await prisma.budgetLine.deleteMany({
    where: { id: lineId, budget: { id: budgetId, tenantId } },
  });
  if (count === 0) {
    throw new Error("Línea de presupuesto no encontrada.");
  }

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "DELETE",
    entityType: "BudgetLine",
    entityId: lineId,
    changes: { budgetId },
  });

  revalidatePath("/presupuesto");
  revalidatePath("/presupuesto/comparativo");
}
