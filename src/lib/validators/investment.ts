import { z } from "zod";
import { InvestmentProjectStatus } from "@/generated/prisma/enums";

/** Fecha en string (la UI manda `YYYY-MM-DD` o ISO). */
const dateString = z
  .string()
  .min(1, "La fecha es requerida.")
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha inválida.");

export const createInvestmentProjectSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido.").max(160),
  description: z.string().trim().max(1000).nullable(),
  legalEntityId: z.string().min(1, "La razón social es requerida."),
  propertyId: z.string().min(1).nullable(),
  budgetAmount: z
    .number({ message: "Presupuesto inválido." })
    .nonnegative("El presupuesto no puede ser negativo.")
    .finite(),
  startDate: dateString,
  endDate: dateString.nullable(),
  status: z.nativeEnum(InvestmentProjectStatus, { message: "Estado inválido." }),
  notes: z.string().trim().max(1000).nullable(),
});
export type CreateInvestmentProjectInput = z.infer<typeof createInvestmentProjectSchema>;

export const registerInvestmentPaymentSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().trim().min(1, "La descripción es requerida.").max(300),
  amount: z
    .number({ message: "Monto inválido." })
    .positive("El monto debe ser mayor a 0.")
    .finite(),
  paymentDate: dateString,
  isPaid: z.boolean(),
  notes: z.string().trim().max(1000).nullable(),
});
export type RegisterInvestmentPaymentInput = z.infer<typeof registerInvestmentPaymentSchema>;
