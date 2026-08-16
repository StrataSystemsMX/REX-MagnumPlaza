import { z } from "zod";

export const REMINDER_LEVELS = ["1M", "2M", "3M"] as const;
export type ReminderLevelValue = (typeof REMINDER_LEVELS)[number];

export const upsertReminderTemplateSchema = z.object({
  level: z.enum(REMINDER_LEVELS),
  title: z.string().trim().min(1, "Requerido.").max(120, "Máximo 120 caracteres."),
  greeting: z
    .string()
    .trim()
    .min(1, "Requerido.")
    .max(300, "Máximo 300 caracteres."),
  body: z.string().trim().min(1, "Requerido.").max(4000, "Máximo 4000 caracteres."),
  legalNote: z
    .string()
    .trim()
    .min(1, "Requerido.")
    .max(4000, "Máximo 4000 caracteres."),
  closing: z
    .string()
    .trim()
    .min(1, "Requerido.")
    .max(600, "Máximo 600 caracteres."),
});
export type UpsertReminderTemplateInput = z.infer<
  typeof upsertReminderTemplateSchema
>;

export const resetReminderTemplateSchema = z.object({
  level: z.enum(REMINDER_LEVELS),
});
export type ResetReminderTemplateInput = z.infer<
  typeof resetReminderTemplateSchema
>;
