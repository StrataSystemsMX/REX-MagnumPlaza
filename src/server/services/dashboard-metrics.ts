import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/prisma/client";
import type { ContractStatus } from "@/generated/prisma/enums";
import {
  OUTSTANDING_STATUSES,
  ZERO,
  computeSummary,
  dec,
  describeAuditLog,
  detectAlerts,
  lastNMonths,
  monthKey,
  parseMonth,
  type DashboardMetrics,
  type DashboardOptions,
  type LegalEntityMetricRow,
  type MonthlyIncomePoint,
  type OccupancyTrendPoint,
  type PropertyMetricRow,
  type RecentActivityRow,
  type TopOverdueRow,
} from "@/server/services/dashboard-metrics-helpers";

// Re-exportamos para que callers existentes puedan seguir importando desde
// dashboard-metrics. Los helpers puros viven en dashboard-metrics-helpers.
export {
  computeSummary,
  describeAuditLog,
  detectAlerts,
  lastNMonths,
  parseMonth,
};
export type {
  DashboardAlert,
  DashboardMetrics,
  DashboardOptions,
  DashboardSummary,
  LegalEntityMetricRow,
  MonthlyIncomePoint,
  OccupancyTrendPoint,
  PropertyMetricRow,
  RecentActivityRow,
  SummaryInputs,
  TopOverdueRow,
} from "@/server/services/dashboard-metrics-helpers";

// ============================================================================
// Service principal — getDashboardMetrics
// ============================================================================

