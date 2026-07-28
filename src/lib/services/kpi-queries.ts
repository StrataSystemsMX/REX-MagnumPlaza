import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";
import {
  buildPeriod,
  computeAvgResolutionDays,
  computeAvgVacancyDays,
  computeCollectionRate,
  computeMaintenanceCostPerSqm,
  computeMrr,
  computeOccupancyRate,
  computeOverdueRate,
  computeRenewalRate,
  computeRoi,
  computeTenantTurnover,
  renewalCandidateWindow,
  type KpiPeriod,
  type KpiSet,
  type KpiValue,
  type ReportScope,
} from "@/lib/services/kpi-queries-helpers";

export type { KpiSet, KpiStatus, KpiValue, ReportScope } from "@/lib/services/kpi-queries-helpers";

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

  return computeOccupancyRate(units);
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

  return computeAvgVacancyDays(newContracts, prevContracts);
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

  return computeMrr(contracts);
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

  return computeCollectionRate(rents);
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

  return computeOverdueRate(rents);
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

  return computeTenantTurnover(ended, active);
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

  return computeMaintenanceCostPerSqm(maintenances, totalAreaM2);
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

  return computeRoi(payments, maintenances, activeContracts, period);
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

  const window = renewalCandidateWindow(expired);
  if (!window) return null;

  const renewals = await prisma.contract.findMany({
    where: {
      tenantId,
      unitId: { in: unitIds },
      startDate: { gte: window.start, lte: window.end },
      status: { in: ["ACTIVE", "EXPIRED", "TERMINATED"] },
    },
    select: { unitId: true, startDate: true },
  });

  return computeRenewalRate(expired, renewals);
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

  return computeAvgResolutionDays(maintenances);
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
  const scopeKey = scope.type === "tenant" ? "tenant" : `${scope.type}:${scope.id}`;
  return unstable_cache(
    () => computeKpiSet(tenantId, scope, year, month),
    ["kpi-set", tenantId, scopeKey, String(year), String(month ?? "")],
    { revalidate: 300, tags: [`kpi-${tenantId}`] },
  )();
}

async function computeKpiSet(
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
