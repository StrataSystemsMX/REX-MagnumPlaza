import { Prisma } from "@/generated/prisma/client";
import { auditActionLabel } from "@/lib/i18n/enums";
import type { AuditAction, RentStatus } from "@/generated/prisma/enums";

// ============================================================================
// Tipos públicos del dashboard
// ============================================================================

export interface DashboardOptions {
  /** Mes a analizar en formato 'YYYY-MM'. Default: mes corriente. */
  month?: string;
  /** Si se pasa, filtra ingresos/egresos a esa LegalEntity. */
  legalEntityId?: string;
}

export interface DashboardSummary {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  activeContracts: number;
  contractsExpiringIn60Days: number;
  totalMonthlyExpectedIncome: string;
  totalCollectedThisMonth: string;
  totalOutstanding: string;
  overdueByLevel: { "1M": number; "2M": number; "3M": number };
}

export interface MonthlyIncomePoint {
  month: string;
  expected: string;
  collected: string;
}

export interface OccupancyTrendPoint {
  month: string;
  occupancyRate: number;
}

export interface PropertyMetricRow {
  propertyId: string;
  propertyName: string;
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
  expectedIncome: string;
  collectedIncome: string;
}

export interface LegalEntityMetricRow {
  legalEntityId: string;
  code: string;
  legalName: string;
  income: string;
  expenses: string;
  profit: string;
}

export type OverdueLevel = "DUE" | "OVERDUE_1M" | "OVERDUE_2M" | "OVERDUE_3M";

export interface TopOverdueRow {
  lesseeId: string;
  legalName: string;
  contactName: string | null;
  whatsapp: string | null;
  phone: string | null;
  outstanding: string;
  oldestDaysOverdue: number;
  rentsOverdue: number;
  worstLevel: OverdueLevel;
}

export interface RecentActivityRow {
  id: string;
  createdAt: Date;
  userName: string | null;
  description: string;
}

export interface DashboardAlert {
  level: "warning" | "critical";
  message: string;
}

export interface DashboardMetrics {
  asOf: { month: string; periodStart: Date; periodEnd: Date };
  summary: DashboardSummary;
  trends: {
    monthlyIncome: MonthlyIncomePoint[];
    occupancyTrend: OccupancyTrendPoint[];
  };
  byProperty: PropertyMetricRow[];
  byLegalEntity: LegalEntityMetricRow[];
  topOverdue: TopOverdueRow[];
  recentActivity: RecentActivityRow[];
  alerts: DashboardAlert[];
}

// ============================================================================
// Helpers de fecha y dinero (puros)
// ============================================================================

export const OUTSTANDING_STATUSES: RentStatus[] = [
  "DUE",
  "PARTIAL",
  "OVERDUE_1M",
  "OVERDUE_2M",
  "OVERDUE_3M",
];

export const ZERO = new Prisma.Decimal(0);

export function parseMonth(month: string | undefined, now: Date = new Date()): {
  month: string;
  periodStart: Date;
  periodEnd: Date;
} {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    return {
      month,
      periodStart: new Date(Date.UTC(y, m - 1, 1)),
      periodEnd: new Date(Date.UTC(y, m, 1)),
    };
  }
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    month: `${y}-${String(m + 1).padStart(2, "0")}`,
    periodStart: new Date(Date.UTC(y, m, 1)),
    periodEnd: new Date(Date.UTC(y, m + 1, 1)),
  };
}

export function lastNMonths(
  end: Date,
  n: number,
): Array<{ month: string; start: Date; end: Date }> {
  const months: Array<{ month: string; start: Date; end: Date }> = [];
  const y = end.getUTCFullYear();
  const m = end.getUTCMonth();
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const next = new Date(Date.UTC(y, m - i + 1, 1));
    months.push({
      month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
      start,
      end: next,
    });
  }
  return months;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dec(
  value: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal {
  if (value === null || value === undefined) return ZERO;
  return new Prisma.Decimal(value);
}

export function sumDec(values: Iterable<Prisma.Decimal>): Prisma.Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}

// ============================================================================
// Helper público y testeable: arma el `summary` a partir de las piezas
// ============================================================================

export interface SummaryInputs {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  activeContracts: Array<{ monthlyAmount: Prisma.Decimal | number | string }>;
  expiringContracts: number;
  paymentsThisMonth: Array<{ amount: Prisma.Decimal | number | string }>;
  outstandingRents: Array<{
    amountDue: Prisma.Decimal | number | string;
    amountPaid: Prisma.Decimal | number | string;
    status: RentStatus;
  }>;
}

