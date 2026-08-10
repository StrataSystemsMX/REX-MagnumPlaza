import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";
import { computeBalance } from "@/lib/services/rent-status";
import { getOperatingExpenseRows } from "@/lib/services/consolidated-expenses";
import type {
  ContractStatus,
  ContractType,
  PropertyType,
} from "@/generated/prisma/enums";

const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | string | null | undefined) =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

const OUTSTANDING_RENT_STATUSES = [
  "DUE",
  "PARTIAL",
  "OVERDUE_1M",
  "OVERDUE_2M",
  "OVERDUE_3M",
] as const;

// ============================================================================
// Tipos públicos
// ============================================================================

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export interface AgingByLesseeRow {
  lesseeId: string;
  legalName: string;
  contactName: string | null;
  rentsOverdueCount: number;
  bucket0to30: string;
  bucket31to60: string;
  bucket61to90: string;
  bucket90plus: string;
  total: string;
  oldestDaysOverdue: number;
}

export interface AgingReport {
  asOf: Date;
  totals: {
    bucket0to30: string;
    bucket31to60: string;
    bucket61to90: string;
    bucket90plus: string;
    total: string;
  };
  rows: AgingByLesseeRow[];
}

export interface OccupancyByPropertyRow {
  propertyId: string;
  propertyName: string;
  type: PropertyType;
  totalUnits: number;
  rentedUnits: number;
  availableUnits: number;
  otherUnits: number;
  occupancyRate: number;
  contractedMonthlyIncome: string;
  potentialLostIncome: string;
}

export interface VacantUnitRow {
  unitId: string;
  unitCode: string;
  unitName: string | null;
  propertyId: string;
  propertyName: string;
  estimatedRent: string | null;
  status: string;
}

export interface OccupancyReport {
  rows: OccupancyByPropertyRow[];
  vacantUnits: VacantUnitRow[];
  totals: {
    totalUnits: number;
    rentedUnits: number;
    availableUnits: number;
    occupancyRate: number;
    contractedMonthlyIncome: string;
    potentialLostIncome: string;
  };
}

export interface IncomeByPropertyRow {
  propertyId: string;
  propertyName: string;
  type: PropertyType;
  monthly: string[]; // 12 meses
  total: string;
}

export interface IncomeByPropertyReport {
  year: number;
  rows: IncomeByPropertyRow[];
  monthlyTotals: string[];
  grandTotal: string;
}

export interface ExpensesByCategoryRow {
  categoryName: string;
  categoryCode: string;
  total: string;
  pct: number; // fracción del gasto total del año (0-1)
  byLegalEntity: Record<string, string>; // key: legalEntity.code
}

export interface ExpensesByCategoryReport {
  year: number;
  legalEntityCodes: string[];
  rows: ExpensesByCategoryRow[];
  totals: {
    total: string;
    byLegalEntity: Record<string, string>;
    pctByLegalEntity: Record<string, number>; // fracción del total por razón social (0-1)
  };
}

export interface ContractStatusRow {
  status: ContractStatus;
  count: number;
  monthlyAmount: string;
}

export interface ContractTypeRow {
  type: ContractType;
  count: number;
}

export interface ExpiringContractRow {
  id: string;
  endDate: Date;
  daysUntilEnd: number;
  monthlyAmount: string;
  lesseeId: string;
  lesseeLegalName: string;
  unitCode: string;
  propertyId: string;
  propertyName: string;
}

export interface ContractsReport {
  totalContracts: number;
  byStatus: ContractStatusRow[];
  byType: ContractTypeRow[];
  expiringNext60Days: ExpiringContractRow[];
  expiredNotRenewed: ExpiringContractRow[];
}

export interface ReportsBundle {
  year: number;
  aging: AgingReport;
  occupancy: OccupancyReport;
  incomeByProperty: IncomeByPropertyReport;
  expensesByCategory: ExpensesByCategoryReport;
  contracts: ContractsReport;
}

// ============================================================================
// Aging — cartera vencida agrupada por antigüedad
// ============================================================================

