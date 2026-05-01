import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";

const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | string | null | undefined) =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

export interface LegalEntityYearMetrics {
  id: string;
  code: string;
  legalName: string;
  rfc: string | null;
  address: string | null;
  year: number;
  /** Ingresos por mes (1-12). */
  monthlyIncome: string[];
  /** Egresos por mes (1-12). */
  monthlyExpenses: string[];
  /** Utilidad por mes (1-12). */
  monthlyProfit: string[];
  totalIncome: string;
  totalExpenses: string;
  totalProfit: string;
  expensesByCategory: Array<{ categoryName: string; amount: string }>;
  ownedProperties: Array<{
    id: string;
    name: string;
    type: string;
    isOwner: true;
    isManager: boolean;
  }>;
  managedProperties: Array<{
    id: string;
    name: string;
    type: string;
    isOwner: boolean;
    isManager: true;
  }>;
  recentExpenses: Array<{
    id: string;
    expenseDate: Date;
    description: string;
    vendor: string | null;
    amount: string;
    category: string;
  }>;
}

/**
 * Métricas anuales de una LegalEntity (CRT/TSR/QHS): ingresos por mes,
 * egresos por mes y por categoría, propiedades asociadas y últimos egresos.
 *
 * Pensado para imitar la hoja "Cierre" del Excel del cliente.
 */
export async function getLegalEntityMetrics(
  tenantId: string,
  legalEntityId: string,
  year?: number,
): Promise<LegalEntityYearMetrics | null> {
  const targetYear = year ?? new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(targetYear, 0, 1));
  const yearEnd = new Date(Date.UTC(targetYear + 1, 0, 1));

  const le = await prisma.legalEntity.findFirst({
    where: { id: legalEntityId, tenantId },
    select: {
      id: true,
      code: true,
      legalName: true,
      rfc: true,
      address: true,
    },
  });
  if (!le) return null;

  const [paymentsRaw, expensesRaw, ownedProps, managedProps, recentExpenses] =
    await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId,
          rent: { legalEntityId },
          paymentDate: { gte: yearStart, lt: yearEnd },
        },
        select: { amount: true, paymentDate: true },
      }),
      prisma.expense.findMany({
        where: {
          tenantId,
          legalEntityId,
          expenseDate: { gte: yearStart, lt: yearEnd },
        },
        select: {
          amount: true,
          expenseDate: true,
          category: { select: { name: true } },
        },
      }),
      prisma.property.findMany({
        where: { tenantId, ownerEntityId: legalEntityId, isActive: true },
        select: { id: true, name: true, type: true, managerEntityId: true },
        orderBy: { name: "asc" },
      }),
      prisma.property.findMany({
        where: { tenantId, managerEntityId: legalEntityId, isActive: true },
        select: { id: true, name: true, type: true, ownerEntityId: true },
        orderBy: { name: "asc" },
      }),
      prisma.expense.findMany({
        where: {
          tenantId,
          legalEntityId,
          expenseDate: { gte: yearStart, lt: yearEnd },
        },
        orderBy: { expenseDate: "desc" },
        take: 20,
        select: {
          id: true,
          expenseDate: true,
          description: true,
          vendor: true,
          amount: true,
          category: { select: { name: true } },
        },
      }),
    ]);

  const monthlyIncome = Array.from({ length: 12 }, () => ZERO);
  const monthlyExpenses = Array.from({ length: 12 }, () => ZERO);

  for (const p of paymentsRaw) {
    const idx = p.paymentDate.getUTCMonth();
    monthlyIncome[idx] = (monthlyIncome[idx] ?? ZERO).plus(dec(p.amount));
  }
  for (const e of expensesRaw) {
    const idx = e.expenseDate.getUTCMonth();
    monthlyExpenses[idx] = (monthlyExpenses[idx] ?? ZERO).plus(dec(e.amount));
  }

  const totalIncome = monthlyIncome.reduce((a, b) => a.plus(b), ZERO);
  const totalExpenses = monthlyExpenses.reduce((a, b) => a.plus(b), ZERO);

  const byCategory = new Map<string, Prisma.Decimal>();
  for (const e of expensesRaw) {
    const k = e.category.name;
    byCategory.set(k, (byCategory.get(k) ?? ZERO).plus(dec(e.amount)));
  }
  const expensesByCategory = Array.from(byCategory.entries())
    .map(([categoryName, amount]) => ({ categoryName, amount: amount.toString() }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  return {
    id: le.id,
    code: le.code,
    legalName: le.legalName,
    rfc: le.rfc,
    address: le.address,
    year: targetYear,
    monthlyIncome: monthlyIncome.map((d) => d.toString()),
    monthlyExpenses: monthlyExpenses.map((d) => d.toString()),
    monthlyProfit: monthlyIncome.map((inc, i) =>
      inc.minus(monthlyExpenses[i] ?? ZERO).toString(),
    ),
    totalIncome: totalIncome.toString(),
    totalExpenses: totalExpenses.toString(),
    totalProfit: totalIncome.minus(totalExpenses).toString(),
    expensesByCategory,
    ownedProperties: ownedProps.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      isOwner: true,
      isManager: p.managerEntityId === legalEntityId,
    })),
    managedProperties: managedProps
      .filter((p) => p.ownerEntityId !== legalEntityId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        isOwner: false,
        isManager: true,
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
