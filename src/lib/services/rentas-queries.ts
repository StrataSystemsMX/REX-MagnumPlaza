import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { serializeDecimals } from "@/lib/utils/serialize-decimals";
import {
  getActiveLegalEntityId,
  legalEntityPropertyFilter,
} from "@/lib/auth/active-legal-entity";

// ─── Types for the operational table view ────────────────────────────────────

export interface RentTableRow {
  contractId: string;
  unitId: string;
  unitCode: string;
  unitName: string | null;
  propertyId: string;
  propertyName: string;
  legalEntityCode: string;
  legalEntityName: string;
  lesseeId: string;
  lesseeName: string;
  monthlyAmount: number;
  contractEndDate: string;
  rentId: string | null;
  amountDue: number;
  amountPaid: number;
  amountPending: number;
  status: string;
  accumulatedDebt: number;
}

export interface RentasTableData {
  period: string;
  rows: RentTableRow[];
  kpis: {
    expected: number;
    collected: number;
    pending: number;
    pct: number;
    paidCount: number;
    partialCount: number;
    pendingCount: number;
    overdueCount: number;
    notGeneratedCount: number;
  };
  properties: Array<{ id: string; name: string }>;
  legalEntities: Array<{ code: string; name: string }>;
  alerts: Array<{ type: string; message: string; count: number; severity: "warning" | "error" | "info" }>;
}

export interface ContractHistoryEntry {
  rentId: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  notes: string | null;
  payments: Array<{
    id: string;
    amount: number;
    paymentDate: string;
    method: string;
    reference: string | null;
    notes: string | null;
  }>;
}

const STATUS_ORDER: Record<string, number> = {
  OVERDUE_3M: 0,
  OVERDUE_2M: 1,
  OVERDUE_1M: 2,
  DUE: 3,
  PARTIAL: 4,
  PENDING: 5,
  NOT_GENERATED: 6,
  PAID: 7,
  WAIVED: 8,
};

