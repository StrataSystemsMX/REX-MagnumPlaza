import { z } from "zod";

const REMINDER_LEVELS = ["1M", "2M", "3M"] as const;

const mxPhone = z
  .string()
  .trim()
  .transform((v) => {
    const digits = v.replace(/\D/g, "");
    if (digits.length === 10) return `+52${digits}`;
    if (digits.length === 12 && digits.startsWith("52")) return `+${digits}`;
    return v;
  })
  .refine((v) => /^\+52\s?\d{10}$/.test(v), {
    message: "Teléfono mexicano inválido. Captura 10 dígitos.",
  });

const email = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Correo inválido.",
  });

export const manualSendRentReminderSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("WHATSAPP"),
    rentId: z.string().min(1),
    level: z.enum(REMINDER_LEVELS),
    to: mxPhone,
  }),
  z.object({
    channel: z.literal("EMAIL"),
    rentId: z.string().min(1),
    level: z.enum(REMINDER_LEVELS),
    to: email,
  }),
]);

export type ManualSendRentReminderInput = z.infer<
  typeof manualSendRentReminderSchema
>;
