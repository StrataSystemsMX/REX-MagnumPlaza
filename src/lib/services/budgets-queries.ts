import { requireAuth } from "@/lib/auth/get-session";
import { getActiveLegalEntityId } from "@/lib/auth/active-legal-entity";
import { prisma } from "@/lib/prisma/client";
export { MONTH_KEYS, type MonthKey, type BudgetLineRow, type BudgetData } from "./budgets-types";
import {
  MONTH_KEYS,
  type MonthKey,
  type BudgetData,
  type BudgetLineRow,
  type ConsolidatedBudget,
  type EntityBudgetSummary,
  emptyMonths,
  sumIntoMonths,
} from "./budgets-types";

const INCOME_TYPES = [
  "INCOME_RENT",
  "INCOME_BILLBOARD",
  "INCOME_GUARANTEE",
  "INCOME_OTHER",
] as const;

// Razones sociales que NO se administran en el presupuesto Rex.
// JCL = persona física (Juan Carlos L), sus propiedades son personales.
// CLICK = razón social satélite usada solo en nóminas, no en presupuesto.
const BUDGET_EXCLUDED_ENTITY_CODES = ["JCL", "CLICK"];

// PayrollTypes que pertenecen a "Estrategia Fiscal" en lugar de "Nóminas operativas".
// Se capturan en /estrategia-fiscal, no en /nominas.
const FISCAL_STRATEGY_PAYROLL_TYPES = [
  "STRATEGY_NOMINA",
  "ADMIN_SERVICE_INVOICE",
] as const;

// ExpenseCategory.code que clasifica un Expense como parte de Estrategia Fiscal
// (impuestos retenidos, comisiones bancarias derivadas, etc.). Se excluye de
// Egresos operativos y se suma en Estrategia Fiscal.
const FISCAL_STRATEGY_CATEGORY_CODES = ["IMPUESTOS_ESTRATEGIA"];

