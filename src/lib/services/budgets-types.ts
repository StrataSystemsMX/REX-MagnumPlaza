import type { BudgetConceptType } from "@/generated/prisma/enums";

export const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

export type MonthKey = typeof MONTH_KEYS[number];

export interface BudgetLineRow {
  id: string;
  conceptType: BudgetConceptType;
  conceptLabel: string;
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
