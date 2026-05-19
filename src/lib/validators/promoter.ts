import { z } from "zod";

export const createPromoterSchema = z.object({
  fullName: z.string().trim().min(1, "Ingresa el nombre.").max(120),
  phone: z.string().trim().min(10, "Teléfono inválido.").max(20),
  email: z.string().email("Email inválido.").optional().nullable().or(z.literal("")),
  agency: z.string().trim().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export type CreatePromoterInput = z.infer<typeof createPromoterSchema>;

export const createPromoterLinkSchema = z.object({
  promoterId: z.string().min(1),
  unitId: z.string().min(1, "Selecciona un local."),
  expiresInDays: z.number().int().min(1).max(365).default(30),
});
export type CreatePromoterLinkInput = z.infer<typeof createPromoterLinkSchema>;
