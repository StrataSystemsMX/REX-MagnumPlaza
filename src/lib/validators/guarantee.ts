import { z } from "zod";

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
  z.number({ message: "Monto inválido." }).positive("El monto debe ser mayor a 0."),
);

export const createGuaranteeSchema = z.object({
  contractId: z.string().min(1, "Selecciona un contrato."),
  amount,
  receivedDate: dateLike,
  notes: z.string().max(500).optional().nullable(),
});
export type CreateGuaranteeInput = z.infer<typeof createGuaranteeSchema>;

const deductionItem = z.object({
  concept: z.string().min(1),
  amount: z.number().positive(),
});

export const returnGuaranteeSchema = z.object({
  guaranteeId: z.string().min(1),
  returnedDate: dateLike,
  returnedAmount: amount,
  deductions: z.array(deductionItem).default([]),
  notes: z.string().max(500).optional().nullable(),
});
export type ReturnGuaranteeInput = z.infer<typeof returnGuaranteeSchema>;
