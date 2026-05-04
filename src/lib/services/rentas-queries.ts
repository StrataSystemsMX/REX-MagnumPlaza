import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { serializeDecimals } from "@/lib/utils/serialize-decimals";
import {
  getActiveLegalEntityId,
  legalEntityPropertyFilter,
} from "@/lib/auth/active-legal-entity";

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
