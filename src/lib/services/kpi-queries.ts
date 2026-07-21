import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";

const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

// ============================================================================
// Public types
// ============================================================================

export type ReportScope =
  | { type: "tenant" }
  | { type: "entity"; id: string }
  | { type: "property"; id: string }
  | { type: "unit"; id: string };

export type KpiStatus = "good" | "warning" | "bad" | "neutral";

export interface KpiValue {
  raw: number;
  formatted: string;
  detail: string | null;
  status: KpiStatus;
}

export interface KpiSet {
  occupancyRate: KpiValue | null;
  avgVacancyDays: KpiValue | null;
  mrr: KpiValue | null;
  collectionRate: KpiValue | null;
  overdueRate: KpiValue | null;
  tenantTurnover: KpiValue | null;
  maintenanceCostPerSqm: KpiValue | null;
  roi: KpiValue | null;
  renewalRate: KpiValue | null;
  avgResolutionDays: KpiValue | null;
}

// ============================================================================
// Period helper — all KPIs use this for consistent date ranges
// ============================================================================

interface KpiPeriod {
  start: Date;   // inclusive
  end: Date;     // exclusive
  cutoff: Date;  // min(now, end) — for "up to today" queries
}

function buildPeriod(year: number, month?: number): KpiPeriod {
  const now = new Date();
  const start = month
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date(Date.UTC(year, 0, 1));
  const end = month
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year + 1, 0, 1));
  return { start, end, cutoff: now < end ? now : end };
}

// ============================================================================
// Scope resolution
// ============================================================================

interface ScopeIds {
  propertyIds: string[];
  unitIds: string[];
  totalAreaM2: number;
}

async function resolveScopeIds(tenantId: string, scope: ReportScope): Promise<ScopeIds> {
  if (scope.type === "unit") {
    const unit = await prisma.unit.findFirst({
      where: { id: scope.id, tenantId, isActive: true },
      select: { id: true, propertyId: true, area: true },
    });
    return {
      propertyIds: unit ? [unit.propertyId] : [],
      unitIds: unit ? [unit.id] : [],
      totalAreaM2: unit?.area ?? 0,
    };
  }

  let propertyWhere: Prisma.PropertyWhereInput = { tenantId, isActive: true };
  if (scope.type === "entity") {
    propertyWhere = {
      ...propertyWhere,
      OR: [{ ownerEntityId: scope.id }, { managerEntityId: scope.id }],
    };
  } else if (scope.type === "property") {
    propertyWhere = { ...propertyWhere, id: scope.id };
  }

  const props = await prisma.property.findMany({ where: propertyWhere, select: { id: true } });
  const propertyIds = props.map((p) => p.id);

  const units = await prisma.unit.findMany({
    where: { tenantId, isActive: true, propertyId: { in: propertyIds } },
    select: { id: true, area: true },
  });

  return {
    propertyIds,
    unitIds: units.map((u) => u.id),
    totalAreaM2: units.reduce((sum, u) => sum + (u.area ?? 0), 0),
  };
}

// ============================================================================
// KPI 1 — Tasa de ocupación  (snapshot, no period-dependent)
// ============================================================================

async function kpiOccupancyRate(tenantId: string, unitIds: string[]): Promise<KpiValue | null> {
  if (unitIds.length === 0) return null;

  const units = await prisma.unit.findMany({
    where: { tenantId, id: { in: unitIds }, isActive: true },
    select: { status: true },
  });

  const total = units.length;
  if (total === 0) return null;

  const rented = units.filter((u) => u.status === "RENTADA").length;
  const rate = rented / total;

  return {
    raw: rate * 100,
    formatted: `${Math.round(rate * 100)}%`,
    detail: `${rented} de ${total} locales rentados`,
    status: rate >= 0.8 ? "good" : rate >= 0.6 ? "warning" : "bad",
  };
}

// ============================================================================
// KPI 2 — Tiempo promedio de vacancia
// ============================================================================

