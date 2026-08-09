import { z } from "zod";
import { LoanStatus } from "@/generated/prisma/enums";

const dateString = z
  .string()
  .min(1, "La fecha es requerida.")
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha inválida.");

export const createLoanSchema = z.object({
  name: z.string().trim().min(1, "La descripción es requerida.").max(160),
  legalEntityId: z.string().min(1, "La razón social es requerida."),
  lender: z.string().trim().max(160).nullable(),
  amount: z
    .number({ message: "Monto inválido." })
    .positive("El monto debe ser mayor a 0.")
    .finite(),
  date: dateString,
  status: z.nativeEnum(LoanStatus, { message: "Estado inválido." }),
  notes: z.string().trim().max(1000).nullable(),
});
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
