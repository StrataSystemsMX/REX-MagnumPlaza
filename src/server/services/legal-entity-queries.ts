import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/prisma/client";
import { getOperatingExpenseRows } from "@/server/services/consolidated-expenses";

const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | string | null | undefined) =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

export interface ArRow {
  rentId: string;
  period: Date;
  dueDate: Date;
  amountDue: string;
  amountPaid: string;
  balance: string;
  lesseeName: string;
  unitName: string;
  propertyName: string;
}

export interface ExpiringContract {
  contractId: string;
  endDate: Date;
  monthlyAmount: string;
  lesseeName: string;
  unitName: string;
  propertyName: string;
}

export interface IncomeByPropertyRow {
  propertyId: string;
  propertyName: string;
  amount: string;
}

export interface PropertyRow {
  id: string;
  name: string;
  type: string;
  isOwner: boolean;
  isManager: boolean;
  totalUnits: number;
  occupiedUnits: number;
}

export interface LegalEntityYearMetrics {
  id: string;
  code: string;
  legalName: string;
  rfc: string | null;
  address: string | null;
  year: number;
  monthlyIncome: string[];
  monthlyExpenses: string[];
  monthlyProfit: string[];
  totalIncome: string;
  totalExpenses: string;
  totalProfit: string;
  expectedMonthlyRent: string;
  totalUnits: number;
  occupiedUnits: number;
  arBalance: string;
  expensesByCategory: Array<{ categoryName: string; amount: string }>;
  incomeByProperty: IncomeByPropertyRow[];
  properties: PropertyRow[];
  arRows: ArRow[];
  expiringContracts: ExpiringContract[];
  recentExpenses: Array<{
    id: string;
    expenseDate: Date;
    description: string;
    vendor: string | null;
    amount: string;
    category: string;
  }>;
}

