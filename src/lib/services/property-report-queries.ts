import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";

const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | string | null | undefined) =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

export interface UnitReportRow {
  unitId: string;
  unitName: string; // falls back to code if name is null
  unitCode: string;
  status: string;
  contractId: string | null;
  lesseeName: string | null;
  monthlyAmount: string | null;
  contractEndDate: Date | null;
  ytdIncome: string;
  arBalance: string;
}

export interface CadastralPaymentRow {
  id: string;
  year: number;
  totalAmount: string | null;
  paidAmount: string | null;
  dueDate: Date;
  paymentDate: Date | null;
  isPaid: boolean;
  /** Razón social (código) o tercero que paga; null si lo paga el dueño. */
  payerLabel: string | null;
}

export interface MaintenanceRow {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledDate: Date | null;
  completedDate: Date | null;
  cost: string | null;
  vendor: string | null;
  unitCode: string | null;
}

export interface PropertyReport {
  propertyId: string;
  propertyName: string;
  propertyType: string;
  ownerCode: string | null;
  managerCode: string | null;
  year: number;
  monthlyIncome: string[];
  totalIncome: string;
  totalUnits: number;
  occupiedUnits: number;
  units: UnitReportRow[];
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiresAt: Date | null;
  cadastralPayments: CadastralPaymentRow[];
  maintenances: MaintenanceRow[];
  /** Suma del costo de los mantenimientos del año (gasto realizado/planeado). */
  maintenanceYearCost: string;
}