export async function getRentasTableData(period: Date): Promise<RentasTableData> {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();
  const propertyFilter = legalEntityPropertyFilter(activeLegalEntityId);

  const periodStart = periodStartUTC(period);

  const [contracts, debtByContract] = await Promise.all([
    prisma.contract.findMany({
      where: { tenantId, status: "ACTIVE", unit: { property: propertyFilter } },
      select: {
        id: true,
        monthlyAmount: true,
        endDate: true,
        lessee: { select: { id: true, legalName: true, contactName: true } },
        unit: {
          select: {
            id: true,
            code: true,
            name: true,
            property: {
              select: {
                id: true,
                name: true,
                managerEntity: { select: { code: true, legalName: true } },
              },
            },
          },
        },
        rents: {
          where: { period: periodStart },
          select: { id: true, amountDue: true, amountPaid: true, status: true },
          take: 1,
        },
      },
      orderBy: [{ unit: { property: { name: "asc" } } }, { unit: { code: "asc" } }],
    }),
    prisma.rent.groupBy({
      by: ["contractId"],
      where: {
        tenantId,
        period: { lt: periodStart },
        status: { notIn: ["PAID", "WAIVED"] },
        contract: { unit: { property: propertyFilter } },
      },
      _sum: { amountDue: true, amountPaid: true },
    }),
  ]);

  const debtMap = new Map(
    debtByContract.map((d) => [
      d.contractId,
      Math.max(0, Number(d._sum.amountDue ?? 0) - Number(d._sum.amountPaid ?? 0)),
    ]),
  );

  const now = new Date();
  const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const rows: RentTableRow[] = contracts.map((c) => {
    const rent = c.rents[0] ?? null;
    const amountDue = rent ? Number(rent.amountDue) : Number(c.monthlyAmount);
    const amountPaid = rent ? Number(rent.amountPaid) : 0;
    const status = rent ? rent.status : "NOT_GENERATED";

    return {
      contractId: c.id,
      unitId: c.unit.id,
      unitCode: c.unit.code,
      unitName: c.unit.name ?? null,
      propertyId: c.unit.property.id,
      propertyName: c.unit.property.name,
      legalEntityCode: c.unit.property.managerEntity.code,
      legalEntityName: c.unit.property.managerEntity.legalName,
      lesseeId: c.lessee.id,
      lesseeName: c.lessee.contactName ?? c.lessee.legalName,
      monthlyAmount: Number(c.monthlyAmount),
      contractEndDate: c.endDate.toISOString(),
      rentId: rent?.id ?? null,
      amountDue,
      amountPaid,
      amountPending: Math.max(0, amountDue - amountPaid),
      status,
      accumulatedDebt: debtMap.get(c.id) ?? 0,
    };
  });

  rows.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const generatedRows = rows.filter((r) => r.status !== "NOT_GENERATED");
  const expected = generatedRows.reduce((s, r) => s + r.amountDue, 0);
  const collected = generatedRows.reduce((s, r) => s + r.amountPaid, 0);
  const pct = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  const overdueRows = rows.filter((r) =>
    ["OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"].includes(r.status),
  );
  const notGeneratedRows = rows.filter((r) => r.status === "NOT_GENERATED");
  const expiringRows = rows.filter((r) => {
    const end = new Date(r.contractEndDate);
    return end >= now && end <= sixtyDaysFromNow;
  });

  const alerts: RentasTableData["alerts"] = [];
  if (overdueRows.length > 0) {
    alerts.push({
      type: "overdue",
      message: `${overdueRows.length} local${overdueRows.length > 1 ? "es" : ""} con renta vencida`,
      count: overdueRows.length,
      severity: overdueRows.some((r) => r.status === "OVERDUE_3M") ? "error" : "warning",
    });
  }
  if (notGeneratedRows.length > 0) {
    alerts.push({
      type: "missing",
      message: `${notGeneratedRows.length} renta${notGeneratedRows.length > 1 ? "s" : ""} sin generar para este período`,
      count: notGeneratedRows.length,
      severity: "warning",
    });
  }
  if (expiringRows.length > 0) {
    alerts.push({
      type: "expiring",
      message: `${expiringRows.length} contrato${expiringRows.length > 1 ? "s" : ""} por vencer en los próximos 60 días`,
      count: expiringRows.length,
      severity: "info",
    });
  }

  const propertiesMap = new Map<string, string>();
  const legalEntitiesMap = new Map<string, string>();
  rows.forEach((r) => {
    propertiesMap.set(r.propertyId, r.propertyName);
    legalEntitiesMap.set(r.legalEntityCode, r.legalEntityName);
  });

  return serializeDecimals({
    period: periodStart.toISOString(),
    rows,
    kpis: {
      expected,
      collected,
      pending: Math.max(0, expected - collected),
      pct,
      paidCount: rows.filter((r) => r.status === "PAID").length,
      partialCount: rows.filter((r) => r.status === "PARTIAL").length,
      pendingCount: rows.filter((r) => ["PENDING", "DUE"].includes(r.status)).length,
      overdueCount: overdueRows.length,
      notGeneratedCount: notGeneratedRows.length,
    },
    properties: [...propertiesMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    legalEntities: [...legalEntitiesMap.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    alerts,
  }) as RentasTableData;
}

export async function getRentHistoryForContract(contractId: string): Promise<ContractHistoryEntry[]> {
  const { tenantId } = await requireAuth();

  const rents = await prisma.rent.findMany({
    where: { tenantId, contractId },
    orderBy: { period: "desc" },
    take: 24,
    select: {
      id: true,
      period: true,
      amountDue: true,
      amountPaid: true,
      status: true,
      notes: true,
      payments: {
        orderBy: { paymentDate: "desc" },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          method: true,
          reference: true,
          notes: true,
        },
      },
    },
  });

  return serializeDecimals(
    rents.map((r) => ({
      rentId: r.id,
      period: r.period.toISOString(),
      amountDue: Number(r.amountDue),
      amountPaid: Number(r.amountPaid),
      status: r.status,
      notes: r.notes,
      payments: r.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        paymentDate: p.paymentDate.toISOString(),
        method: p.method,
        reference: p.reference ?? null,
        notes: p.notes ?? null,
      })),
    })),
  ) as ContractHistoryEntry[];
}

function periodStartUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export interface PeriodSummary {
  period: Date;
  amountDue: number;
  amountPaid: number;
  rentsTotal: number;
  rentsPaid: number;
  rentsPartial: number;
  rentsPending: number;
  rentsOverdue: number;
  rentsWaived: number;
}

export interface RentasOverview {
  /** Periodo del mes actual (primer día del mes UTC). */
  currentPeriod: Date;
  /** KPI: contratos ACTIVE del tenant + suma de su monthlyAmount esperado. */
  activeContracts: { count: number; expectedMonthly: number };
  /** Resumen del periodo actual. */
  current: PeriodSummary;
  /** Contratos activos cuya renta del periodo actual no fue generada. */
  missingRentsCount: number;
  missingRentsContracts: Array<{
    contractId: string;
    propertyName: string;
    unitCode: string;
    lesseeName: string;
    monthlyAmount: number;
  }>;
  /** Proyección: próximos 6 meses (sin contar el actual). */
  projection: Array<{
    period: Date;
    activeContracts: number;
    expectedAmount: number;
  }>;
  /** Histórico: últimos 6 meses (incluye el actual). */
  history: PeriodSummary[];
  /** Rentas con notas/condonadas (anomalías) — últimos 12 meses. */
  anomalies: {
    waivedCount: number;
    waivedAmount: number;
    withNotesCount: number;
  };
}