async function buildAgingReport(tenantId: string, now: Date): Promise<AgingReport> {
  const rents = await prisma.rent.findMany({
    where: {
      tenantId,
      status: { in: [...OUTSTANDING_RENT_STATUSES] },
    },
    select: {
      id: true,
      amountDue: true,
      amountPaid: true,
      amountWaived: true,
      lateFeeAccrued: true,
      dueDate: true,
      contract: {
        select: {
          lessee: {
            select: { id: true, legalName: true, contactName: true },
          },
        },
      },
    },
  });

  const byLessee = new Map<string, AgingByLesseeRow>();
  const totals = { b30: ZERO, b60: ZERO, b90: ZERO, bPlus: ZERO };

  for (const r of rents) {
    const balance = computeBalance(r.amountDue, r.amountPaid, r.amountWaived, r.lateFeeAccrued);
    if (balance.lte(ZERO)) continue;

    const days = Math.max(
      0,
      Math.floor((now.getTime() - r.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const lessee = r.contract.lessee;
    let row = byLessee.get(lessee.id);
    if (!row) {
      row = {
        lesseeId: lessee.id,
        legalName: lessee.legalName,
        contactName: lessee.contactName,
        rentsOverdueCount: 0,
        bucket0to30: "0",
        bucket31to60: "0",
        bucket61to90: "0",
        bucket90plus: "0",
        total: "0",
        oldestDaysOverdue: 0,
      };
      byLessee.set(lessee.id, row);
    }
    row.rentsOverdueCount += 1;
    if (days > row.oldestDaysOverdue) row.oldestDaysOverdue = days;

    if (days <= 30) {
      row.bucket0to30 = dec(row.bucket0to30).plus(balance).toString();
      totals.b30 = totals.b30.plus(balance);
    } else if (days <= 60) {
      row.bucket31to60 = dec(row.bucket31to60).plus(balance).toString();
      totals.b60 = totals.b60.plus(balance);
    } else if (days <= 90) {
      row.bucket61to90 = dec(row.bucket61to90).plus(balance).toString();
      totals.b90 = totals.b90.plus(balance);
    } else {
      row.bucket90plus = dec(row.bucket90plus).plus(balance).toString();
      totals.bPlus = totals.bPlus.plus(balance);
    }
    row.total = dec(row.total).plus(balance).toString();
  }

  const rows = Array.from(byLessee.values()).sort(
    (a, b) => Number(b.total) - Number(a.total),
  );

  const grand = totals.b30.plus(totals.b60).plus(totals.b90).plus(totals.bPlus);

  return {
    asOf: now,
    totals: {
      bucket0to30: totals.b30.toString(),
      bucket31to60: totals.b60.toString(),
      bucket61to90: totals.b90.toString(),
      bucket90plus: totals.bPlus.toString(),
      total: grand.toString(),
    },
    rows,
  };
}

// ============================================================================
// Ocupación detallada — por inmueble + lista de unidades vacantes
// ============================================================================

async function buildOccupancyReport(tenantId: string): Promise<OccupancyReport> {
  const [properties, units, activeContracts] = await Promise.all([
    prisma.property.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.unit.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        estimatedRent: true,
        propertyId: true,
      },
    }),
    prisma.contract.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: {
        monthlyAmount: true,
        unit: { select: { propertyId: true } },
      },
    }),
  ]);

  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  const contractedByProperty = new Map<string, Prisma.Decimal>();
  for (const c of activeContracts) {
    const id = c.unit.propertyId;
    contractedByProperty.set(
      id,
      (contractedByProperty.get(id) ?? ZERO).plus(dec(c.monthlyAmount)),
    );
  }

  const rows: OccupancyByPropertyRow[] = properties.map((p) => ({
    propertyId: p.id,
    propertyName: p.name,
    type: p.type,
    totalUnits: 0,
    rentedUnits: 0,
    availableUnits: 0,
    otherUnits: 0,
    occupancyRate: 0,
    contractedMonthlyIncome: (contractedByProperty.get(p.id) ?? ZERO).toString(),
    potentialLostIncome: "0",
  }));
  const rowMap = new Map(rows.map((r) => [r.propertyId, r]));

  const vacantUnits: VacantUnitRow[] = [];
  let lostTotal = ZERO;

  for (const u of units) {
    const row = rowMap.get(u.propertyId);
    if (!row) continue;
    row.totalUnits += 1;
    if (u.status === "RENTADA") {
      row.rentedUnits += 1;
    } else if (u.status === "DISPONIBLE") {
      row.availableUnits += 1;
      const lost = dec(u.estimatedRent);
      row.potentialLostIncome = dec(row.potentialLostIncome).plus(lost).toString();
      lostTotal = lostTotal.plus(lost);
      const prop = propertyMap.get(u.propertyId);
      vacantUnits.push({
        unitId: u.id,
        unitCode: u.code,
        unitName: u.name,
        propertyId: u.propertyId,
        propertyName: prop?.name ?? "—",
        estimatedRent: u.estimatedRent ? u.estimatedRent.toString() : null,
        status: u.status,
      });
    } else {
      row.otherUnits += 1;
    }
  }

  for (const row of rows) {
    row.occupancyRate = row.totalUnits === 0 ? 0 : row.rentedUnits / row.totalUnits;
  }

  // Ordenar unidades vacantes por inmueble, luego por código.
  vacantUnits.sort((a, b) => {
    const byProp = a.propertyName.localeCompare(b.propertyName, "es");
    if (byProp !== 0) return byProp;
    return a.unitCode.localeCompare(b.unitCode, "es", { numeric: true });
  });

  const totalUnits = rows.reduce((acc, r) => acc + r.totalUnits, 0);
  const rentedUnits = rows.reduce((acc, r) => acc + r.rentedUnits, 0);
  const availableUnits = rows.reduce((acc, r) => acc + r.availableUnits, 0);
  const contracted = rows.reduce(
    (acc, r) => acc.plus(dec(r.contractedMonthlyIncome)),
    ZERO,
  );

  return {
    rows,
    vacantUnits,
    totals: {
      totalUnits,
      rentedUnits,
      availableUnits,
      occupancyRate: totalUnits === 0 ? 0 : rentedUnits / totalUnits,
      contractedMonthlyIncome: contracted.toString(),
      potentialLostIncome: lostTotal.toString(),
    },
  };
}