export async function getPropertyReport(
  tenantId: string,
  propertyId: string,
  year?: number,
): Promise<PropertyReport | null> {
  const targetYear = year ?? new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(targetYear, 0, 1));
  const yearEnd = new Date(Date.UTC(targetYear + 1, 0, 1));
  const now = new Date();

  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId, isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      insuranceProvider: true,
      insurancePolicyNumber: true,
      insuranceExpiresAt: true,
      ownerEntity: { select: { code: true } },
      managerEntity: { select: { code: true } },
    },
  });
  if (!property) return null;

  const units = await prisma.unit.findMany({
    where: { tenantId, propertyId, isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      contracts: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          monthlyAmount: true,
          endDate: true,
          lessee: { select: { legalName: true } },
        },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  });

  const unitIds = units.map((u) => u.id);

  // Payments this year for units of this property
  const payments = await prisma.payment.findMany({
    where: {
      tenantId,
      paymentDate: { gte: yearStart, lt: yearEnd },
      rent: { contract: { unitId: { in: unitIds } } },
    },
    select: {
      amount: true,
      paymentDate: true,
      rent: { select: { contract: { select: { unitId: true } } } },
    },
  });

  // Overdue rents per unit
  const overdueRents = await prisma.rent.findMany({
    where: {
      tenantId,
      status: { notIn: ["PAID", "WAIVED"] },
      dueDate: { lt: now },
      contract: { unitId: { in: unitIds } },
    },
    select: {
      amountDue: true,
      amountPaid: true,
      contract: { select: { unitId: true } },
    },
  });

  // Predial (prediales del inmueble) y mantenimientos del año — vista consolidada.
  // El where del año se comparte entre la lista (con take) y el agregado del
  // total, para que el "Gasto del año" sume TODOS los mantenimientos del año y
  // no solo los que caben en el take de la tabla.
  const maintenanceYearWhere: Prisma.MaintenanceWhereInput = {
    tenantId,
    propertyId,
    OR: [
      { completedDate: { gte: yearStart, lt: yearEnd } },
      { scheduledDate: { gte: yearStart, lt: yearEnd } },
    ],
  };
  const [cadastralRaw, maintenanceRaw, maintenanceCostAgg] = await Promise.all([
    prisma.cadastralPayment.findMany({
      where: { tenantId, propertyId },
      select: {
        id: true,
        year: true,
        totalAmount: true,
        paidAmount: true,
        dueDate: true,
        paymentDate: true,
        isPaid: true,
        payerEntity: { select: { code: true } },
        paidByThirdPartyName: true,
      },
      orderBy: { year: "desc" },
      take: 6,
    }),
    prisma.maintenance.findMany({
      where: maintenanceYearWhere,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        scheduledDate: true,
        completedDate: true,
        cost: true,
        vendor: true,
        unit: { select: { code: true } },
      },
      orderBy: [{ completedDate: "desc" }, { scheduledDate: "desc" }],
      take: 50,
    }),
    prisma.maintenance.aggregate({
      where: maintenanceYearWhere,
      _sum: { cost: true },
    }),
  ]);

  const cadastralPayments: CadastralPaymentRow[] = cadastralRaw.map((c) => ({
    id: c.id,
    year: c.year,
    totalAmount: c.totalAmount?.toString() ?? null,
    paidAmount: c.paidAmount?.toString() ?? null,
    dueDate: c.dueDate,
    paymentDate: c.paymentDate,
    isPaid: c.isPaid,
    payerLabel: c.payerEntity?.code ?? c.paidByThirdPartyName ?? null,
  }));

  const maintenances: MaintenanceRow[] = maintenanceRaw.map((m) => ({
    id: m.id,
    title: m.title,
    type: m.type,
    status: m.status,
    scheduledDate: m.scheduledDate,
    completedDate: m.completedDate,
    cost: m.cost?.toString() ?? null,
    vendor: m.vendor,
    unitCode: m.unit?.code ?? null,
  }));

  // Total sobre TODO el año (agregado en DB), independiente del take de la lista.
  const maintenanceYearCost = dec(maintenanceCostAgg._sum.cost).toString();

  // Monthly income for the whole property
  const monthlyIncome = Array.from({ length: 12 }, () => ZERO);
  const incomeByUnit = new Map<string, Prisma.Decimal>();
  for (const p of payments) {
    const idx = p.paymentDate.getUTCMonth();
    monthlyIncome[idx] = (monthlyIncome[idx] ?? ZERO).plus(dec(p.amount));
    const uid = p.rent.contract.unitId;
    incomeByUnit.set(uid, (incomeByUnit.get(uid) ?? ZERO).plus(dec(p.amount)));
  }

  // AR balance by unit
  const arByUnit = new Map<string, Prisma.Decimal>();
  for (const r of overdueRents) {
    const uid = r.contract.unitId;
    const balance = dec(r.amountDue).minus(dec(r.amountPaid));
    arByUnit.set(uid, (arByUnit.get(uid) ?? ZERO).plus(balance));
  }

  const totalIncome = monthlyIncome.reduce((a, b) => a.plus(b), ZERO);
  let occupiedUnits = 0;

  const unitRows: UnitReportRow[] = units.map((u) => {
    const activeContract = u.contracts[0] ?? null;
    if (activeContract) occupiedUnits++;
    return {
      unitId: u.id,
      unitName: u.name ?? u.code,
      unitCode: u.code,
      status: u.status,
      contractId: activeContract?.id ?? null,
      lesseeName: activeContract?.lessee.legalName ?? null,
      monthlyAmount: activeContract ? activeContract.monthlyAmount.toString() : null,
      contractEndDate: activeContract?.endDate ?? null,
      ytdIncome: (incomeByUnit.get(u.id) ?? ZERO).toString(),
      arBalance: (arByUnit.get(u.id) ?? ZERO).toString(),
    };
  });

  return {
    propertyId: property.id,
    propertyName: property.name,
    propertyType: property.type,
    ownerCode: property.ownerEntity?.code ?? null,
    managerCode: property.managerEntity?.code ?? null,
    year: targetYear,
    monthlyIncome: monthlyIncome.map((d) => d.toString()),
    totalIncome: totalIncome.toString(),
    totalUnits: units.length,
    occupiedUnits,
    units: unitRows,
    insuranceProvider: property.insuranceProvider,
    insurancePolicyNumber: property.insurancePolicyNumber,
    insuranceExpiresAt: property.insuranceExpiresAt,
    cadastralPayments,
    maintenances,
    maintenanceYearCost,
  };
}
