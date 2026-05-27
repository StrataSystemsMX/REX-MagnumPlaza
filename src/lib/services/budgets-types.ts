import type { BudgetConceptType } from "@/generated/prisma/enums";

export const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

export type MonthKey = typeof MONTH_KEYS[number];

export interface BudgetLineRow {
  id: string;
  budgetId: string;
  legalEntityId: string;
  legalEntityCode: string;
  conceptType: BudgetConceptType;
  conceptLabel: string;
  propertyId: string | null;
  propertyName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  months: Record<MonthKey, number>;
  annual: number;
}

export interface BudgetData {
  budgetId: string;
  legalEntityId: string;
  year: number;
  isLocked: boolean;
  lines: BudgetLineRow[];
}

export interface EntityBudgetSummary {
  legalEntityId: string;
  code: string;
  legalName: string;
  budgetId: string;
  isLocked: boolean;
  incomeLines: BudgetLineRow[];
  expenseLines: BudgetLineRow[];
  monthlyIncome: number[];
  monthlyExpense: number[];
  annualIncome: number;
  annualExpense: number;
  monthlyProfit: number[];
  annualProfit: number;
}

export interface ConsolidatedBudget {
  year: number;
  entities: EntityBudgetSummary[];
  strategyLines: BudgetLineRow[];
  debtLines: BudgetLineRow[];
  totals: {
    monthlyIncome: number[];
    monthlyExpense: number[];
    monthlyOperatingProfit: number[];
    monthlyStrategy: number[];
    monthlyDebt: number[];
    monthlyNetAfterDistribution: number[];
    annualIncome: number;
    annualExpense: number;
    annualOperatingProfit: number;
    annualStrategy: number;
    annualDebt: number;
    annualNetAfterDistribution: number;
  };
}

export function emptyMonths(): number[] {
  return MONTH_KEYS.map(() => 0);
}

export function sumIntoMonths(target: number[], months: Record<MonthKey, number>) {
  MONTH_KEYS.forEach((k, i) => {
    target[i] = (target[i] ?? 0) + months[k];
  });
}
