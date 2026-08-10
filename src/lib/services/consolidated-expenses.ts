import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";

const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

export interface OperatingExpenseRow {
  /** Estable y único entre las 4 fuentes: `expense:<id>`, `payroll:<id>`, `predial:<id>`, `loan:<id>`. */
  id: string;
  legalEntityId: string;
  date: Date;
  amount: Prisma.Decimal;
  /** Clave de agrupación (categoría real de Expense, o pseudo-categoría de nómina/predial/financiamiento). */
  categoryKey: string;
  categoryLabel: string;
  categorySublabel?: string;
}

const PAYROLL_LABEL: Record<string, string> = {
  DIRECT_PAYROLL: "Nómina Directa",
  ADMIN_SERVICE_INVOICE: "Nómina (Servicios Admin)",
  COMMISSION: "Comisiones",
  BONUS: "Bonos",
};

/**
 * Egresos OPERATIVOS consolidados de un tenant en [start, end): Expense (no
 * PAYROLL) + Payroll (no STRATEGY_NOMINA) + CadastralPayment (predial) +
 * LoanPayment de créditos VEHICLE.
 *
 * Es la misma definición de "egreso operativo" que usa el Cierre Anual
 * (Payroll STRATEGY_NOMINA y Loan MORTGAGE/PERSONAL/OTHER quedan fuera a
 * propósito — van a los bloques "Estrategia Fiscal" e "Inversiones"). Toda
 * pantalla que muestre el egreso/margen de una LegalEntity debe usar esta
 * función en vez de leer solo la tabla Expense — de lo contrario el egreso
 * queda subestimado en cuanto la entidad tenga nómina, predial o un crédito
 * vehicular.
 */
export async function getOperatingExpenseRows(
  tenantId: string,
  start: Date,
  end: Date,
): Promise<OperatingExpenseRow[]> {
  const [expenses, payrolls, cadastrals, loanPayments] = await Promise.all([
    prisma.expense.findMany({
      where: {
        tenantId,
        expenseDate: { gte: start, lt: end },
        category: { type: { not: "PAYROLL" } },
      },
      select: {
        id: true,
        amount: true,
        expenseDate: true,
        legalEntityId: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    }),
    prisma.payroll.findMany({
      where: { tenantId, period: { gte: start, lt: end }, type: { not: "STRATEGY_NOMINA" } },
      select: { id: true, amount: true, period: true, type: true, legalEntityId: true },
    }),
    prisma.cadastralPayment.findMany({
      where: {
        tenantId,
        property: { isActive: true },
        OR: [{ paymentDate: { gte: start, lt: end } }, { dueDate: { gte: start, lt: end } }],
      },
      select: {
        id: true,
        paidAmount: true,
        totalAmount: true,
        paymentDate: true,
        dueDate: true,
        payerEntityId: true,
        property: { select: { managerEntityId: true } },
      },
    }),
    prisma.loanPayment.findMany({
      where: { tenantId, period: { gte: start, lt: end }, loan: { type: "VEHICLE" } },
      select: {
        id: true,
        amount: true,
        period: true,
        loan: { select: { id: true, name: true, legalEntityId: true } },
      },
    }),
  ]);

  const rows: OperatingExpenseRow[] = [];

  for (const e of expenses) {
    rows.push({
      id: `expense:${e.id}`,
      legalEntityId: e.legalEntityId,
      date: e.expenseDate,
      amount: dec(e.amount),
      categoryKey: `cat-${e.categoryId}`,
      categoryLabel: e.category.name,
    });
  }

  for (const pr of payrolls) {
    rows.push({
      id: `payroll:${pr.id}`,
      legalEntityId: pr.legalEntityId,
      date: pr.period,
      amount: dec(pr.amount),
      categoryKey: `payroll-${pr.type}`,
      categoryLabel: PAYROLL_LABEL[pr.type] ?? pr.type,
    });
  }

  // Si tienen paymentDate y paidAmount los imputamos a esa fecha; si no, a
  // dueDate y totalAmount (predial aún no pagado pero ya dado de alta).
  for (const cp of cadastrals) {
    const date = cp.paymentDate ?? cp.dueDate;
    if (date < start || date >= end) continue;
    const amount = cp.paidAmount ?? cp.totalAmount;
    if (!amount) continue;
    rows.push({
      id: `predial:${cp.id}`,
      legalEntityId: cp.payerEntityId ?? cp.property.managerEntityId,
      date,
      amount: dec(amount),
      categoryKey: "predial",
      categoryLabel: "Predial Impuestos",
    });
  }

  for (const lp of loanPayments) {
    rows.push({
      id: `loan:${lp.id}`,
      legalEntityId: lp.loan.legalEntityId,
      date: lp.period,
      amount: dec(lp.amount),
      categoryKey: `loan-${lp.loan.id}`,
      categoryLabel: `Financiamiento ${lp.loan.name}`,
      categorySublabel: "VEHICLE",
    });
  }

  return rows;
}