async function kpiAvgVacancyDays(
  tenantId: string,
  unitIds: string[],
  period: KpiPeriod,
): Promise<KpiValue | null> {
  if (unitIds.length === 0) return null;

  const newContracts = await prisma.contract.findMany({
    where: {
      tenantId,
      unitId: { in: unitIds },
      startDate: { gte: period.start, lt: period.end },
      status: { in: ["ACTIVE", "EXPIRED", "TERMINATED"] },
    },
    select: { unitId: true, startDate: true },
  });

  if (newContracts.length === 0) return null;

  const scopedUnitIds = [...new Set(newContracts.map((c) => c.unitId))];
  const prevContracts = await prisma.contract.findMany({
    where: {
      tenantId,
      unitId: { in: scopedUnitIds },
      status: { in: ["EXPIRED", "TERMINATED"] },
    },
    select: { unitId: true, endDate: true },
    orderBy: { endDate: "desc" },
  });

  const gaps: number[] = [];
  for (const nc of newContracts) {
    const prev = prevContracts.find((pc) => pc.unitId === nc.unitId && pc.endDate <= nc.startDate);
    if (!prev) continue;
    const gap = Math.floor(
      (nc.startDate.getTime() - prev.endDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (gap >= 0 && gap < 730) gaps.push(gap);
  }

  if (gaps.length === 0) return null;

  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const rounded = Math.round(avg);

  return {
    raw: rounded,
    formatted: `${rounded} días`,
    detail: `Promedio de ${gaps.length} transiciones`,
    status: rounded <= 30 ? "good" : rounded <= 90 ? "warning" : "bad",
  };
}

// ============================================================================
// KPI 3 — MRR  (snapshot, no period-dependent)
// ============================================================================

async function kpiMrr(tenantId: string, unitIds: string[]): Promise<KpiValue | null> {
  if (unitIds.length === 0) return null;

  const contracts = await prisma.contract.findMany({
    where: { tenantId, unitId: { in: unitIds }, status: "ACTIVE" },
    select: { monthlyAmount: true },
  });

  const total = contracts.reduce((sum, c) => sum.plus(dec(c.monthlyAmount)), ZERO);
  const num = total.toNumber();

  return {
    raw: num,
    formatted: MXN.format(num),
    detail: `${contracts.length} contrato${contracts.length !== 1 ? "s" : ""} activo${contracts.length !== 1 ? "s" : ""}`,
    status: "neutral",
  };
}

// ============================================================================
// KPI 4 — Índice de cobranza
// ============================================================================

async function kpiCollectionRate(
  tenantId: string,
  unitIds: string[],
  period: KpiPeriod,
): Promise<KpiValue | null> {
  if (unitIds.length === 0) return null;

  const rents = await prisma.rent.findMany({
    where: {
      tenantId,
      contract: { unitId: { in: unitIds } },
      dueDate: { gte: period.start, lte: period.cutoff },
      status: { notIn: ["PENDING", "WAIVED"] },
    },
    select: { status: true },
  });

  if (rents.length === 0) return null;

  const paid = rents.filter((r) => r.status === "PAID").length;
  const rate = paid / rents.length;

  return {
    raw: rate * 100,
    formatted: `${Math.round(rate * 100)}%`,
    detail: `${paid} de ${rents.length} rentas cobradas`,
    status: rate >= 0.9 ? "good" : rate >= 0.75 ? "warning" : "bad",
  };
}

// ============================================================================
// KPI 5 — Cartera vencida %
// ============================================================================

async function kpiOverdueRate(
  tenantId: string,
  unitIds: string[],
  period: KpiPeriod,
): Promise<KpiValue | null> {
  if (unitIds.length === 0) return null;

  const rents = await prisma.rent.findMany({
    where: {
      tenantId,
      contract: { unitId: { in: unitIds } },
      dueDate: { gte: period.start, lte: period.cutoff },
      status: { notIn: ["PENDING", "WAIVED"] },
    },
    select: { amountDue: true, amountPaid: true, status: true },
  });

  if (rents.length === 0) return null;

  let totalBilled = ZERO;
  let totalOverdue = ZERO;

  for (const r of rents) {
    const due = dec(r.amountDue);
    const paid = dec(r.amountPaid);
    totalBilled = totalBilled.plus(due);
    if (["OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M", "DUE"].includes(r.status)) {
      const balance = due.minus(paid);
      totalOverdue = totalOverdue.plus(balance.gt(ZERO) ? balance : ZERO);
    }
  }

  if (totalBilled.lte(ZERO)) return null;

  const rate = totalOverdue.div(totalBilled).toNumber();

  return {
    raw: rate * 100,
    formatted: `${(rate * 100).toFixed(1)}%`,
    detail: `${MXN.format(totalOverdue.toNumber())} vencido`,
    status: rate <= 0.05 ? "good" : rate <= 0.15 ? "warning" : "bad",
  };
}

// ============================================================================
// KPI 6 — Rotación de inquilinos
// ============================================================================

async function kpiTenantTurnover(
  tenantId: string,
  unitIds: string[],
  period: KpiPeriod,
): Promise<KpiValue | null> {
  if (unitIds.length === 0) return null;

  const [ended, active] = await Promise.all([
    prisma.contract.count({
      where: {
        tenantId,
        unitId: { in: unitIds },
        status: { in: ["EXPIRED", "TERMINATED"] },
        endDate: { gte: period.start, lt: period.end },
      },
    }),
    prisma.contract.count({
      where: { tenantId, unitId: { in: unitIds }, status: "ACTIVE" },
    }),
  ]);

  const base = active + ended;
  if (base === 0) return null;

  const rate = ended / base;

  return {
    raw: rate * 100,
    formatted: `${Math.round(rate * 100)}%`,
    detail: `${ended} inquilino${ended !== 1 ? "s" : ""} salieron`,
    status: rate <= 0.2 ? "good" : rate <= 0.4 ? "warning" : "bad",
  };
}

// ============================================================================
// KPI 7 — Costo de mantenimiento por m²
// ============================================================================

async function kpiMaintenanceCostPerSqm(
  tenantId: string,
  propertyIds: string[],
  totalAreaM2: number,
  period: KpiPeriod,
): Promise<KpiValue | null> {
  if (propertyIds.length === 0 || totalAreaM2 <= 0) return null;

  const maintenances = await prisma.maintenance.findMany({
    where: {
      tenantId,
      propertyId: { in: propertyIds },
      status: "COMPLETED",
      completedDate: { gte: period.start, lt: period.end },
      cost: { not: null },
    },
    select: { cost: true },
  });

  if (maintenances.length === 0) return null;

  const totalCost = maintenances.reduce((sum, m) => sum.plus(dec(m.cost)), ZERO);
  const perSqm = totalCost.div(totalAreaM2).toNumber();

  return {
    raw: perSqm,
    formatted: `${MXN.format(perSqm)}/m²`,
    detail: `${MXN.format(totalCost.toNumber())} total · ${Math.round(totalAreaM2)} m²`,
    status: perSqm <= 50 ? "good" : perSqm <= 150 ? "warning" : "bad",
  };
}

// ============================================================================
// KPI 8 — Rentabilidad (ROI)
// ============================================================================

async function kpiRoi(
  tenantId: string,
  unitIds: string[],
  propertyIds: string[],
  period: KpiPeriod,
): Promise<KpiValue | null> {
  if (unitIds.length === 0) return null;

  const [payments, maintenances, activeContracts] = await Promise.all([
    prisma.payment.findMany({
      where: {
        tenantId,
        paymentDate: { gte: period.start, lt: period.cutoff },
        rent: { contract: { unitId: { in: unitIds } } },
      },
      select: { amount: true },
    }),
    prisma.maintenance.findMany({
      where: {
        tenantId,
        propertyId: { in: propertyIds },
        status: "COMPLETED",
        completedDate: { gte: period.start, lt: period.cutoff },
        cost: { not: null },
      },
      select: { cost: true },
    }),
    prisma.contract.findMany({
      where: { tenantId, unitId: { in: unitIds }, status: "ACTIVE" },
      select: { monthlyAmount: true },
    }),
  ]);

  const income = payments.reduce((sum, p) => sum.plus(dec(p.amount)), ZERO);
  const expenses = maintenances.reduce((sum, m) => sum.plus(dec(m.cost)), ZERO);
  const msElapsed = period.cutoff.getTime() - period.start.getTime();
  const monthsElapsed = Math.max(1, msElapsed / (1000 * 60 * 60 * 24 * 30.44));
  const mrr = activeContracts.reduce((sum, c) => sum.plus(dec(c.monthlyAmount)), ZERO);
  const expectedIncome = mrr.times(monthsElapsed);

  if (expectedIncome.lte(ZERO)) return null;

  const roi = income.minus(expenses).div(expectedIncome).toNumber();

  return {
    raw: roi * 100,
    formatted: `${Math.round(roi * 100)}%`,
    detail: `${MXN.format(income.toNumber())} ingresos · ${MXN.format(expenses.toNumber())} gastos`,
    status: roi >= 0.85 ? "good" : roi >= 0.7 ? "warning" : "bad",
  };
}

// ============================================================================
// KPI 9 — Tasa de renovación
// ============================================================================

async function kpiRenewalRate(
  tenantId: string,
  unitIds: string[],
  period: KpiPeriod,
): Promise<KpiValue | null> {
  if (unitIds.length === 0) return null;

  const expired = await prisma.contract.findMany({
    where: {
      tenantId,
      unitId: { in: unitIds },
      status: { in: ["EXPIRED", "TERMINATED"] },
      endDate: { gte: period.start, lt: period.end },
    },
    select: { unitId: true, endDate: true },
  });

  if (expired.length === 0) return null;

  const first = expired[0]!;
  const earliestEnd = expired.reduce((min, c) => (c.endDate < min ? c.endDate : min), first.endDate);
  const latestEnd = expired.reduce((max, c) => (c.endDate > max ? c.endDate : max), first.endDate);
  const windowEnd = new Date(latestEnd.getTime() + 45 * 24 * 60 * 60 * 1000);

  const renewals = await prisma.contract.findMany({
    where: {
      tenantId,
      unitId: { in: unitIds },
      startDate: { gte: earliestEnd, lte: windowEnd },
      status: { in: ["ACTIVE", "EXPIRED", "TERMINATED"] },
    },
    select: { unitId: true, startDate: true },
  });

  let renewed = 0;
  for (const ex of expired) {
    const w = new Date(ex.endDate.getTime() + 45 * 24 * 60 * 60 * 1000);
    if (renewals.some((r) => r.unitId === ex.unitId && r.startDate >= ex.endDate && r.startDate <= w)) {
      renewed++;
    }
  }

  const rate = renewed / expired.length;

  return {
    raw: rate * 100,
    formatted: `${Math.round(rate * 100)}%`,
    detail: `${renewed} de ${expired.length} contratos renovados`,
    status: rate >= 0.8 ? "good" : rate >= 0.6 ? "warning" : "bad",
  };
}

// ============================================================================
// KPI 10 — Tiempo promedio de resolución
// ============================================================================

async function kpiAvgResolutionDays(
  tenantId: string,
  propertyIds: string[],
  period: KpiPeriod,
): Promise<KpiValue | null> {
  if (propertyIds.length === 0) return null;

  const maintenances = await prisma.maintenance.findMany({
    where: {
      tenantId,
      propertyId: { in: propertyIds },
      status: "COMPLETED",
      completedDate: { gte: period.start, lt: period.end },
    },
    select: { createdAt: true, completedDate: true },
  });

  const days = maintenances
    .filter((m): m is typeof m & { completedDate: Date } => m.completedDate !== null)
    .map((m) =>
      Math.max(0, Math.floor((m.completedDate.getTime() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24))),
    );

  if (days.length === 0) return null;

  const avg = days.reduce((a, b) => a + b, 0) / days.length;
  const rounded = Math.round(avg);

  return {
    raw: rounded,
    formatted: `${rounded} días`,
    detail: `${days.length} mantenimiento${days.length !== 1 ? "s" : ""} completado${days.length !== 1 ? "s" : ""}`,
    status: rounded <= 7 ? "good" : rounded <= 30 ? "warning" : "bad",
  };
}

// ============================================================================
// Public bundle function
// ============================================================================

export async function getKpiSet(
  tenantId: string,
  scope: ReportScope,
  year: number,
  month?: number,
): Promise<KpiSet> {
  const { propertyIds, unitIds, totalAreaM2 } = await resolveScopeIds(tenantId, scope);
  const period = buildPeriod(year, month);
  const isUnit = scope.type === "unit";

  const safe = <T,>(p: Promise<T | null>): Promise<T | null> =>
    p.catch((e) => { console.error("[kpi-queries]", e); return null; });

  const [
    occupancyRate,
    avgVacancyDays,
    mrr,
    collectionRate,
    overdueRate,
    tenantTurnover,
    maintenanceCostPerSqm,
    roi,
    renewalRate,
    avgResolutionDays,
  ] = await Promise.all([
    isUnit ? Promise.resolve(null) : safe(kpiOccupancyRate(tenantId, unitIds)),
    safe(kpiAvgVacancyDays(tenantId, unitIds, period)),
    safe(kpiMrr(tenantId, unitIds)),
    safe(kpiCollectionRate(tenantId, unitIds, period)),
    safe(kpiOverdueRate(tenantId, unitIds, period)),
    isUnit ? Promise.resolve(null) : safe(kpiTenantTurnover(tenantId, unitIds, period)),
    isUnit ? Promise.resolve(null) : safe(kpiMaintenanceCostPerSqm(tenantId, propertyIds, totalAreaM2, period)),
    safe(kpiRoi(tenantId, unitIds, propertyIds, period)),
    safe(kpiRenewalRate(tenantId, unitIds, period)),
    isUnit ? Promise.resolve(null) : safe(kpiAvgResolutionDays(tenantId, propertyIds, period)),
  ]);

  return {
    occupancyRate,
    avgVacancyDays,
    mrr,
    collectionRate,
    overdueRate,
    tenantTurnover,
    maintenanceCostPerSqm,
    roi,
    renewalRate,
    avgResolutionDays,
  };
}
