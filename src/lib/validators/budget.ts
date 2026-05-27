import { z } from "zod";
import { BudgetConceptType } from "@/generated/prisma/enums";
import { MONTH_KEYS } from "@/lib/services/budgets-types";

const monthAmount = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
  z.number().min(0),
);

export const createBudgetSchema = z.object({
  legalEntityId: z.string().min(1, "Selecciona la razón social."),
  year: z.number().int().min(2020).max(2099),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const upsertBudgetLineSchema = z.object({
  budgetId: z.string().min(1),
  lineId: z.string().optional(),
  conceptType: z.nativeEnum(BudgetConceptType),
  conceptLabel: z.string().trim().min(1, "Escribe un concepto.").max(120),
  propertyId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  months: z.object(Object.fromEntries(MONTH_KEYS.map((k) => [k, monthAmount])) as Record<
    typeof MONTH_KEYS[number],
    typeof monthAmount
  >),
});
export type UpsertBudgetLineInput = z.infer<typeof upsertBudgetLineSchema>;

export const createBudgetsBatchSchema = z.object({
  year: z.number().int().min(2020).max(2099),
  legalEntityIds: z.array(z.string().min(1)).min(1, "Selecciona al menos una razón social."),
});
export type CreateBudgetsBatchInput = z.infer<typeof createBudgetsBatchSchema>;