export async function getRentasOverview(): Promise<RentasOverview> {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const now = new Date();
  const currentPeriod = periodStartUTC(now);

  // Active contracts (filtrados por LegalEntity activa via property.managerEntity)
  const propertyFilter = legalEntityPropertyFilter(activeLegalEntityId);

  const activeContracts = await prisma.contract.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      unit: { property: propertyFilter },
    },
    select: {
      id: true,
      monthlyAmount: true,
      startDate: true,
      endDate: true,
      lessee: { select: { legalName: true, contactName: true } },
      unit: {
        select: {
          code: true,
          property: { select: { id: true, name: true } },
        },
      },
    },
  });

  const expectedMonthly = activeContracts.reduce(
    (sum, c) => sum + Number(c.monthlyAmount),
    0,
  );

  // Periodo actual: rents existentes
  const currentRents = await prisma.rent.findMany({
    where: {
      tenantId,
      period: currentPeriod,
      contract: { unit: { property: propertyFilter } },
    },
    select: {
      contractId: true,
      amountDue: true,
      amountPaid: true,
      status: true,
    },
  });

  const current = summarizePeriod(currentPeriod, currentRents);

  // Anomalías: contratos activos vigentes en el periodo actual sin renta generada
  const contractsActiveThisPeriod = activeContracts.filter((c) => {
    const start = periodStartUTC(c.startDate);
    const end = periodStartUTC(c.endDate);
    return start <= currentPeriod && currentPeriod <= end;
  });
  const rentContractIds = new Set(currentRents.map((r) => r.contractId));
  const missing = contractsActiveThisPeriod.filter(
    (c) => !rentContractIds.has(c.id),
  );

  // Proyección: próximos 6 meses
  const projection: RentasOverview["projection"] = [];
  for (let i = 1; i <= 6; i++) {
    const p = addMonths(currentPeriod, i);
    const active = activeContracts.filter((c) => {
      const start = periodStartUTC(c.startDate);
      const end = periodStartUTC(c.endDate);
      return start <= p && p <= end;
    });
    const expectedAmount = active.reduce(
      (sum, c) => sum + Number(c.monthlyAmount),
      0,
    );
    projection.push({
      period: p,
      activeContracts: active.length,
      expectedAmount,
    });
  }

  // Histórico: últimos 6 meses (incluye el actual)
  const historyStart = addMonths(currentPeriod, -5);
  const historyRents = await prisma.rent.findMany({
    where: {
      tenantId,
      period: { gte: historyStart, lte: currentPeriod },
      contract: { unit: { property: propertyFilter } },
    },
    select: {
      period: true,
      amountDue: true,
      amountPaid: true,
      status: true,
    },
  });

  const history: PeriodSummary[] = [];
  for (let i = 5; i >= 0; i--) {
    const p = addMonths(currentPeriod, -i);
    const rentsOfPeriod = historyRents.filter(
      (r) => r.period.getTime() === p.getTime(),
    );
    history.push(summarizePeriod(p, rentsOfPeriod));
  }

  // Anomalías últimos 12 meses
  const yearStart = addMonths(currentPeriod, -11);
  const [waived, withNotes] = await Promise.all([
    prisma.rent.findMany({
      where: {
        tenantId,
        status: "WAIVED",
        period: { gte: yearStart },
        contract: { unit: { property: propertyFilter } },
      },
      select: { amountDue: true },
    }),
    prisma.rent.count({
      where: {
        tenantId,
        notes: { not: null },
        period: { gte: yearStart },
        contract: { unit: { property: propertyFilter } },
      },
    }),
  ]);

  const result: RentasOverview = {
    currentPeriod,
    activeContracts: { count: activeContracts.length, expectedMonthly },
    current,
    missingRentsCount: missing.length,
    missingRentsContracts: missing.map((c) => ({
      contractId: c.id,
      propertyName: c.unit.property.name,
      unitCode: c.unit.code,
      lesseeName: c.lessee.contactName ?? c.lessee.legalName,
      monthlyAmount: Number(c.monthlyAmount),
    })),
    projection,
    history,
    anomalies: {
      waivedCount: waived.length,
      waivedAmount: waived.reduce((s, r) => s + Number(r.amountDue), 0),
      withNotesCount: withNotes,
    },
  };

  return serializeDecimals(result) as RentasOverview;
}

function summarizePeriod(
  period: Date,
  rents: ReadonlyArray<{
    amountDue: { toString(): string } | number;
    amountPaid: { toString(): string } | number;
    status: string;
  }>,
): PeriodSummary {
  let amountDue = 0;
  let amountPaid = 0;
  let rentsPaid = 0;
  let rentsPartial = 0;
  let rentsPending = 0;
  let rentsOverdue = 0;
  let rentsWaived = 0;

  for (const r of rents) {
    amountDue += Number(r.amountDue);
    amountPaid += Number(r.amountPaid);
    switch (r.status) {
      case "PAID":
        rentsPaid += 1;
        break;
      case "PARTIAL":
        rentsPartial += 1;
        break;
      case "PENDING":
      case "DUE":
        rentsPending += 1;
        break;
      case "OVERDUE_1M":
      case "OVERDUE_2M":
      case "OVERDUE_3M":
        rentsOverdue += 1;
        break;
      case "WAIVED":
        rentsWaived += 1;
        break;
    }
  }

  return {
    period,
    amountDue,
    amountPaid,
    rentsTotal: rents.length,
    rentsPaid,
    rentsPartial,
    rentsPending,
    rentsOverdue,
    rentsWaived,
  };
}