/**
 * Compone el summary numérico a partir de los datos crudos. Pura y testeable
 * sin tocar Prisma — usada por getDashboardMetrics y por los tests.
 */
export function computeSummary(input: SummaryInputs): DashboardSummary {
  const occupancyRate =
    input.totalUnits === 0 ? 0 : input.occupiedUnits / input.totalUnits;
  const totalMonthlyExpectedIncome = sumDec(
    input.activeContracts.map((c) => dec(c.monthlyAmount)),
  );
  const totalCollectedThisMonth = sumDec(
    input.paymentsThisMonth.map((p) => dec(p.amount)),
  );
  const totalOutstanding = sumDec(
    input.outstandingRents.map((r) => dec(r.amountDue).minus(dec(r.amountPaid))),
  );
  const overdueByLevel = {
    "1M": input.outstandingRents.filter((r) => r.status === "OVERDUE_1M").length,
    "2M": input.outstandingRents.filter((r) => r.status === "OVERDUE_2M").length,
    "3M": input.outstandingRents.filter((r) => r.status === "OVERDUE_3M").length,
  };

  return {
    totalProperties: input.totalProperties,
    totalUnits: input.totalUnits,
    occupiedUnits: input.occupiedUnits,
    vacantUnits: input.totalUnits - input.occupiedUnits,
    occupancyRate,
    activeContracts: input.activeContracts.length,
    contractsExpiringIn60Days: input.expiringContracts,
    totalMonthlyExpectedIncome: totalMonthlyExpectedIncome.toString(),
    totalCollectedThisMonth: totalCollectedThisMonth.toString(),
    totalOutstanding: totalOutstanding.toString(),
    overdueByLevel,
  };
}

/** Banderas de alerta basadas en deltas mes a mes. Pura. */
export function detectAlerts(
  current: DashboardSummary,
  previous: DashboardSummary | null,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  if (previous && previous.occupancyRate > 0) {
    const drop = previous.occupancyRate - current.occupancyRate;
    if (drop > 0.1) {
      alerts.push({
        level: "warning",
        message: `La ocupación cayó ${Math.round(drop * 100)} puntos respecto al mes anterior.`,
      });
    }
  }
  if (previous) {
    const prev = Number(previous.totalOutstanding);
    const curr = Number(current.totalOutstanding);
    if (prev > 0 && curr / prev > 1.2) {
      alerts.push({
        level: "warning",
        message: `La cartera vencida creció ${Math.round((curr / prev - 1) * 100)}% respecto al mes anterior.`,
      });
    }
  }
  if (current.overdueByLevel["3M"] > 0) {
    alerts.push({
      level: "critical",
      message: `Hay ${current.overdueByLevel["3M"]} renta(s) con 3 meses vencidos. Requieren intervención humana.`,
    });
  }
  return alerts;
}

// ============================================================================
// Descripción legible de un AuditLog
// ============================================================================

export interface RawAuditLog {
  id: string;
  createdAt: Date;
  action: AuditAction;
  entityType: string;
  entityId: string;
  changes: Prisma.JsonValue | null;
  user: { name: string } | null;
}

export function describeAuditLog(log: RawAuditLog, names: Map<string, string>): string {
  const subject = log.user?.name ?? "Alguien";
  const verb = auditActionLabel(log.action).toLowerCase();
  const entityLabel = entityTypeLabel(log.entityType);
  const target = names.get(`${log.entityType}:${log.entityId}`) ?? "";
  const changes =
    log.changes && typeof log.changes === "object" && !Array.isArray(log.changes)
      ? (log.changes as Record<string, unknown>)
      : null;

  if (log.entityType === "Payment" && log.action === "CREATE" && changes?.["amount"]) {
    const amount = formatCurrency(String(changes["amount"]));
    const recipient = target ? ` a ${target}` : "";
    return `${subject} registró un pago de ${amount}${recipient}.`;
  }

  const targetSegment = target ? ` ${target}` : ` ${log.entityId.slice(0, 6)}`;
  return `${subject} ${verb} ${entityLabel}${targetSegment}.`;
}

function entityTypeLabel(type: string): string {
  switch (type) {
    case "Contract":
      return "el contrato";
    case "Payment":
      return "el pago";
    case "Property":
      return "el inmueble";
    case "Unit":
      return "la unidad";
    case "Lessee":
      return "al inquilino";
    case "Expense":
      return "el gasto";
    case "Guarantee":
      return "la fianza";
    case "Rent":
      return "la renta";
    default:
      return type.toLowerCase();
  }
}

function formatCurrency(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}
