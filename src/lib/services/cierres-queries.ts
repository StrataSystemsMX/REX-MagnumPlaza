import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";

// ============================================================================
// Cierres Mensuales y Anuales — bundle de datos para la pantalla tipo Excel
// del cliente. Replica las hojas "Ingresos / Egresos / Resumen Operativo /
// Estrategia Fiscal / Inversiones" agrupadas por razón social.
// ============================================================================

const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | string | null | undefined) =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

export type Monthly12 = [
  string, string, string, string, string, string,
  string, string, string, string, string, string,
];

const empty12 = (): Monthly12 => ["0","0","0","0","0","0","0","0","0","0","0","0"];

export interface MatrixRow {
  /** key estable para React (propertyId, categoryId, "predial", "loan-xyz"). */
  key: string;
  label: string;
  /** Sublabel opcional (ej. "VEHICLE", "MORTGAGE"). */
  sublabel?: string;
  monthly: Monthly12;
  total: string;
}

export interface MonthlyMatrix {
  rows: MatrixRow[];
  monthlyTotals: Monthly12;
  grandTotal: string;
}

export interface EntitySummary {
  income: Monthly12;
  expense: Monthly12;
  utility: Monthly12;
  incomeTotal: string;
  expenseTotal: string;
  utilityTotal: string;
}

export interface AnnualClosing {
  year: number;
  legalEntities: Array<{
    id: string;
    code: string;
    legalName: string;
    isOperator: boolean;
  }>;
  /** Ingresos por entidad (cobros recibidos en el año, agrupados por inmueble). */
  incomeByEntity: Record<string, MonthlyMatrix>;
  /** Egresos por entidad (Expense + Payroll operativo + CadastralPayment + Loan-VEHICLE). */
  expensesByEntity: Record<string, MonthlyMatrix>;
  /** Resumen operativo: ingresos/egresos/utilidad por entidad y total. */
  summary: {
    perEntity: Record<string, EntitySummary>;
    operativeUtility: Monthly12;
    operativeUtilityTotal: string;
  };
  /** Estrategia Fiscal (Payroll tipo STRATEGY_NOMINA). */
  fiscalStrategy: MonthlyMatrix;
  /** Inversiones (Loan tipo MORTGAGE/PERSONAL + InvestmentPayment). */
  investments: MonthlyMatrix;
  /** Utilidad operativa − estrategia − inversiones. */
  finalUtility: { monthly: Monthly12; total: string };
}

// ============================================================================
// Helpers
// ============================================================================

function addToBucket(bucket: Prisma.Decimal[], idx: number, amount: Prisma.Decimal) {
  bucket[idx] = (bucket[idx] ?? ZERO).plus(amount);
}

function bucketToStrings(bucket: Prisma.Decimal[]): Monthly12 {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    out.push((bucket[i] ?? ZERO).toString());
  }
  return out as Monthly12;
}

function sumOf(bucket: Prisma.Decimal[]): Prisma.Decimal {
  return bucket.reduce((acc, v) => acc.plus(v ?? ZERO), ZERO);
}

function subtract12(a: Monthly12, b: Monthly12): Monthly12 {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(new Prisma.Decimal(a[i]!).minus(new Prisma.Decimal(b[i]!)).toString());
  }
  return out as Monthly12;
}

function sum12(a: Monthly12): string {
  let s = ZERO;
  for (const v of a) s = s.plus(new Prisma.Decimal(v));
  return s.toString();
}

function emptyMatrix(): MonthlyMatrix {
  return { rows: [], monthlyTotals: empty12(), grandTotal: "0" };
}

function buildMatrix(
  rows: Array<{
    key: string;
    label: string;
    sublabel?: string;
    bucket: Prisma.Decimal[];
  }>,
): MonthlyMatrix {
  const totals: Prisma.Decimal[] = Array.from({ length: 12 }, () => ZERO);
  let grand = ZERO;

  const matrixRows: MatrixRow[] = rows
    .filter((r) => sumOf(r.bucket).greaterThan(0))
    .map((r) => {
      const monthly = bucketToStrings(r.bucket);
      const total = sumOf(r.bucket);
      for (let i = 0; i < 12; i++) {
        totals[i] = (totals[i] ?? ZERO).plus(r.bucket[i] ?? ZERO);
      }
      grand = grand.plus(total);
      const row: MatrixRow = {
        key: r.key,
        label: r.label,
        monthly,
        total: total.toString(),
      };
      if (r.sublabel) row.sublabel = r.sublabel;
      return row;
    })
    .sort((a, b) => Number(b.total) - Number(a.total));

  return {
    rows: matrixRows,
    monthlyTotals: bucketToStrings(totals),
    grandTotal: grand.toString(),
  };
}