// ============================================================================
// Ingresos por inmueble — anual mes a mes
// ============================================================================

async function buildIncomeByPropertyReport(
  tenantId: string,
  year: number,
): Promise<IncomeByPropertyReport> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [properties, payments] = await Promise.all([
    prisma.property.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.payment.findMany({
      where: {
        tenantId,
        paymentDate: { gte: yearStart, lt: yearEnd },
      },
      select: {
        amount: true,
        paymentDate: true,
        rent: {
          select: {
            contract: {
              select: { unit: { select: { propertyId: true } } },
            },
          },
        },
      },
    }),
  ]);

  const rows: IncomeByPropertyRow[] = properties.map((p) => ({
    propertyId: p.id,
    propertyName: p.name,
    type: p.type,
    monthly: Array.from({ length: 12 }, () => "0"),
    total: "0",
  }));
  const rowMap = new Map(rows.map((r) => [r.propertyId, r]));

  const monthlyTotals = Array.from({ length: 12 }, () => ZERO);
  let grand = ZERO;

  for (const p of payments) {
    const propertyId = p.rent?.contract?.unit?.propertyId;
    if (!propertyId) continue;
    const row = rowMap.get(propertyId);
    if (!row) continue;
    const idx = p.paymentDate.getUTCMonth();
    const amount = dec(p.amount);
    row.monthly[idx] = dec(row.monthly[idx]).plus(amount).toString();
    row.total = dec(row.total).plus(amount).toString();
    monthlyTotals[idx] = (monthlyTotals[idx] ?? ZERO).plus(amount);
    grand = grand.plus(amount);
  }

  rows.sort((a, b) => Number(b.total) - Number(a.total));

  return {
    year,
    rows,
    monthlyTotals: monthlyTotals.map((d) => d.toString()),
    grandTotal: grand.toString(),
  };
}

// ============================================================================
// Egresos por categoría — anual con split por LegalEntity
// ============================================================================

async function buildExpensesByCategoryReport(
  tenantId: string,
  year: number,
): Promise<ExpensesByCategoryReport> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [legalEntities, operatingExpenseRows] = await Promise.all([
    prisma.legalEntity.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    }),
    // Consolidado (Expense + Payroll + CadastralPayment + Loan-VEHICLE) —
    // misma fuente que Cierres Anuales, no solo la tabla Expense.
    getOperatingExpenseRows(tenantId, yearStart, yearEnd),
  ]);

  const leCodeById = new Map(legalEntities.map((le) => [le.id, le.code]));
  const legalEntityCodes = legalEntities.map((le) => le.code);

  type Bucket = {
    categoryName: string;
    categoryCode: string;
    total: Prisma.Decimal;
    byLegalEntity: Map<string, Prisma.Decimal>;
  };

  const byCategory = new Map<string, Bucket>();
  const totalsByLE = new Map<string, Prisma.Decimal>();
  let grand = ZERO;

  for (const e of operatingExpenseRows) {
    const code = e.categoryKey;
    let bucket = byCategory.get(code);
    if (!bucket) {
      bucket = {
        categoryName: e.categoryLabel,
        categoryCode: code,
        total: ZERO,
        byLegalEntity: new Map(),
      };
      byCategory.set(code, bucket);
    }
    const amount = e.amount;
    bucket.total = bucket.total.plus(amount);

    const leCode = leCodeById.get(e.legalEntityId) ?? "—";
    bucket.byLegalEntity.set(
      leCode,
      (bucket.byLegalEntity.get(leCode) ?? ZERO).plus(amount),
    );
    totalsByLE.set(leCode, (totalsByLE.get(leCode) ?? ZERO).plus(amount));
    grand = grand.plus(amount);
  }

  // Fracción del gasto total; 0 si no hubo egresos (evita división por cero).
  const grandNum = Number(grand);
  const share = (v: Prisma.Decimal) =>
    grandNum > 0 ? Number(v) / grandNum : 0;

  const rows: ExpensesByCategoryRow[] = Array.from(byCategory.values())
    .sort((a, b) => Number(b.total.minus(a.total)))
    .map((b) => {
      const byLE: Record<string, string> = {};
      for (const code of legalEntityCodes) {
        byLE[code] = (b.byLegalEntity.get(code) ?? ZERO).toString();
      }
      return {
        categoryName: b.categoryName,
        categoryCode: b.categoryCode,
        total: b.total.toString(),
        pct: share(b.total),
        byLegalEntity: byLE,
      };
    });

  const totalsByLEOut: Record<string, string> = {};
  const pctByLEOut: Record<string, number> = {};
  for (const code of legalEntityCodes) {
    const leTotal = totalsByLE.get(code) ?? ZERO;
    totalsByLEOut[code] = leTotal.toString();
    pctByLEOut[code] = share(leTotal);
  }

  return {
    year,
    legalEntityCodes,
    rows,
    totals: {
      total: grand.toString(),
      byLegalEntity: totalsByLEOut,
      pctByLegalEntity: pctByLEOut,
    },
  };
}