export async function getBudgetForYear(year: number): Promise<BudgetData | null> {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const budget = await prisma.budget.findFirst({
    where: {
      tenantId,
      year,
      ...(activeLegalEntityId ? { legalEntityId: activeLegalEntityId } : {}),
    },
    include: {
      legalEntity: { select: { id: true, code: true } },
      lines: {
        orderBy: [{ conceptType: "asc" }, { conceptLabel: "asc" }],
        include: {
          property: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!budget) return null;

  return {
    budgetId: budget.id,
    legalEntityId: budget.legalEntityId,
    year: budget.year,
    isLocked: budget.isLocked,
    lines: budget.lines.map((l) => toLineRow(l, budget.id, budget.legalEntityId, budget.legalEntity?.code ?? "")),
  };
}

export async function getBudgetYears(): Promise<number[]> {
  const { tenantId } = await requireAuth();
  const rows = await prisma.budget.findMany({
    where: { tenantId },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });
  return rows.map((r) => r.year);
}

export async function getLegalEntitiesForBudget() {
  const { tenantId } = await requireAuth();
  return prisma.legalEntity.findMany({
    where: {
      tenantId,
      isActive: true,
      code: { notIn: BUDGET_EXCLUDED_ENTITY_CODES },
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, legalName: true },
  });
}

export async function getPropertiesForBudget() {
  const { tenantId } = await requireAuth();
  return prisma.property.findMany({
    where: { tenantId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      managerEntityId: true,
      ownerEntityId: true,
    },
  });
}

export async function getConsolidatedBudgetForYear(year: number): Promise<ConsolidatedBudget> {
  const { tenantId } = await requireAuth();

  const budgets = await prisma.budget.findMany({
    where: {
      tenantId,
      year,
      legalEntity: { code: { notIn: BUDGET_EXCLUDED_ENTITY_CODES } },
    },
    orderBy: { legalEntity: { code: "asc" } },
    include: {
      legalEntity: { select: { id: true, code: true, legalName: true } },
      lines: {
        orderBy: [{ conceptType: "asc" }, { conceptLabel: "asc" }],
        include: {
          property: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
      },
    },
  });

  const entities: EntityBudgetSummary[] = [];
  const strategyLines: BudgetLineRow[] = [];
  const debtLines: BudgetLineRow[] = [];

  const totalMonthlyIncome = emptyMonths();
  const totalMonthlyExpense = emptyMonths();
  const totalMonthlyStrategy = emptyMonths();
  const totalMonthlyDebt = emptyMonths();

  for (const b of budgets) {
    const code = b.legalEntity?.code ?? "";
    const legalName = b.legalEntity?.legalName ?? "";

    const incomeLines: BudgetLineRow[] = [];
    const expenseLines: BudgetLineRow[] = [];
    const monthlyIncome = emptyMonths();
    const monthlyExpense = emptyMonths();

    for (const l of b.lines) {
      const row = toLineRow(l, b.id, b.legalEntityId, code);

      if ((INCOME_TYPES as readonly string[]).includes(l.conceptType)) {
        incomeLines.push(row);
        sumIntoMonths(monthlyIncome, row.months);
        sumIntoMonths(totalMonthlyIncome, row.months);
      } else if (l.conceptType === "EXPENSE") {
        expenseLines.push(row);
        sumIntoMonths(monthlyExpense, row.months);
        sumIntoMonths(totalMonthlyExpense, row.months);
      } else if (l.conceptType === "TAX_STRATEGY") {
        strategyLines.push(row);
        sumIntoMonths(totalMonthlyStrategy, row.months);
      } else if (l.conceptType === "DEBT_SERVICE") {
        debtLines.push(row);
        sumIntoMonths(totalMonthlyDebt, row.months);
      }
    }

    const annualIncome = sumArray(monthlyIncome);
    const annualExpense = sumArray(monthlyExpense);
    const monthlyProfit = monthlyIncome.map((v, i) => v - (monthlyExpense[i] ?? 0));

    entities.push({
      legalEntityId: b.legalEntityId,
      code,
      legalName,
      budgetId: b.id,
      isLocked: b.isLocked,
      incomeLines,
      expenseLines,
      monthlyIncome,
      monthlyExpense,
      annualIncome,
      annualExpense,
      monthlyProfit,
      annualProfit: annualIncome - annualExpense,
    });
  }

  const monthlyOperatingProfit = totalMonthlyIncome.map((v, i) => v - (totalMonthlyExpense[i] ?? 0));
  const monthlyNetAfterDistribution = monthlyOperatingProfit.map(
    (v, i) => v - (totalMonthlyStrategy[i] ?? 0) - (totalMonthlyDebt[i] ?? 0),
  );

  return {
    year,
    entities,
    strategyLines,
    debtLines,
    totals: {
      monthlyIncome: totalMonthlyIncome,
      monthlyExpense: totalMonthlyExpense,
      monthlyOperatingProfit,
      monthlyStrategy: totalMonthlyStrategy,
      monthlyDebt: totalMonthlyDebt,
      monthlyNetAfterDistribution,
      annualIncome: sumArray(totalMonthlyIncome),
      annualExpense: sumArray(totalMonthlyExpense),
      annualOperatingProfit: sumArray(monthlyOperatingProfit),
      annualStrategy: sumArray(totalMonthlyStrategy),
      annualDebt: sumArray(totalMonthlyDebt),
      annualNetAfterDistribution: sumArray(monthlyNetAfterDistribution),
    },
  };
}

function sumArray(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

// ============================================================================
// getRealConsolidatedBudgetForYear
// ============================================================================
// Variante "real" del consolidado: en lugar de leer Budget/BudgetLine (la tabla
// de planeación), agrega los datos efectivamente registrados en:
//   - Rent           → Ingresos por inmueble
//   - Expense        → Egresos por categoría (excluye PAYROLL)
//   - Payroll        → Estrategia fiscal (sólo type=STRATEGY_NOMINA)
//   - Loan + Payments → Servicio de deuda (excluye VEHICLE, esos van en egresos)
// Devuelve el mismo shape `ConsolidatedBudget` que la variante planeada para
// que el resto del UI no cambie. Es read-only: los IDs de línea son sintéticos.
// ============================================================================
export async function getRealConsolidatedBudgetForYear(
  year: number,
): Promise<ConsolidatedBudget> {
  const { tenantId } = await requireAuth();

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const legalEntities = await prisma.legalEntity.findMany({
    where: {
      tenantId,
      isActive: true,
      code: { notIn: BUDGET_EXCLUDED_ENTITY_CODES },
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, legalName: true },
  });
  const entityById = new Map(legalEntities.map((e) => [e.id, e]));

  const [rents, expenses, strategyPayrolls, loans, strategyExpenses] = await Promise.all([
    prisma.rent.findMany({
      where: { tenantId, period: { gte: yearStart, lt: yearEnd } },
      select: {
        legalEntityId: true,
        period: true,
        amountDue: true,
        contract: {
          select: {
            unit: {
              select: {
                property: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        tenantId,
        expenseDate: { gte: yearStart, lt: yearEnd },
        category: {
          type: { not: "PAYROLL" },
          code: { notIn: FISCAL_STRATEGY_CATEGORY_CODES },
        },
      },
      select: {
        legalEntityId: true,
        expenseDate: true,
        amount: true,
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.payroll.findMany({
      where: {
        tenantId,
        type: { in: [...FISCAL_STRATEGY_PAYROLL_TYPES] },
        period: { gte: yearStart, lt: yearEnd },
      },
      select: {
        legalEntityId: true,
        period: true,
        amount: true,
        description: true,
        type: true,
      },
    }),
    prisma.loan.findMany({
      where: {
        tenantId,
        type: { notIn: ["VEHICLE"] }, // los autos van en egresos operativos
        legalEntity: { code: { notIn: BUDGET_EXCLUDED_ENTITY_CODES } },
      },
      select: {
        id: true,
        name: true,
        legalEntityId: true,
        legalEntity: { select: { code: true } },
        payments: {
          where: { period: { gte: yearStart, lt: yearEnd } },
          select: { period: true, amount: true },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        tenantId,
        expenseDate: { gte: yearStart, lt: yearEnd },
        category: { code: { in: FISCAL_STRATEGY_CATEGORY_CODES } },
      },
      select: {
        legalEntityId: true,
        expenseDate: true,
        amount: true,
        description: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  // Inicializar el bucket por entidad para asegurar que aparezcan aunque no tengan datos.
  const byEntity = new Map<string, EntityBudgetSummary>();
  for (const e of legalEntities) {
    byEntity.set(e.id, {
      legalEntityId: e.id,
      code: e.code,
      legalName: e.legalName,
      budgetId: e.id,
      isLocked: false,
      incomeLines: [],
      expenseLines: [],
      monthlyIncome: emptyMonths(),
      monthlyExpense: emptyMonths(),
      annualIncome: 0,
      annualExpense: 0,
      monthlyProfit: emptyMonths(),
      annualProfit: 0,
    });
  }

  // ---- Ingresos: Rent agrupado por (entity, property) ----
  const incomeAgg = new Map<
    string,
    {
      legalEntityId: string;
      propertyId: string | null;
      propertyName: string;
      months: Record<MonthKey, number>;
    }
  >();
  for (const rent of rents) {
    if (!entityById.has(rent.legalEntityId)) continue;
    const property = rent.contract?.unit?.property ?? null;
    const propertyId = property?.id ?? null;
    const propertyName = property?.name ?? "Renta sin inmueble";
    const key = `${rent.legalEntityId}::${propertyId ?? "none"}`;
    let agg = incomeAgg.get(key);
    if (!agg) {
      agg = {
        legalEntityId: rent.legalEntityId,
        propertyId,
        propertyName,
        months: zeroMonths(),
      };
      incomeAgg.set(key, agg);
    }
    const monthIdx = rent.period.getUTCMonth();
    const mk = MONTH_KEYS[monthIdx];
    if (mk) agg.months[mk] += Number(rent.amountDue);
  }
  for (const agg of incomeAgg.values()) {
    const entity = byEntity.get(agg.legalEntityId);
    if (!entity) continue;
    roundMonths(agg.months);
    const annual = sumMonthValues(agg.months);
    entity.incomeLines.push({
      id: `income::${agg.legalEntityId}::${agg.propertyId ?? "none"}`,
      budgetId: agg.legalEntityId,
      legalEntityId: agg.legalEntityId,
      legalEntityCode: entity.code,
      conceptType: "INCOME_RENT",
      conceptLabel: agg.propertyName,
      propertyId: agg.propertyId,
      propertyName: agg.propertyName,
      categoryId: null,
      categoryName: null,
      months: agg.months,
      annual,
    });
    sumIntoMonths(entity.monthlyIncome, agg.months);
    entity.annualIncome += annual;
  }

  // ---- Egresos: Expense agrupado por (entity, category) ----
  const expenseAgg = new Map<
    string,
    {
      legalEntityId: string;
      categoryId: string;
      categoryName: string;
      months: Record<MonthKey, number>;
    }
  >();
  for (const exp of expenses) {
    if (!entityById.has(exp.legalEntityId)) continue;
    const key = `${exp.legalEntityId}::${exp.category.id}`;
    let agg = expenseAgg.get(key);
    if (!agg) {
      agg = {
        legalEntityId: exp.legalEntityId,
        categoryId: exp.category.id,
        categoryName: exp.category.name,
        months: zeroMonths(),
      };
      expenseAgg.set(key, agg);
    }
    const monthIdx = exp.expenseDate.getUTCMonth();
    const mk = MONTH_KEYS[monthIdx];
    if (mk) agg.months[mk] += Number(exp.amount);
  }
  for (const agg of expenseAgg.values()) {
    const entity = byEntity.get(agg.legalEntityId);
    if (!entity) continue;
    roundMonths(agg.months);
    const annual = sumMonthValues(agg.months);
    entity.expenseLines.push({
      id: `expense::${agg.legalEntityId}::${agg.categoryId}`,
      budgetId: agg.legalEntityId,
      legalEntityId: agg.legalEntityId,
      legalEntityCode: entity.code,
      conceptType: "EXPENSE",
      conceptLabel: agg.categoryName,
      propertyId: null,
      propertyName: null,
      categoryId: agg.categoryId,
      categoryName: agg.categoryName,
      months: agg.months,
      annual,
    });
    sumIntoMonths(entity.monthlyExpense, agg.months);
    entity.annualExpense += annual;
  }

  // Calcular utilidad por entidad y ordenar líneas por monto descendente.
  const entities: EntityBudgetSummary[] = [];
  for (const entity of byEntity.values()) {
    entity.monthlyProfit = entity.monthlyIncome.map(
      (v, i) => v - (entity.monthlyExpense[i] ?? 0),
    );
    entity.annualProfit = entity.annualIncome - entity.annualExpense;
    entity.incomeLines.sort((a, b) => b.annual - a.annual);
    entity.expenseLines.sort((a, b) => b.annual - a.annual);
    entities.push(entity);
  }

  // ---- Estrategia fiscal: Payroll(STRATEGY_NOMINA/ADMIN_SERVICE_INVOICE) + Expense(IMPUESTOS_ESTRATEGIA) ----
  // Agrupados por (entity, description). Para los Expense usamos description o
  // nombre de categoría como fallback.
  const strategyAgg = new Map<
    string,
    {
      legalEntityId: string;
      legalEntityCode: string;
      description: string;
      months: Record<MonthKey, number>;
    }
  >();
  for (const p of strategyPayrolls) {
    const entity = entityById.get(p.legalEntityId);
    if (!entity) continue;
    const desc = p.description?.trim() || `Estrategia ${entity.code}`;
    const key = `${p.legalEntityId}::${desc}`;
    let agg = strategyAgg.get(key);
    if (!agg) {
      agg = {
        legalEntityId: p.legalEntityId,
        legalEntityCode: entity.code,
        description: desc,
        months: zeroMonths(),
      };
      strategyAgg.set(key, agg);
    }
    const monthIdx = p.period.getUTCMonth();
    const mk = MONTH_KEYS[monthIdx];
    if (mk) agg.months[mk] += Number(p.amount);
  }
  for (const e of strategyExpenses) {
    const entity = entityById.get(e.legalEntityId);
    if (!entity) continue;
    const desc = e.description?.trim() || e.category?.name || "Impuestos estrategia";
    const key = `${e.legalEntityId}::${desc}`;
    let agg = strategyAgg.get(key);
    if (!agg) {
      agg = {
        legalEntityId: e.legalEntityId,
        legalEntityCode: entity.code,
        description: desc,
        months: zeroMonths(),
      };
      strategyAgg.set(key, agg);
    }
    const monthIdx = e.expenseDate.getUTCMonth();
    const mk = MONTH_KEYS[monthIdx];
    if (mk) agg.months[mk] += Number(e.amount);
  }
  const strategyLines: BudgetLineRow[] = Array.from(strategyAgg.values())
    .map((agg) => ({
      id: `strategy::${agg.legalEntityId}::${agg.description}`,
      budgetId: agg.legalEntityId,
      legalEntityId: agg.legalEntityId,
      legalEntityCode: agg.legalEntityCode,
      conceptType: "TAX_STRATEGY" as const,
      conceptLabel: agg.description,
      propertyId: null,
      propertyName: null,
      categoryId: null,
      categoryName: null,
      months: roundMonths(agg.months),
      annual: sumMonthValues(agg.months),
    }))
    .sort((a, b) => b.annual - a.annual);

  // ---- Servicio de deuda: una línea por Loan, montos = suma de LoanPayment del mes ----
  const debtLines: BudgetLineRow[] = [];
  for (const loan of loans) {
    const months = zeroMonths();
    for (const pay of loan.payments) {
      const monthIdx = pay.period.getUTCMonth();
      const mk = MONTH_KEYS[monthIdx];
      if (mk) months[mk] += Number(pay.amount);
    }
    roundMonths(months);
    const annual = sumMonthValues(months);
    if (annual === 0) continue; // skip Loans sin pagos en el año
    debtLines.push({
      id: `debt::${loan.id}`,
      budgetId: loan.legalEntityId,
      legalEntityId: loan.legalEntityId,
      legalEntityCode: loan.legalEntity?.code ?? "",
      conceptType: "DEBT_SERVICE",
      conceptLabel: loan.name,
      propertyId: null,
      propertyName: null,
      categoryId: null,
      categoryName: null,
      months,
      annual,
    });
  }
  debtLines.sort((a, b) => b.annual - a.annual);

  // ---- Totales globales ----
  const totalMonthlyIncome = emptyMonths();
  const totalMonthlyExpense = emptyMonths();
  const totalMonthlyStrategy = emptyMonths();
  const totalMonthlyDebt = emptyMonths();
  for (const e of entities) {
    for (let i = 0; i < 12; i++) {
      totalMonthlyIncome[i] = (totalMonthlyIncome[i] ?? 0) + (e.monthlyIncome[i] ?? 0);
      totalMonthlyExpense[i] = (totalMonthlyExpense[i] ?? 0) + (e.monthlyExpense[i] ?? 0);
    }
  }
  for (const line of strategyLines) sumIntoMonths(totalMonthlyStrategy, line.months);
  for (const line of debtLines) sumIntoMonths(totalMonthlyDebt, line.months);

  const monthlyOperatingProfit = totalMonthlyIncome.map(
    (v, i) => v - (totalMonthlyExpense[i] ?? 0),
  );
  const monthlyNetAfterDistribution = monthlyOperatingProfit.map(
    (v, i) => v - (totalMonthlyStrategy[i] ?? 0) - (totalMonthlyDebt[i] ?? 0),
  );

  return {
    year,
    entities,
    strategyLines,
    debtLines,
    totals: {
      monthlyIncome: totalMonthlyIncome,
      monthlyExpense: totalMonthlyExpense,
      monthlyOperatingProfit,
      monthlyStrategy: totalMonthlyStrategy,
      monthlyDebt: totalMonthlyDebt,
      monthlyNetAfterDistribution,
      annualIncome: sumArray(totalMonthlyIncome),
      annualExpense: sumArray(totalMonthlyExpense),
      annualOperatingProfit: sumArray(monthlyOperatingProfit),
      annualStrategy: sumArray(totalMonthlyStrategy),
      annualDebt: sumArray(totalMonthlyDebt),
      annualNetAfterDistribution: sumArray(monthlyNetAfterDistribution),
    },
  };
}

function zeroMonths(): Record<MonthKey, number> {
  return Object.fromEntries(MONTH_KEYS.map((k) => [k, 0])) as Record<MonthKey, number>;
}

/**
 * Redondea cada mes a centavos tras acumular. Las sumas se hacen en float
 * (los `months` viajan a Client Components, que no serializan Decimal); el
 * redondeo al emitir evita que se arrastren fracciones de centavo a la UI.
 */
function roundMonths(months: Record<MonthKey, number>): Record<MonthKey, number> {
  for (const k of MONTH_KEYS) months[k] = Math.round(months[k] * 100) / 100;
  return months;
}

function sumMonthValues(months: Record<MonthKey, number>): number {
  return Math.round(MONTH_KEYS.reduce((acc, k) => acc + months[k], 0) * 100) / 100;
}

type LineWithRels = {
  id: string;
  conceptType: BudgetLineRow["conceptType"];
  conceptLabel: string;
  propertyId: string | null;
  categoryId: string | null;
  property: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
} & Record<MonthKey, unknown>;

function toLineRow(
  l: LineWithRels,
  budgetId: string,
  legalEntityId: string,
  legalEntityCode: string,
): BudgetLineRow {
  const months = Object.fromEntries(MONTH_KEYS.map((k) => [k, Number(l[k])])) as Record<MonthKey, number>;
  const annual = MONTH_KEYS.reduce((acc, k) => acc + months[k], 0);
  return {
    id: l.id,
    budgetId,
    legalEntityId,
    legalEntityCode,
    conceptType: l.conceptType,
    conceptLabel: l.conceptLabel,
    propertyId: l.propertyId,
    propertyName: l.property?.name ?? null,
    categoryId: l.categoryId,
    categoryName: l.category?.name ?? null,
    months,
    annual,
  };
}