const fetchDashboardMetricsImpl = async (
  tenantId: string,
  options: DashboardOptions = {},
): Promise<DashboardMetrics> => {
  const { month, periodStart, periodEnd } = parseMonth(options.month);
  const now = new Date();
  const expiringEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const expenseLegalEntityFilter: Prisma.ExpenseWhereInput = options.legalEntityId
    ? { legalEntityId: options.legalEntityId }
    : {};
  const rentLegalEntityFilter: Prisma.RentWhereInput = options.legalEntityId
    ? { legalEntityId: options.legalEntityId }
    : {};

  const trendMonths = lastNMonths(periodStart, 6);
  const trendStart = trendMonths[0]?.start ?? periodStart;
  const prevMonth = lastNMonths(periodStart, 2)[0];
  const prevMonthStart = prevMonth?.start ?? periodStart;
  const prevMonthEnd = prevMonth?.end ?? periodEnd;

  const [
    totalProperties,
    units,
    activeContracts,
    expiringContracts,
    expiringInsurance,
    paymentsThisMonth,
    outstandingRents,
    legalEntities,
    expensesThisMonth,
    recentLogs,
    properties,
    sixMonthRents,
    sixMonthPayments,
    morositySnapshots,
  ] = await Promise.all([
    prisma.property.count({ where: { tenantId, isActive: true } }),
    prisma.unit.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, status: true, propertyId: true },
    }),
    prisma.contract.findMany({
      where: { tenantId, status: "ACTIVE" satisfies ContractStatus },
      select: {
        id: true,
        monthlyAmount: true,
        endDate: true,
        unit: { select: { propertyId: true } },
      },
    }),
    prisma.contract.count({
      where: {
        tenantId,
        status: "ACTIVE" satisfies ContractStatus,
        endDate: { gte: now, lte: expiringEnd },
      },
    }),
    // Pólizas de seguro vencidas o por vencer dentro de la misma ventana de 60d.
    // (lte excluye nulls, así que solo cuenta inmuebles con fecha de seguro.)
    prisma.property.count({
      where: {
        tenantId,
        isActive: true,
        insuranceExpiresAt: { lte: expiringEnd },
      },
    }),
    prisma.payment.findMany({
      where: {
        tenantId,
        paymentDate: { gte: periodStart, lt: periodEnd },
        ...(options.legalEntityId
          ? { rent: { legalEntityId: options.legalEntityId } }
          : {}),
      },
      select: {
        amount: true,
        rent: {
          select: {
            legalEntityId: true,
            contract: { select: { unit: { select: { propertyId: true } } } },
          },
        },
      },
    }),
    prisma.rent.findMany({
      where: {
        tenantId,
        status: { in: OUTSTANDING_STATUSES },
        ...rentLegalEntityFilter,
      },
      select: {
        id: true,
        amountDue: true,
        amountPaid: true,
        amountWaived: true,
        lateFeeAccrued: true,
        status: true,
        dueDate: true,
        contract: {
          select: {
            lessee: {
              select: {
                id: true,
                legalName: true,
                contactName: true,
                whatsapp: true,
                phone: true,
              },
            },
          },
        },
      },
    }),
    prisma.legalEntity.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(options.legalEntityId ? { id: options.legalEntityId } : {}),
      },
      select: { id: true, code: true, legalName: true },
      orderBy: { code: "asc" },
    }),
    prisma.expense.findMany({
      where: {
        tenantId,
        expenseDate: { gte: periodStart, lt: periodEnd },
        ...expenseLegalEntityFilter,
      },
      select: { amount: true, legalEntityId: true },
    }),
    prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityType: true,
        entityId: true,
        changes: true,
        user: { select: { name: true } },
      },
    }),
    prisma.property.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.rent.findMany({
      where: {
        tenantId,
        period: { gte: trendStart, lt: periodEnd },
        ...rentLegalEntityFilter,
      },
      select: { period: true, amountDue: true },
    }),
    prisma.payment.findMany({
      where: {
        tenantId,
        paymentDate: { gte: trendStart, lt: periodEnd },
        ...(options.legalEntityId
          ? { rent: { legalEntityId: options.legalEntityId } }
          : {}),
      },
      select: { paymentDate: true, amount: true },
    }),
    prisma.morosityDailySnapshot.findMany({
      where: {
        tenantId,
        date: { gte: trendStart, lt: periodEnd },
      },
      select: { date: true, byStatus: true },
      orderBy: { date: "asc" },
    }),
  ]);

  // ----- summary -----
  const occupiedUnits = units.filter((u) => u.status === "RENTADA").length;
  const summary = computeSummary({
    totalProperties,
    totalUnits: units.length,
    occupiedUnits,
    activeContracts,
    expiringContracts,
    expiringInsurance,
    paymentsThisMonth: paymentsThisMonth.map((p) => ({ amount: p.amount })),
    outstandingRents,
  });

  // ----- alerts: comparar con mes anterior -----
  const [prevOutstanding, prevContracts] = await Promise.all([
    prisma.rent.findMany({
      where: {
        tenantId,
        period: { gte: prevMonthStart, lt: prevMonthEnd },
        status: { in: OUTSTANDING_STATUSES },
        ...rentLegalEntityFilter,
      },
      select: { amountDue: true, amountPaid: true, amountWaived: true, lateFeeAccrued: true, status: true },
    }),
    prisma.contract.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        startDate: { lt: prevMonthEnd },
      },
      select: { monthlyAmount: true },
    }),
  ]);
  const prevSummary = computeSummary({
    totalProperties,
    totalUnits: units.length,
    occupiedUnits,
    activeContracts: prevContracts,
    expiringContracts: 0,
    expiringInsurance: 0,
    paymentsThisMonth: [],
    outstandingRents: prevOutstanding,
  });
  const alerts = detectAlerts(summary, prevSummary);

  // ----- byProperty -----
  const byPropertyMap = new Map<string, PropertyMetricRow>();
  for (const p of properties) {
    byPropertyMap.set(p.id, {
      propertyId: p.id,
      propertyName: p.name,
      totalUnits: 0,
      occupiedUnits: 0,
      occupancyRate: 0,
      expectedIncome: "0",
      collectedIncome: "0",
    });
  }
  for (const u of units) {
    const row = byPropertyMap.get(u.propertyId);
    if (!row) continue;
    row.totalUnits += 1;
    if (u.status === "RENTADA") row.occupiedUnits += 1;
  }
  const expectedByProperty = new Map<string, Prisma.Decimal>();
  for (const c of activeContracts) {
    const id = c.unit.propertyId;
    expectedByProperty.set(id, (expectedByProperty.get(id) ?? ZERO).plus(dec(c.monthlyAmount)));
  }
  const collectedByProperty = new Map<string, Prisma.Decimal>();
  for (const p of paymentsThisMonth) {
    const id = p.rent?.contract?.unit?.propertyId;
    if (!id) continue;
    collectedByProperty.set(id, (collectedByProperty.get(id) ?? ZERO).plus(dec(p.amount)));
  }
  for (const [id, row] of byPropertyMap) {
    row.occupancyRate = row.totalUnits === 0 ? 0 : row.occupiedUnits / row.totalUnits;
    row.expectedIncome = (expectedByProperty.get(id) ?? ZERO).toString();
    row.collectedIncome = (collectedByProperty.get(id) ?? ZERO).toString();
  }
  const byProperty = Array.from(byPropertyMap.values()).sort((a, b) =>
    a.propertyName.localeCompare(b.propertyName, "es"),
  );

  // ----- byLegalEntity -----
  const incomeByLegalEntity = new Map<string, Prisma.Decimal>();
  for (const p of paymentsThisMonth) {
    const id = p.rent.legalEntityId;
    incomeByLegalEntity.set(id, (incomeByLegalEntity.get(id) ?? ZERO).plus(dec(p.amount)));
  }
  const expensesByLegalEntity = new Map<string, Prisma.Decimal>();
  for (const e of expensesThisMonth) {
    expensesByLegalEntity.set(
      e.legalEntityId,
      (expensesByLegalEntity.get(e.legalEntityId) ?? ZERO).plus(dec(e.amount)),
    );
  }
  const byLegalEntity: LegalEntityMetricRow[] = legalEntities.map((le) => {
    const income = incomeByLegalEntity.get(le.id) ?? ZERO;
    const expenses = expensesByLegalEntity.get(le.id) ?? ZERO;
    return {
      legalEntityId: le.id,
      code: le.code,
      legalName: le.legalName,
      income: income.toString(),
      expenses: expenses.toString(),
      profit: income.minus(expenses).toString(),
    };
  });

  // ----- topOverdue -----
  const LEVEL_ORDER: Record<string, number> = {
    DUE: 0,
    PARTIAL: 0,
    OVERDUE_1M: 1,
    OVERDUE_2M: 2,
    OVERDUE_3M: 3,
  };
  const overdueByLessee = new Map<
    string,
    {
      lessee: NonNullable<typeof outstandingRents[number]["contract"]>["lessee"];
      total: Prisma.Decimal;
      oldestDays: number;
      count: number;
      worstStatus: string;
    }
  >();
  for (const r of outstandingRents) {
    const l = r.contract.lessee;
    const balance = dec(r.amountDue)
      .plus(dec(r.lateFeeAccrued ?? 0))
      .minus(dec(r.amountPaid))
      .minus(dec(r.amountWaived));
    const days = Math.floor((now.getTime() - r.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const cur = overdueByLessee.get(l.id);
    if (cur) {
      cur.total = cur.total.plus(balance);
      cur.oldestDays = Math.max(cur.oldestDays, days);
      cur.count += 1;
      if ((LEVEL_ORDER[r.status] ?? 0) > (LEVEL_ORDER[cur.worstStatus] ?? 0)) {
        cur.worstStatus = r.status;
      }
    } else {
      overdueByLessee.set(l.id, {
        lessee: l,
        total: balance,
        oldestDays: days,
        count: 1,
        worstStatus: r.status,
      });
    }
  }
  const topOverdue: TopOverdueRow[] = Array.from(overdueByLessee.values())
    .sort((a, b) => Number(b.total.minus(a.total)))
    .slice(0, 10)
    .map((row) => ({
      lesseeId: row.lessee.id,
      legalName: row.lessee.legalName,
      contactName: row.lessee.contactName,
      whatsapp: row.lessee.whatsapp,
      phone: row.lessee.phone,
      outstanding: row.total.toString(),
      oldestDaysOverdue: row.oldestDays,
      rentsOverdue: row.count,
      worstLevel: (row.worstStatus === "OVERDUE_3M"
        ? "OVERDUE_3M"
        : row.worstStatus === "OVERDUE_2M"
          ? "OVERDUE_2M"
          : row.worstStatus === "OVERDUE_1M"
            ? "OVERDUE_1M"
            : "DUE") as import("@/server/services/dashboard-metrics-helpers").OverdueLevel,
    }));

  // ----- trends -----
  const months = trendMonths;
  const expectedByMonth = new Map<string, Prisma.Decimal>();
  for (const r of sixMonthRents) {
    const key = monthKey(r.period);
    expectedByMonth.set(key, (expectedByMonth.get(key) ?? ZERO).plus(dec(r.amountDue)));
  }
  const collectedByMonth = new Map<string, Prisma.Decimal>();
  for (const p of sixMonthPayments) {
    const key = monthKey(p.paymentDate);
    collectedByMonth.set(key, (collectedByMonth.get(key) ?? ZERO).plus(dec(p.amount)));
  }
  const monthlyIncome: MonthlyIncomePoint[] = months.map((m) => ({
    month: m.month,
    expected: (expectedByMonth.get(m.month) ?? ZERO).toString(),
    collected: (collectedByMonth.get(m.month) ?? ZERO).toString(),
  }));

  const occupancyTrend: OccupancyTrendPoint[] = months.map((m) => {
    // Tomamos el último snapshot del mes y calculamos ocupación aproximada.
    const last = morositySnapshots
      .filter((s) => s.date >= m.start && s.date < m.end)
      .pop();
    if (!last) return { month: m.month, occupancyRate: 0 };
    const by = (last.byStatus as Record<string, number>) ?? {};
    const totalRents = Object.values(by).reduce((a, b) => a + (Number(b) || 0), 0);
    if (totalRents === 0) return { month: m.month, occupancyRate: 0 };
    const paidish = (Number(by["PAID"]) || 0) + (Number(by["PENDING"]) || 0);
    return { month: m.month, occupancyRate: paidish / totalRents };
  });

  // Si no hay snapshots históricos, usamos la ocupación actual como "punto único".
  const hasSnapshots = occupancyTrend.some((p) => p.occupancyRate > 0);
  if (!hasSnapshots) {
    const last = occupancyTrend[occupancyTrend.length - 1];
    if (last) last.occupancyRate = summary.occupancyRate;
  }

  // ----- recentActivity -----
  const idsByType = new Map<string, Set<string>>();
  for (const log of recentLogs) {
    if (!idsByType.has(log.entityType)) idsByType.set(log.entityType, new Set());
    idsByType.get(log.entityType)!.add(log.entityId);
  }
  const namesIndex = new Map<string, string>();
  await Promise.all(
    Array.from(idsByType.entries()).map(async ([type, ids]) => {
      const idArr = Array.from(ids);
      if (idArr.length === 0) return;
      switch (type) {
        case "Payment": {
          // Para Payment buscamos el lessee asociado vía rent.contract.lessee.
          const payments = await prisma.payment.findMany({
            where: { tenantId, id: { in: idArr } },
            select: {
              id: true,
              rent: {
                select: { contract: { select: { lessee: { select: { legalName: true } } } } },
              },
            },
          });
          for (const p of payments) {
            const name = p.rent?.contract?.lessee?.legalName;
            if (name) namesIndex.set(`Payment:${p.id}`, `a ${name}`);
          }
          return;
        }
        case "Contract": {
          const contracts = await prisma.contract.findMany({
            where: { tenantId, id: { in: idArr } },
            select: { id: true, lessee: { select: { legalName: true } } },
          });
          for (const c of contracts) {
            namesIndex.set(`Contract:${c.id}`, `de ${c.lessee.legalName}`);
          }
          return;
        }
        case "Property": {
          const props = await prisma.property.findMany({
            where: { tenantId, id: { in: idArr } },
            select: { id: true, name: true },
          });
          for (const p of props) namesIndex.set(`Property:${p.id}`, p.name);
          return;
        }
        case "Lessee": {
          const lessees = await prisma.lessee.findMany({
            where: { tenantId, id: { in: idArr } },
            select: { id: true, legalName: true },
          });
          for (const l of lessees) namesIndex.set(`Lessee:${l.id}`, l.legalName);
          return;
        }
        case "Expense": {
          const exps = await prisma.expense.findMany({
            where: { tenantId, id: { in: idArr } },
            select: { id: true, description: true },
          });
          for (const e of exps) namesIndex.set(`Expense:${e.id}`, `«${e.description}»`);
          return;
        }
        default:
          return;
      }
    }),
  );
  const recentActivity: RecentActivityRow[] = recentLogs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt,
    userName: log.user?.name ?? null,
    description: describeAuditLog(log, namesIndex),
  }));

  return {
    asOf: { month, periodStart, periodEnd },
    summary,
    trends: { monthlyIncome, occupancyTrend },
    byProperty,
    byLegalEntity,
    topOverdue,
    recentActivity,
    alerts,
  };
};

/**
 * Cacheada con `cache()` de React por request: si dos componentes del
 * dashboard piden las métricas (page + suspense boundary), comparten la
 * misma resolución dentro del mismo render.
 */
export const getDashboardMetrics = cache(
  async (tenantId: string, options: DashboardOptions = {}): Promise<DashboardMetrics> => {
    return fetchDashboardMetricsImpl(tenantId, options);
  },
);
