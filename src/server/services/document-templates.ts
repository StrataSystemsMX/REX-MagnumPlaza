"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/get-session";
import { isMaster, PermissionError } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { logAudit } from "@/server/services/audit";
import {
  reminderConfigByLevel,
  type ReminderLevel,
  type ReminderTextConfig,
} from "@/server/pdf/template-config";
import {
  REMINDER_LEVELS,
  resetReminderTemplateSchema,
  upsertReminderTemplateSchema,
  type ResetReminderTemplateInput,
  type UpsertReminderTemplateInput,
} from "@/shared/validators/document-template";

export interface ReminderTemplateEntry {
  level: ReminderLevel;
  /** Texto por defecto (template-config.ts). */
  default: ReminderTextConfig;
  /** Texto efectivo actual (custom si existe, si no el default). */
  current: ReminderTextConfig;
  /** true si el tenant tiene una plantilla personalizada para este nivel. */
  isCustom: boolean;
}

/** Plantillas de aviso de mora efectivas del tenant (custom + defaults). */
export async function getReminderTemplates(): Promise<ReminderTemplateEntry[]> {
  const { tenantId } = await requireAuth();
  const rows = await prisma.documentTemplate.findMany({
    where: { tenantId, level: { in: [...REMINDER_LEVELS] } },
    select: {
      level: true,
      title: true,
      greeting: true,
      body: true,
      legalNote: true,
      closing: true,
    },
  });
  const byLevel = new Map(rows.map((r) => [r.level, r]));

  return REMINDER_LEVELS.map((level) => {
    const def = reminderConfigByLevel(level as ReminderLevel);
    const custom = byLevel.get(level);
    const current: ReminderTextConfig = custom
      ? {
          title: custom.title,
          greeting: custom.greeting,
          body: custom.body,
          legalNote: custom.legalNote,
          closing: custom.closing,
        }
      : def;
    return {
      level: level as ReminderLevel,
      default: def,
      current,
      isCustom: Boolean(custom),
    };
  });
}

export async function actionUpsertReminderTemplate(
  input: UpsertReminderTemplateInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  if (!(await isMaster(dbUser.id))) throw new PermissionError("template.edit");

  const data = upsertReminderTemplateSchema.parse(input);
  const { level, ...text } = data;

  await prisma.documentTemplate.upsert({
    where: { tenantId_level: { tenantId, level } },
    update: text,
    create: { tenantId, level, ...text },
  });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "UPDATE",
    entityType: "DocumentTemplate",
    entityId: level,
    changes: { level },
  });

  revalidatePath("/configuracion/notificaciones");
}

export async function actionResetReminderTemplate(
  input: ResetReminderTemplateInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  if (!(await isMaster(dbUser.id))) throw new PermissionError("template.edit");

  const { level } = resetReminderTemplateSchema.parse(input);
  await prisma.documentTemplate.deleteMany({ where: { tenantId, level } });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "DELETE",
    entityType: "DocumentTemplate",
    entityId: level,
    changes: { level, reset: true },
  });

  revalidatePath("/configuracion/notificaciones");
}
