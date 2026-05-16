import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

// ============================================================================
// KPIs
// ============================================================================

export interface InversionesKpis {
  activeLoans: number;
  totalMonthlyLoanPayment: number;
  paidThisYear: number;
  pendingThisYear: number;
  activeProjects: number;
  totalProjectBudget: number;
  totalProjectExecuted: number;
}

export async function getInversionesKpis(year?: number): Promise<InversionesKpis> {
  const { tenantId } = await requireAuth();
  const currentYear = year ?? new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(currentYear, 0, 1));
  const yearEnd = new Date(Date.UTC(currentYear + 1, 0, 1));

  const [loans, projects, payments] = await Promise.all([
    prisma.loan.findMany({
      where: { tenantId, status: "ACTIVE", type: { not: "VEHICLE" } },
      select: { monthlyPayment: true },
    }),
    prisma.investmentProject.findMany({
      where: { tenantId, status: { in: ["PLANNING", "ACTIVE", "PAUSED"] } },
      select: { budgetAmount: true, executedAmount: true },
    }),
    prisma.loanPayment.findMany({
      where: {
        tenantId,
        period: { gte: yearStart, lt: yearEnd },
        loan: { type: { not: "VEHICLE" } },
      },
      select: { amount: true, isPaid: true },
    }),
  ]);

  return {
    activeLoans: loans.length,
    totalMonthlyLoanPayment: loans.reduce((s, l) => s + l.monthlyPayment.toNumber(), 0),
    paidThisYear: payments.filter((p) => p.isPaid).reduce((s, p) => s + p.amount.toNumber(), 0),
    pendingThisYear: payments.filter((p) => !p.isPaid).reduce((s, p) => s + p.amount.toNumber(), 0),
    activeProjects: projects.length,
    totalProjectBudget: projects.reduce((s, p) => s + p.budgetAmount.toNumber(), 0),
    totalProjectExecuted: projects.reduce((s, p) => s + p.executedAmount.toNumber(), 0),
  };
}

// ============================================================================
// MATRIZ ANUAL DE PRÉSTAMOS
// ============================================================================

export type LoanPaymentStatus = "PAID" | "PENDING" | "SCHEDULED" | "EMPTY";

export interface LoanYearlyCell {
  loanPaymentId: string | null;
  amount: number;
  isPaid: boolean;
  status: LoanPaymentStatus;
  period: Date;
}

export interface LoanYearlyRow {
  loanId: string;
  name: string;
  lender: string | null;
  type: string;
  entityCode: string;
  entityId: string;
  monthlyPayment: number;
  cells: LoanYearlyCell[]; // 12 meses
  paidTotal: number;
  yearTotal: number;
}

export interface LoansYearlyMatrix {
  year: number;
  rows: LoanYearlyRow[];
  monthlyTotals: Array<{
    period: Date;
    expected: number;
    paid: number;
    pending: number;
  }>;
}

export async function getLoansYearlyMatrix(
  year: number,
): Promise<LoansYearlyMatrix> {
  const { tenantId } = await requireAuth();

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const periods = Array.from(
    { length: 12 },
    (_, i) => new Date(Date.UTC(year, i, 1)),
  );

  const [loans, payments] = await Promise.all([
    prisma.loan.findMany({
      where: {
        tenantId,
        status: { not: "CANCELLED" },
        type: { not: "VEHICLE" },
        startDate: { lt: yearEnd },
        OR: [{ endDate: null }, { endDate: { gte: yearStart } }],
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { legalEntity: { select: { id: true, code: true } } },
    }),
    prisma.loanPayment.findMany({
      where: { tenantId, period: { gte: yearStart, lt: yearEnd } },
    }),
  ]);

  const paymentMap = new Map<string, (typeof payments)[number]>();
  for (const p of payments) {
    paymentMap.set(`${p.loanId}::${p.period.getUTCMonth()}`, p);
  }

  const now = new Date();
  const currentMonthUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const rows: LoanYearlyRow[] = loans.map((loan) => {
    const monthlyPayment = loan.monthlyPayment.toNumber();
    let paidTotal = 0;
    let yearTotal = 0;

    const cells: LoanYearlyCell[] = periods.map((period, m) => {
      const loanStart = new Date(loan.startDate);
      const loanEnd = loan.endDate ? new Date(loan.endDate) : null;
      const activeThisMonth =
        loanStart < new Date(Date.UTC(year, m + 1, 1)) &&
        (loanEnd === null || loanEnd > period);

      if (!activeThisMonth) {
        return {
          loanPaymentId: null,
          amount: 0,
          isPaid: false,
          status: "EMPTY",
          period,
        };
      }

      const key = `${loan.id}::${m}`;
      const pay = paymentMap.get(key);
      const amount = pay ? pay.amount.toNumber() : monthlyPayment;
      yearTotal += amount;

      if (pay?.isPaid) {
        paidTotal += amount;
        return {
          loanPaymentId: pay.id,
          amount,
          isPaid: true,
          status: "PAID",
          period,
        };
      }

      const status: LoanPaymentStatus =
        period <= currentMonthUTC ? "PENDING" : "SCHEDULED";
      return {
        loanPaymentId: pay?.id ?? null,
        amount,
        isPaid: false,
        status,
        period,
      };
    });

    return {
      loanId: loan.id,
      name: loan.name,
      lender: loan.lender,
      type: loan.type,
      entityCode: loan.legalEntity.code,
      entityId: loan.legalEntity.id,
      monthlyPayment,
      cells,
      paidTotal,
      yearTotal,
    };
  });

  const monthlyTotals = periods.map((period, i) => {
    let expected = 0;
    let paid = 0;
    let pending = 0;
    for (const row of rows) {
      const cell = row.cells[i]!;
      if (cell.status === "EMPTY") continue;
      expected += cell.amount;
      if (cell.status === "PAID") paid += cell.amount;
      else if (cell.status === "PENDING") pending += cell.amount;
    }
    return { period, expected, paid, pending };
  });

  return { year, rows, monthlyTotals };
}

// ============================================================================
// PROYECTOS DE INVERSIÓN
// ============================================================================

export async function getInvestmentProjects() {
  const { tenantId } = await requireAuth();
  const projects = await prisma.investmentProject.findMany({
    where: { tenantId, status: { not: "CANCELLED" } },
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

/** Años con al menos un préstamo registrado, descendente. */
export async function getLoanYears(): Promise<number[]> {
  const { tenantId } = await requireAuth();
  const rows = await prisma.loanPayment.findMany({
    where: { tenantId },
    select: { period: true },
  });
  const years = new Set<number>();
  for (const r of rows) years.add(r.period.getUTCFullYear());
  if (years.size === 0) years.add(new Date().getUTCFullYear());
  return Array.from(years).sort((a, b) => b - a);
}