// ============================================================================
// Contratos — distribución por estado y tipo + por vencer / vencidos
// ============================================================================

async function buildContractsReport(
  tenantId: string,
  now: Date,
): Promise<ContractsReport> {
  const expiringEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const [contracts, expiringRaw, expiredRaw] = await Promise.all([
    prisma.contract.findMany({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        type: true,
        monthlyAmount: true,
      },
    }),
    prisma.contract.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        endDate: { gte: now, lte: expiringEnd },
      },
      orderBy: { endDate: "asc" },
      take: 50,
      select: {
        id: true,
        endDate: true,
        monthlyAmount: true,
        lessee: { select: { id: true, legalName: true } },
        unit: {
          select: {
            code: true,
            property: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: ["EXPIRED", "PENDING_RENEWAL"] },
        endDate: { lt: now },
      },
      orderBy: { endDate: "desc" },
      take: 50,
      select: {
        id: true,
        endDate: true,
        monthlyAmount: true,
        lessee: { select: { id: true, legalName: true } },
        unit: {
          select: {
            code: true,
            property: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const statusBuckets = new Map<
    ContractStatus,
    { count: number; monthly: Prisma.Decimal }
  >();
  const typeBuckets = new Map<ContractType, number>();

  for (const c of contracts) {
    const sb = statusBuckets.get(c.status) ?? { count: 0, monthly: ZERO };
    sb.count += 1;
    sb.monthly = sb.monthly.plus(dec(c.monthlyAmount));
    statusBuckets.set(c.status, sb);

    typeBuckets.set(c.type, (typeBuckets.get(c.type) ?? 0) + 1);
  }

  const byStatus: ContractStatusRow[] = Array.from(statusBuckets.entries())
    .map(([status, v]) => ({
      status,
      count: v.count,
      monthlyAmount: v.monthly.toString(),
    }))
    .sort((a, b) => b.count - a.count);

  const byType: ContractTypeRow[] = Array.from(typeBuckets.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const mapExpiring = (rows: typeof expiringRaw): ExpiringContractRow[] =>
    rows.map((c) => ({
      id: c.id,
      endDate: c.endDate,
      daysUntilEnd: Math.round(
        (c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      ),
      monthlyAmount: c.monthlyAmount.toString(),
      lesseeId: c.lessee.id,
      lesseeLegalName: c.lessee.legalName,
      unitCode: c.unit.code,
      propertyId: c.unit.property.id,
      propertyName: c.unit.property.name,
    }));

  return {
    totalContracts: contracts.length,
    byStatus,
    byType,
    expiringNext60Days: mapExpiring(expiringRaw),
    expiredNotRenewed: mapExpiring(expiredRaw),
  };
}

// ============================================================================
// Bundle público
// ============================================================================

export async function getReportsBundle(
  tenantId: string,
  year?: number,
): Promise<ReportsBundle> {
  const now = new Date();
  const targetYear = year ?? now.getUTCFullYear();

  const [aging, occupancy, incomeByProperty, expensesByCategory, contracts] =
    await Promise.all([
      buildAgingReport(tenantId, now),
      buildOccupancyReport(tenantId),
      buildIncomeByPropertyReport(tenantId, targetYear),
      buildExpensesByCategoryReport(tenantId, targetYear),
      buildContractsReport(tenantId, now),
    ]);

  return {
    year: targetYear,
    aging,
    occupancy,
    incomeByProperty,
    expensesByCategory,
    contracts,
  };
}
