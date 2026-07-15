import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";

const dateLike = z.preprocess((v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.length > 0) return new Date(v);
  return v;
}, z.date({ message: "Fecha inválida." }));

const amount = z.preprocess(
  (v) => {
    if (v === null || v === "" || v === undefined) return undefined;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
    return v;
  },
  z
    .number({ message: "Monto inválido." })
    .positive("El monto debe ser mayor a 0."),
);

const paymentMethodSchema = z.enum(
  Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]],
);

const baseExpenseFields = {
  legalEntityId: z.string().min(1, "Selecciona la razón social."),
  categoryId: z.string().min(1, "Selecciona una categoría."),
  propertyId: z.string().min(1).optional().nullable(),
  amount,
  expenseDate: dateLike,
  description: z
    .string()
    .trim()
    .min(1, "Describe el egreso.")
    .max(200, "Máximo 200 caracteres."),
  vendor: z.string().trim().max(120).optional().nullable(),
  invoiceNumber: z.string().trim().max(80).optional().nullable(),
  paymentMethod: paymentMethodSchema.optional().nullable(),
  isPaid: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
};

export const createExpenseSchema = z.object(baseExpenseFields);
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  ...baseExpenseFields,
  id: z.string().min(1, "id requerido."),
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const deleteExpenseSchema = z.object({
  id: z.string().min(1, "id requerido."),
});
export type DeleteExpenseInput = z.infer<typeof deleteExpenseSchema>;

export const registerExpenseSchema = z.object({
  id: z.string().min(1, "id requerido."),
  amount,
  paymentMethod: paymentMethodSchema.optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export type RegisterExpenseInput = z.infer<typeof registerExpenseSchema>;

export const unmarkExpensePaidSchema = z.object({
  id: z.string().min(1, "id requerido."),
});
export type UnmarkExpensePaidInput = z.infer<typeof unmarkExpensePaidSchema>;

export const markExpenseNotRequiredSchema = z.object({
  id: z.string().min(1, "id requerido."),
});
export type MarkExpenseNotRequiredInput = z.infer<
  typeof markExpenseNotRequiredSchema
>;

export const setExpenseCategoryActiveSchema = z.object({
  categoryId: z.string().min(1, "categoryId requerido."),
  isActive: z.boolean(),
});
export type SetExpenseCategoryActiveInput = z.infer<
  typeof setExpenseCategoryActiveSchema
>;
