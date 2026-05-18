import { requireAuth } from "@/lib/auth/get-session";
import { getActiveLegalEntityId } from "@/lib/auth/active-legal-entity";
import { prisma } from "@/lib/prisma/client";
export { MONTH_KEYS, type MonthKey, type BudgetLineRow, type BudgetData } from "./budgets-types";
import { MONTH_KEYS, type MonthKey, type BudgetData } from "./budgets-types";

export async function getBudgetForYear(year: number): Promise<BudgetData | null> {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const budget = await prisma.budget.findFirst({
    where: {
      tenantId,
      year,
      ...(activeLegalEntityId ? { legalEntityId: activeLegalEntityId } : {}),
    },
    include: {
      lines: { orderBy: [{ conceptType: "asc" }, { conceptLabel: "asc" }] },
    },
  });

  if (!budget) return null;

  return {
    budgetId: budget.id,
    legalEntityId: budget.legalEntityId,
    year: budget.year,
    isLocked: budget.isLocked,
    lines: budget.lines.map((l) => {
      const months = Object.fromEntries(
        MONTH_KEYS.map((k) => [k, Number(l[k])]),
      ) as Record<MonthKey, number>;
      const annual = MONTH_KEYS.reduce((acc, k) => acc + months[k], 0);
      return {
        id: l.id,
        conceptType: l.conceptType,
        conceptLabel: l.conceptLabel,
        months,
        annual,
      };
    }),
  };
}

export async function getBudgetYears(): Promise<number[]> {
  const { tenantId } = await requireAuth();
  const rows = await prisma.budget.findMany({
    where: { tenantId },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });
  return rows.map((r) => r.year);
}

export async function getLegalEntitiesForBudget() {
  const { tenantId } = await requireAuth();
  return prisma.legalEntity.findMany({
    where: { tenantId, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, legalName: true },
  });
}
