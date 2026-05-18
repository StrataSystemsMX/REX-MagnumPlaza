"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createMaintenanceSchema,
  updateMaintenanceStatusSchema,
  type CreateMaintenanceInput,
  type UpdateMaintenanceStatusInput,
} from "@/lib/validators/maintenance";

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
) {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType: "Maintenance",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

export async function actionCreateMaintenance(input: CreateMaintenanceInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  const data = createMaintenanceSchema.parse(input);

  await prisma.property.findFirstOrThrow({
    where: { id: data.propertyId, tenantId },
    select: { id: true },
  });

  const maintenance = await prisma.maintenance.create({
    data: {
      tenantId,
      propertyId: data.propertyId,
      unitId: data.unitId ?? null,
      title: data.title,
      description: data.description ?? null,
      type: data.type,
      responsibility: data.responsibility,
      status: "PLANNED",
      scheduledDate: data.scheduledDate ?? null,
      vendor: data.vendor ?? null,
      cost: data.cost !== undefined ? new Prisma.Decimal(data.cost) : null,
      isRecurring: data.isRecurring,
      notes: data.notes ?? null,
    },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", maintenance.id, {
    title: data.title,
    type: data.type,
    propertyId: data.propertyId,
  });

  revalidatePath("/mantenimientos");
  return maintenance;
}

export async function actionUpdateMaintenanceStatus(input: UpdateMaintenanceStatusInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  const data = updateMaintenanceStatusSchema.parse(input);

  const existing = await prisma.maintenance.findFirstOrThrow({
    where: { id: data.maintenanceId, tenantId },
    select: { id: true, status: true },
  });

  const updated = await prisma.maintenance.update({
    where: { id: data.maintenanceId },
    data: {
      status: data.status,
      ...(data.status === "COMPLETED"
        ? { completedDate: data.completedDate ?? new Date() }
        : {}),
      ...(data.cost !== undefined ? { cost: new Prisma.Decimal(data.cost) } : {}),
      ...(data.notes ? { notes: data.notes } : {}),
    },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", existing.id, {
    previousStatus: existing.status,
    newStatus: data.status,
  });

  revalidatePath("/mantenimientos");
  return updated;
}