// ============================================================================
// Bundle público
// ============================================================================

export async function getAnnualClosingBundle(
  tenantId: string,
  year: number,
): Promise<AnnualClosing> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [
    legalEntities,
    properties,
    expenseCategories,
    payments,
    expenses,
    payrolls,
    cadastrals,
    loanPayments,
    investmentPayments,
  ] = await Promise.all([
    prisma.legalEntity.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ isOperator: "desc" }, { code: "asc" }],
      select: { id: true, code: true, legalName: true, isOperator: true },
    }),
    prisma.property.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, managerEntityId: true },
    }),
    prisma.expenseCategory.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true, type: true },
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
    prisma.expense.findMany({
      where: {
        tenantId,
        expenseDate: { gte: yearStart, lt: yearEnd },
        category: { type: { not: "PAYROLL" } },
      },
      select: {
        amount: true,
        expenseDate: true,
        legalEntityId: true,
        categoryId: true,
      },
    }),
    prisma.payroll.findMany({
      where: {
        tenantId,
        period: { gte: yearStart, lt: yearEnd },
      },
      select: {
        amount: true,
        period: true,
        type: true,
        legalEntityId: true,
        description: true,
      },
    }),
    prisma.cadastralPayment.findMany({
      where: {
        tenantId,
        OR: [
          { paymentDate: { gte: yearStart, lt: yearEnd } },
          { dueDate: { gte: yearStart, lt: yearEnd } },
        ],
      },
      select: {
        paidAmount: true,
        totalAmount: true,
        paymentDate: true,
        dueDate: true,
        isPaid: true,
        propertyId: true,
        payerEntityId: true,
      },
    }),
    prisma.loanPayment.findMany({
      where: {
        tenantId,
        period: { gte: yearStart, lt: yearEnd },
      },
      select: {
        amount: true,
        period: true,
        loan: {
          select: {
            id: true,
            name: true,
            type: true,
            legalEntityId: true,
          },
        },
      },
    }),
    prisma.investmentPayment.findMany({
      where: {
        tenantId,
        paymentDate: { gte: yearStart, lt: yearEnd },
      },
      select: {
        amount: true,
        paymentDate: true,
        description: true,
        project: {
          select: {
            id: true,
            name: true,
            legalEntityId: true,
          },
        },
      },
    }),
  ]);

  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const categoryById = new Map(expenseCategories.map((c) => [c.id, c]));

  // ==========================================================================
  // INGRESOS por entidad → propiedad → mes
  // ==========================================================================
  // bucket[entityId][propertyId] = Decimal[12]
  const incomeBuckets = new Map<string, Map<string, Prisma.Decimal[]>>();
  for (const le of legalEntities) incomeBuckets.set(le.id, new Map());

  for (const pay of payments) {
    const propertyId = pay.rent?.contract?.unit?.propertyId;
    if (!propertyId) continue;
    const property = propertyById.get(propertyId);
    if (!property) continue;
    const entityBucket = incomeBuckets.get(property.managerEntityId);
    if (!entityBucket) continue;
    if (!entityBucket.has(propertyId)) {
      entityBucket.set(
        propertyId,
        Array.from({ length: 12 }, () => ZERO),
      );
    }
    const propBucket = entityBucket.get(propertyId)!;
    const monthIdx = pay.paymentDate.getUTCMonth();
    addToBucket(propBucket, monthIdx, dec(pay.amount));
  }

  const incomeByEntity: Record<string, MonthlyMatrix> = {};
  for (const le of legalEntities) {
    const entityBucket = incomeBuckets.get(le.id)!;
    const rows = Array.from(entityBucket.entries()).map(([propertyId, bucket]) => ({
      key: `prop-${propertyId}`,
      label: propertyById.get(propertyId)?.name ?? "—",
      bucket,
    }));
    incomeByEntity[le.code] = buildMatrix(rows);
  }

  // ==========================================================================
  // EGRESOS por entidad → categoría/concepto → mes
  // ==========================================================================
  // Para cada entidad llevamos un Map<categoryKey, bucket>.
  const expenseBuckets = new Map<
    string,
    Map<string, { label: string; sublabel?: string; bucket: Prisma.Decimal[] }>
  >();
  for (const le of legalEntities) expenseBuckets.set(le.id, new Map());

  const ensureRow = (
    entityId: string,
    key: string,
    label: string,
    sublabel?: string,
  ) => {
    const map = expenseBuckets.get(entityId);
    if (!map) return null;
    let row = map.get(key);
    if (!row) {
      row = { label, bucket: Array.from({ length: 12 }, () => ZERO) };
      if (sublabel) row.sublabel = sublabel;
      map.set(key, row);
    }
    return row;
  };

  // Expenses operativos (excluye PAYROLL — se gestiona en Payroll model)
  for (const exp of expenses) {
    const cat = categoryById.get(exp.categoryId);
    const label = cat?.name ?? "Otros egresos";
    const row = ensureRow(exp.legalEntityId, `cat-${exp.categoryId}`, label);
    if (!row) continue;
    addToBucket(row.bucket, exp.expenseDate.getUTCMonth(), dec(exp.amount));
  }

  // Payrolls (excluyendo STRATEGY_NOMINA, que va al bloque "Estrategia Fiscal")
  const payrollLabel: Record<string, string> = {
    DIRECT_PAYROLL: "Nómina Directa",
    ADMIN_SERVICE_INVOICE: "Nómina (Servicios Admin)",
    COMMISSION: "Comisiones",
    BONUS: "Bonos",
    STRATEGY_NOMINA: "Estrategia Nómina",
  };
  for (const pr of payrolls) {
    if (pr.type === "STRATEGY_NOMINA") continue;
    const label = payrollLabel[pr.type] ?? pr.type;
    const row = ensureRow(pr.legalEntityId, `payroll-${pr.type}`, label);
    if (!row) continue;
    addToBucket(row.bucket, pr.period.getUTCMonth(), dec(pr.amount));
  }

  // Prediales (CadastralPayment). Si tienen paymentDate y paidAmount, los
  // imputamos a esa fecha; si no, usamos dueDate y totalAmount.
  for (const cp of cadastrals) {
    const date = cp.paymentDate ?? cp.dueDate;
    if (!date) continue;
    if (date < yearStart || date >= yearEnd) continue;
    const amount = cp.paidAmount ?? cp.totalAmount;
    if (!amount) continue;
    const property = propertyById.get(cp.propertyId);
    if (!property) continue;
    const payerId = cp.payerEntityId ?? property.managerEntityId;
    const row = ensureRow(payerId, "predial", "Predial Impuestos");
    if (!row) continue;
    addToBucket(row.bucket, date.getUTCMonth(), dec(amount));
  }

  // Loan payments tipo VEHICLE → egresos operativos.
  // Tipos MORTGAGE/PERSONAL/OTHER → bloque "Inversiones" más abajo.
  for (const lp of loanPayments) {
    if (lp.loan.type !== "VEHICLE") continue;
    const row = ensureRow(
      lp.loan.legalEntityId,
      `loan-${lp.loan.id}`,
      `Financiamiento ${lp.loan.name}`,
      "VEHICLE",
    );
    if (!row) continue;
    addToBucket(row.bucket, lp.period.getUTCMonth(), dec(lp.amount));
  }

  const expensesByEntity: Record<string, MonthlyMatrix> = {};
  for (const le of legalEntities) {
    const map = expenseBuckets.get(le.id)!;
    const rows = Array.from(map.entries()).map(([key, r]) => {
      const item: { key: string; label: string; sublabel?: string; bucket: Prisma.Decimal[] } = {
        key,
        label: r.label,
        bucket: r.bucket,
      };
      if (r.sublabel) item.sublabel = r.sublabel;
      return item;
    });
    expensesByEntity[le.code] = buildMatrix(rows);
  }

  // ==========================================================================
  // RESUMEN OPERATIVO
  // ==========================================================================
  const perEntity: Record<string, EntitySummary> = {};
  const operativeUtility: Prisma.Decimal[] = Array.from({ length: 12 }, () => ZERO);

  for (const le of legalEntities) {
    const income = incomeByEntity[le.code]?.monthlyTotals ?? empty12();
    const expense = expensesByEntity[le.code]?.monthlyTotals ?? empty12();
    const utility = subtract12(income, expense);
    for (let i = 0; i < 12; i++) {
      operativeUtility[i] = (operativeUtility[i] ?? ZERO).plus(new Prisma.Decimal(utility[i]!));
    }
    perEntity[le.code] = {
      income,
      expense,
      utility,
      incomeTotal: sum12(income),
      expenseTotal: sum12(expense),
      utilityTotal: sum12(utility),
    };
  }

  const operativeUtility12 = bucketToStrings(operativeUtility);
  const operativeUtilityTotal = sum12(operativeUtility12);

  // ==========================================================================
  // ESTRATEGIA FISCAL — Payroll tipo STRATEGY_NOMINA agrupado por descripción.
  // ==========================================================================
  const strategyMap = new Map<string, { label: string; bucket: Prisma.Decimal[] }>();
  for (const pr of payrolls) {
    if (pr.type !== "STRATEGY_NOMINA") continue;
    const label = pr.description?.trim() || "Estrategia Fiscal";
    let row = strategyMap.get(label);
    if (!row) {
      row = { label, bucket: Array.from({ length: 12 }, () => ZERO) };
      strategyMap.set(label, row);
    }
    addToBucket(row.bucket, pr.period.getUTCMonth(), dec(pr.amount));
  }
  const fiscalStrategy = buildMatrix(
    Array.from(strategyMap.entries()).map(([key, r]) => ({
      key: `strategy-${key}`,
      label: r.label,
      bucket: r.bucket,
    })),
  );

  // ==========================================================================
  // INVERSIONES — Loan MORTGAGE/PERSONAL + InvestmentPayment
  // ==========================================================================
  const investmentMap = new Map<string, { label: string; sublabel?: string; bucket: Prisma.Decimal[] }>();
  for (const lp of loanPayments) {
    if (lp.loan.type === "VEHICLE") continue;
    const key = `loan-${lp.loan.id}`;
    let row = investmentMap.get(key);
    if (!row) {
      row = {
        label: lp.loan.name,
        sublabel: lp.loan.type,
        bucket: Array.from({ length: 12 }, () => ZERO),
      };
      investmentMap.set(key, row);
    }
    addToBucket(row.bucket, lp.period.getUTCMonth(), dec(lp.amount));
  }
  for (const ip of investmentPayments) {
    const key = `project-${ip.project.id}`;
    let row = investmentMap.get(key);
    if (!row) {
      row = {
        label: ip.project.name,
        sublabel: "INVERSIÓN",
        bucket: Array.from({ length: 12 }, () => ZERO),
      };
      investmentMap.set(key, row);
    }
    addToBucket(row.bucket, ip.paymentDate.getUTCMonth(), dec(ip.amount));
  }
  const investments = buildMatrix(
    Array.from(investmentMap.entries()).map(([key, r]) => {
      const item: { key: string; label: string; sublabel?: string; bucket: Prisma.Decimal[] } = {
        key,
        label: r.label,
        bucket: r.bucket,
      };
      if (r.sublabel) item.sublabel = r.sublabel;
      return item;
    }),
  );

  // ==========================================================================
  // UTILIDAD FINAL = utilidad operativa − estrategia − inversiones
  // ==========================================================================
  const finalMonthly: Prisma.Decimal[] = Array.from({ length: 12 }, (_, i) =>
    new Prisma.Decimal(operativeUtility12[i]!)
      .minus(new Prisma.Decimal(fiscalStrategy.monthlyTotals[i]!))
      .minus(new Prisma.Decimal(investments.monthlyTotals[i]!)),
  );
  const finalMonthly12 = bucketToStrings(finalMonthly);

  return {
    year,
    legalEntities,
    incomeByEntity,
    expensesByEntity,
    summary: {
      perEntity,
      operativeUtility: operativeUtility12,
      operativeUtilityTotal,
    },
    fiscalStrategy: fiscalStrategy.rows.length === 0 ? emptyMatrix() : fiscalStrategy,
    investments: investments.rows.length === 0 ? emptyMatrix() : investments,
    finalUtility: {
      monthly: finalMonthly12,
      total: sum12(finalMonthly12),
    },
  };
}
