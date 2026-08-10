import { z } from "zod";
import { PayrollType } from "@/generated/prisma/enums";

const dateLike = z.preprocess((v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.length > 0) return new Date(v);
  return v;
}, z.date({ message: "Fecha inválida." }));

const requiredAmount = z.preprocess(
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
    .nonnegative("El monto no puede ser negativo."),
);

const optionalAmount = z
  .preprocess(
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
      .nonnegative("El monto no puede ser negativo."),
  )
  .optional();

const NOW_YEAR = new Date().getUTCFullYear();

const yearSchema = z
  .number({ message: "Año inválido." })
  .int()
  .gte(2000, "Año demasiado antiguo.")
  .lte(NOW_YEAR + 5, "Año demasiado lejano.");

const monthSchema = z
  .number({ message: "Mes inválido." })
  .int()
  .gte(1, "Mes inválido.")
  .lte(12, "Mes inválido.");

const baseFields = {
  legalEntityId: z.string().min(1, "Selecciona la razón social."),
  year: yearSchema,
  month: monthSchema,
  type: z.nativeEnum(PayrollType, { message: "Tipo inválido." }),
  amount: requiredAmount,
  amountWithoutTax: optionalAmount,
  taxAmount: optionalAmount,
  description: z
    .string()
    .trim()
    .max(120, "Máximo 120 caracteres.")
    .optional()
    .nullable(),
  notes: z.string().max(500, "Máximo 500 caracteres.").optional().nullable(),
};

export const createPayrollSchema = z.object(baseFields);
export type CreatePayrollInput = z.infer<typeof createPayrollSchema>;

export const updatePayrollSchema = z.object({
  ...baseFields,
  id: z.string().min(1, "id requerido."),
});
export type UpdatePayrollInput = z.infer<typeof updatePayrollSchema>;

export const deletePayrollSchema = z.object({
  id: z.string().min(1, "id requerido."),
});
export type DeletePayrollInput = z.infer<typeof deletePayrollSchema>;

export { dateLike };
