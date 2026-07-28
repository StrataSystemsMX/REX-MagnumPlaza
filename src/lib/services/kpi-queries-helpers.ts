import { Prisma } from "@/generated/prisma/client";

export const ZERO = new Prisma.Decimal(0);

export const dec = (v: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

export const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

// ============================================================================
// Tipos públicos
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
// Period helper — all KPIs use this for consistent date ranges. Pura.
// ============================================================================

export interface KpiPeriod {
  start: Date; // inclusive
  end: Date; // exclusive
  cutoff: Date; // min(now, end) — for "up to today" queries
}

export function buildPeriod(year: number, month?: number, now: Date = new Date()): KpiPeriod {
  const start = month
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date(Date.UTC(year, 0, 1));
  const end = month
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year + 1, 0, 1));
  return { start, end, cutoff: now < end ? now : end };
}

// ============================================================================
// KPI 1 — Tasa de ocupación
// ============================================================================

export function computeOccupancyRate(units: { status: string }[]): KpiValue | null {
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

export interface VacancyNewContract {
  unitId: string;
  startDate: Date;
}

export interface VacancyPrevContract {
  unitId: string;
  endDate: Date;
}

export function computeAvgVacancyDays(
  newContracts: VacancyNewContract[],
  prevContracts: VacancyPrevContract[],
): KpiValue | null {
  if (newContracts.length === 0) return null;

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
// KPI 3 — MRR
// ============================================================================

export function computeMrr(
  contracts: { monthlyAmount: Prisma.Decimal | number | string }[],
): KpiValue | null {
  if (contracts.length === 0) return null;

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

export function computeCollectionRate(rents: { status: string }[]): KpiValue | null {
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

export function computeOverdueRate(
  rents: {
    amountDue: Prisma.Decimal | number | string;
    amountPaid: Prisma.Decimal | number | string;
    status: string;
  }[],
): KpiValue | null {
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

export function computeTenantTurnover(ended: number, active: number): KpiValue | null {
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

export function computeMaintenanceCostPerSqm(
  maintenances: { cost: Prisma.Decimal | number | string | null }[],
  totalAreaM2: number,
): KpiValue | null {
  if (totalAreaM2 <= 0 || maintenances.length === 0) return null;

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

export function computeRoi(
  payments: { amount: Prisma.Decimal | number | string }[],
  maintenances: { cost: Prisma.Decimal | number | string | null }[],
  activeContracts: { monthlyAmount: Prisma.Decimal | number | string }[],
  period: KpiPeriod,
): KpiValue | null {
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

export interface ExpiredContract {
  unitId: string;
  endDate: Date;
}

export interface RenewalCandidate {
  unitId: string;
  startDate: Date;
}

export function computeRenewalRate(
  expired: ExpiredContract[],
  renewals: RenewalCandidate[],
): KpiValue | null {
  if (expired.length === 0) return null;

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

/** Ventana [earliestEnd, latestEnd + 45 días] usada para acotar la query de renovaciones candidatas. */
export function renewalCandidateWindow(expired: ExpiredContract[]): { start: Date; end: Date } | null {
  if (expired.length === 0) return null;
  const first = expired[0]!;
  const earliestEnd = expired.reduce((min, c) => (c.endDate < min ? c.endDate : min), first.endDate);
  const latestEnd = expired.reduce((max, c) => (c.endDate > max ? c.endDate : max), first.endDate);
  return { start: earliestEnd, end: new Date(latestEnd.getTime() + 45 * 24 * 60 * 60 * 1000) };
}

// ============================================================================
// KPI 10 — Tiempo promedio de resolución
// ============================================================================

export function computeAvgResolutionDays(
  maintenances: { createdAt: Date; completedDate: Date | null }[],
): KpiValue | null {
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
