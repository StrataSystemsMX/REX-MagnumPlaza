import { z } from "zod";
import { DIGITS_ONLY, SPANISH_TEXT } from "./patterns";

export const createPromoterSchema = z.object({
  fullName: z.string().trim().min(1, "Ingresa el nombre.").max(50).regex(SPANISH_TEXT, "Solo letras, números y puntuación básica."),
  phone: z.string().trim().min(10, "Teléfono inválido.").max(15).regex(DIGITS_ONLY, "Solo dígitos."),
  email: z.string().email("Email inválido.").max(100).optional().nullable().or(z.literal("")),
  agency: z.string().trim().max(60).regex(SPANISH_TEXT, "Solo letras, números y puntuación básica.").optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
});
export type CreatePromoterInput = z.infer<typeof createPromoterSchema>;

export const createPromoterLinkSchema = z.object({
  promoterId: z.string().min(1),
  unitId: z.string().min(1, "Selecciona un local."),
  expiresInDays: z.number().int().min(1).max(365).default(30),
});
export type CreatePromoterLinkInput = z.infer<typeof createPromoterLinkSchema>;

// Captura pública de un interesado desde la página de la vacante ("Me interesa").
// El token identifica la liga; tenantId/promoterLinkId se derivan en el servidor.
export const captureLeadSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/i, "Token inválido."),
  name: z
    .string()
    .trim()
    .min(1, "Ingresa tu nombre.")
    .max(120, "Máximo 120 caracteres."),
  phone: z
    .string()
    .trim()
    .min(10, "Teléfono inválido.")
    .max(20, "Teléfono inválido.")
    .regex(DIGITS_ONLY, "Solo dígitos."),
  email: z
    .string()
    .trim()
    .email("Email inválido.")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type CaptureLeadInput = z.infer<typeof captureLeadSchema>;