export async function getLegalEntityMetrics(
  tenantId: string,
  legalEntityId: string,
  year?: number,
): Promise<LegalEntityYearMetrics | null> {
  const targetYear = year ?? new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(targetYear, 0, 1));
  const yearEnd = new Date(Date.UTC(targetYear + 1, 0, 1));
  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const le = await prisma.legalEntity.findFirst({
    where: { id: legalEntityId, tenantId },
    select: { id: true, code: true, legalName: true, rfc: true, address: true },
  });
  if (!le) return null;

  // Properties owned or managed by this entity
  const [ownedPropsRaw, managedPropsRaw] = await Promise.all([
    prisma.property.findMany({
      where: { tenantId, ownerEntityId: legalEntityId, isActive: true },
      select: {
        id: true, name: true, type: true, managerEntityId: true,
        units: { where: { isActive: true }, select: { id: true, contracts: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.property.findMany({
      where: { tenantId, managerEntityId: legalEntityId, isActive: true },
      select: {
        id: true, name: true, type: true, ownerEntityId: true,
        units: { where: { isActive: true }, select: { id: true, contracts: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const ownedIds = new Set(ownedPropsRaw.map((p) => p.id));
  const managedOnlyPropsRaw = managedPropsRaw.filter((p) => !ownedIds.has(p.id));
  const allPropsRaw = [
    ...ownedPropsRaw,
    ...managedOnlyPropsRaw,
  ];
  const propertyIds = allPropsRaw.map((p) => p.id);

  const [paymentsRaw, operatingExpenseRowsAll, recentExpenses, arRents, expiringRaw, expectedRentAgg] =
    await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId,
          rent: { legalEntityId },
          paymentDate: { gte: yearStart, lt: yearEnd },
        },
        select: {
          amount: true,
          paymentDate: true,
          rent: {
            select: {
              contract: {
                select: {
                  unit: { select: { property: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
      }),
      // Egresos operativos consolidados (Expense + Payroll + CadastralPayment +
      // Loan-VEHICLE) de TODO el tenant — se filtra a esta entidad abajo. Misma
      // fuente que usa Cierres Anuales: totalExpenses/totalProfit no pueden
      // salir solo de la tabla Expense o quedan subestimados.
      getOperatingExpenseRows(tenantId, yearStart, yearEnd),
      prisma.expense.findMany({
        where: { tenantId, legalEntityId, expenseDate: { gte: yearStart, lt: yearEnd } },
        orderBy: { expenseDate: "desc" },
        take: 20,
        select: {
          id: true, expenseDate: true, description: true, vendor: true, amount: true,
          category: { select: { name: true } },
        },
      }),
      // Cartera vencida: rents not fully paid and past due
      prisma.rent.findMany({
        where: {
          tenantId,
          legalEntityId,
          status: { notIn: ["PAID", "WAIVED"] },
          dueDate: { lt: now },
        },
        select: {
          id: true,
          period: true,
          dueDate: true,
          amountDue: true,
          amountPaid: true,
          contract: {
            select: {
              lessee: { select: { legalName: true } },
              unit: { select: { name: true, code: true, property: { select: { name: true } } } },
            },
          },
        },
        orderBy: { dueDate: "asc" },
      }),
      // Contratos próximos a vencer (90 días)
      prisma.contract.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
          unit: { propertyId: { in: propertyIds } },
          endDate: { gte: now, lte: in90Days },
        },
        select: {
          id: true,
          endDate: true,
          monthlyAmount: true,
          lessee: { select: { legalName: true } },
          unit: { select: { name: true, code: true, property: { select: { name: true } } } },
        },
        orderBy: { endDate: "asc" },
      }),
      // Renta esperada mensual (suma de contratos activos bajo estas propiedades)
      prisma.contract.aggregate({
        where: {
          tenantId,
          status: "ACTIVE",
          unit: { propertyId: { in: propertyIds } },
        },
        _sum: { monthlyAmount: true },
      }),
    ]);

  const operatingExpenseRows = operatingExpenseRowsAll.filter((r) => r.legalEntityId === legalEntityId);

  // Monthly income/expenses
  const monthlyIncome = Array.from({ length: 12 }, () => ZERO);
  const monthlyExpenses = Array.from({ length: 12 }, () => ZERO);
  for (const p of paymentsRaw) {
    const idx = p.paymentDate.getUTCMonth();
    monthlyIncome[idx] = (monthlyIncome[idx] ?? ZERO).plus(dec(p.amount));
  }
  for (const e of operatingExpenseRows) {
    const idx = e.date.getUTCMonth();
    monthlyExpenses[idx] = (monthlyExpenses[idx] ?? ZERO).plus(e.amount);
  }

  const totalIncome = monthlyIncome.reduce((a, b) => a.plus(b), ZERO);
  const totalExpenses = monthlyExpenses.reduce((a, b) => a.plus(b), ZERO);

  // Expenses by category
  const byCategory = new Map<string, Prisma.Decimal>();
  for (const e of operatingExpenseRows) {
    const k = e.categoryLabel;
    byCategory.set(k, (byCategory.get(k) ?? ZERO).plus(e.amount));
  }
  const expensesByCategory = Array.from(byCategory.entries())
    .map(([categoryName, amount]) => ({ categoryName, amount: amount.toString() }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  // Income by property
  const byProp = new Map<string, { name: string; amount: Prisma.Decimal }>();
  for (const p of paymentsRaw) {
    const prop = p.rent.contract.unit.property;
    const cur = byProp.get(prop.id);
    byProp.set(prop.id, {
      name: prop.name,
      amount: (cur?.amount ?? ZERO).plus(dec(p.amount)),
    });
  }
  const incomeByProperty: IncomeByPropertyRow[] = Array.from(byProp.entries())
    .map(([propertyId, { name, amount }]) => ({ propertyId, propertyName: name, amount: amount.toString() }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  // Occupancy stats
  let totalUnits = 0;
  let occupiedUnits = 0;
  for (const prop of allPropsRaw) {
    for (const unit of prop.units) {
      totalUnits++;
      if (unit.contracts.length > 0) occupiedUnits++;
    }
  }

  // AR (cartera vencida)
  let arBalance = ZERO;
  const arRows: ArRow[] = arRents.map((r) => {
    const balance = dec(r.amountDue).minus(dec(r.amountPaid));
    arBalance = arBalance.plus(balance);
    return {
      rentId: r.id,
      period: r.period,
      dueDate: r.dueDate,
      amountDue: r.amountDue.toString(),
      amountPaid: r.amountPaid.toString(),
      balance: balance.toString(),
      lesseeName: r.contract.lessee.legalName,
      unitName: r.contract.unit.name ?? r.contract.unit.code,
      propertyName: r.contract.unit.property.name,
    };
  });

  // Properties merged
  const properties: PropertyRow[] = allPropsRaw.map((p) => {
    const isOwner = ownedIds.has(p.id);
    const total = p.units.length;
    const occupied = p.units.filter((u) => u.contracts.length > 0).length;
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      isOwner,
      isManager: true,
      totalUnits: total,
      occupiedUnits: occupied,
    };
  });

  return {
    id: le.id,
    code: le.code,
    legalName: le.legalName,
    rfc: le.rfc,
    address: le.address,
    year: targetYear,
    monthlyIncome: monthlyIncome.map((d) => d.toString()),
    monthlyExpenses: monthlyExpenses.map((d) => d.toString()),
    monthlyProfit: monthlyIncome.map((inc, i) => inc.minus(monthlyExpenses[i] ?? ZERO).toString()),
    totalIncome: totalIncome.toString(),
    totalExpenses: totalExpenses.toString(),
    totalProfit: totalIncome.minus(totalExpenses).toString(),
    expectedMonthlyRent: dec(expectedRentAgg._sum.monthlyAmount).toString(),
    totalUnits,
    occupiedUnits,
    arBalance: arBalance.toString(),
    expensesByCategory,
    incomeByProperty,
    properties,
    arRows,
    expiringContracts: expiringRaw.map((c) => ({
      contractId: c.id,
      endDate: c.endDate,
      monthlyAmount: c.monthlyAmount.toString(),
      lesseeName: c.lessee.legalName,
      unitName: c.unit.name ?? c.unit.code,
      propertyName: c.unit.property.name,
    })),
    recentExpenses: recentExpenses.map((e) => ({
      id: e.id,
      expenseDate: e.expenseDate,
      description: e.description,
      vendor: e.vendor,
      amount: e.amount.toString(),
      category: e.category.name,
    })),
  };
}
