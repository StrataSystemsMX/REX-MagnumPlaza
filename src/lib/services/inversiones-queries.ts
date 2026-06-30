import { getActiveLegalEntityId } from "@/lib/auth/active-legal-entity";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

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

export async function getInvestmentProjects() {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();
  const projects = await prisma.investmentProject.findMany({
    where: {
      tenantId,
      status: { not: "CANCELLED" },
      ...(activeLegalEntityId ? { legalEntityId: activeLegalEntityId } : {}),
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
