import { z } from "zod";
import { CommunicationChannel } from "@/generated/prisma/enums";
import { SPANISH_TEXT } from "./patterns";

// RFC Mexicano: 13 caracteres para persona física (4 letras + 6 dígitos + 3 alfanuméricos)
// o 12 caracteres para persona moral (3 letras + 6 dígitos + 3 alfanuméricos).
// Ver: https://www.sat.gob.mx
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i;

// Teléfono mexicano: +52 seguido de 10 dígitos. Permite espacios o guiones intermedios al capturar.
const MX_PHONE_REGEX = /^\+52\s?\d{10}$/;

const optionalString = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .or(z.literal("").transform(() => undefined));

const optionalRfc = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/\s+/g, ""))
  .refine((v) => v === "" || RFC_REGEX.test(v), {
    message: "RFC inválido. Formato esperado: 3-4 letras + 6 dígitos + 3 alfanuméricos.",
  })
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const optionalMxPhone = z
  .string()
  .trim()
  .transform((v) => {
    const digits = v.replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.length === 10) return `+52${digits}`;
    if (digits.length === 12 && digits.startsWith("52")) return `+${digits}`;
    return v;
  })
  .refine((v) => v === "" || MX_PHONE_REGEX.test(v), {
    message: "Teléfono mexicano inválido. Captura 10 dígitos.",
  })
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => v.toLowerCase())
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Correo inválido.",
  })
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const createLesseeSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(1, "La razón social es requerida.")
    .max(100, "Máximo 100 caracteres.")
    .regex(SPANISH_TEXT, "Solo letras, números y puntuación básica."),
  contactName: z
    .string()
    .trim()
    .max(50, "Máximo 50 caracteres.")
    .regex(SPANISH_TEXT, "Solo letras, números y puntuación básica.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  rfc: optionalRfc,
  email: optionalEmail,
  phone: optionalMxPhone,
  whatsapp: optionalMxPhone,
  preferredChannel: z.nativeEnum(CommunicationChannel, {
    message: "Canal preferido inválido.",
  }),
  notes: optionalString(1000, "Máximo 1000 caracteres."),
});

export type CreateLesseeInput = z.infer<typeof createLesseeSchema>;

export const updateLesseeSchema = createLesseeSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

export type UpdateLesseeInput = z.infer<typeof updateLesseeSchema>;
