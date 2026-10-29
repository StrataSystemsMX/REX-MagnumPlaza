import { getActiveLegalEntityId } from "@/server/auth/active-legal-entity";
import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";

// ============================================================================
// KPIs
// ============================================================================

export interface InversionesKpis {
  activeProjects: number;
  totalProjects: number;
  totalProjectBudget: number;
  totalProjectExecuted: number;
}

export async function getInversionesKpis(): Promise<InversionesKpis> {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const projects = await prisma.investmentProject.findMany({
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      ...(activeLegalEntityId ? { legalEntityId: activeLegalEntityId } : {}),
    },
    select: { budgetAmount: true, executedAmount: true, status: true },
  });

  const activeProjects = projects.filter((p) =>
    p.status === "PLANNING" || p.status === "ACTIVE" || p.status === "PAUSED",
  ).length;

  return {
    activeProjects,
    totalProjects: projects.length,
    totalProjectBudget: projects.reduce((s, p) => s + p.budgetAmount.toNumber(), 0),
    totalProjectExecuted: projects.reduce((s, p) => s + p.executedAmount.toNumber(), 0),
  };
}

// ============================================================================
// PROYECTOS DE INVERSIÓN
// ============================================================================

export interface InvestmentProjectFilters {
  /** Muestra los proyectos que siguen abiertos (PLANNING/ACTIVE/PAUSED) sin
   *  importar cuándo arrancaron, más los que arrancaron o cerraron en el año. */
  year?: number;
}

export async function getInvestmentProjects(filters: InvestmentProjectFilters = {}) {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();
  const yearStart = filters.year ? new Date(Date.UTC(filters.year, 0, 1)) : null;
  const yearEnd = filters.year ? new Date(Date.UTC(filters.year + 1, 0, 1)) : null;

  const projects = await prisma.investmentProject.findMany({
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      ...(activeLegalEntityId ? { legalEntityId: activeLegalEntityId } : {}),
      ...(yearStart && yearEnd
        ? {
            OR: [
              { status: { in: ["PLANNING", "ACTIVE", "PAUSED"] } },
              { startDate: { gte: yearStart, lt: yearEnd } },
              { endDate: { gte: yearStart, lt: yearEnd } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: {
      legalEntity: { select: { id: true, code: true, legalName: true } },
      property: { select: { id: true, name: true } },
      payments: { orderBy: { paymentDate: "asc" } },
    },
  });
  return projects.map((p) => ({
    ...p,
    budgetAmount: p.budgetAmount.toNumber(),
    executedAmount: p.executedAmount.toNumber(),
    payments: p.payments.map((pay) => ({
      ...pay,
      amount: pay.amount.toNumber(),
    })),
  }));
}

export type InvestmentProjectListItem = Awaited<
  ReturnType<typeof getInvestmentProjects>
>[number];
