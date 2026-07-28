"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { logAudit as logAuditCore } from "@/lib/services/audit";
import {
  createMaintenanceSchema,
  updateMaintenanceSchema,
  updateMaintenanceStatusSchema,
  type CreateMaintenanceInput,
  type UpdateMaintenanceInput,
  type UpdateMaintenanceStatusInput,
} from "@/lib/validators/maintenance";

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
) {
  await logAuditCore({ tenantId, userId, action, entityType: "Maintenance", entityId, changes });
}

export async function actionCreateMaintenance(input: CreateMaintenanceInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  const data = createMaintenanceSchema.parse(input);

  const property = await prisma.property.findFirstOrThrow({
    where: { id: data.propertyId, tenantId },
    select: { id: true, name: true, managerEntityId: true },
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

  // Refleja el mantenimiento manual como egreso de la razón social que
  // administra/factura la propiedad. Se enlaza con `[maintenance:<id>]` en
  // notes para futuras sincronizaciones.
  if (data.cost !== undefined && data.cost > 0) {
    const category = await prisma.expenseCategory.findFirst({
      where: { tenantId, code: "MANTENIMIENTO_PLAZAS" },
      select: { id: true },
    });

    if (category) {
      let unitCode: string | null = null;
      if (data.unitId) {
        const unit = await prisma.unit.findFirst({
          where: { id: data.unitId, tenantId },
          select: { code: true },
        });
        unitCode = unit?.code ?? null;
      }

      const locator = unitCode
        ? `${property.name} ${unitCode}`
        : property.name;

      await prisma.expense.create({
        data: {
          tenantId,
          legalEntityId: property.managerEntityId,
          categoryId: category.id,
          propertyId: data.propertyId,
          amount: new Prisma.Decimal(data.cost),
          expenseDate: data.scheduledDate ?? new Date(),
          description: `Mantenimiento: ${data.title} — ${locator}`,
          vendor: data.vendor ?? null,
          isPaid: false,
          notes: `Generado desde mantenimiento [maintenance:${maintenance.id}]`,
        },
      });
    }
  }

  await logAudit(tenantId, dbUser.id, "CREATE", maintenance.id, {
    title: data.title,
    type: data.type,
    propertyId: data.propertyId,
  });

  revalidatePath("/mantenimientos");
  revalidatePath("/egresos");
  revalidateTag(`kpi-${tenantId}`);
  return maintenance;
}

export async function actionUpdateMaintenance(input: UpdateMaintenanceInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  const data = updateMaintenanceSchema.parse(input);

  const existing = await prisma.maintenance.findFirstOrThrow({
    where: { id: data.maintenanceId, tenantId },
    select: { id: true, status: true, completedDate: true },
  });

  await prisma.property.findFirstOrThrow({
    where: { id: data.propertyId, tenantId },
    select: { id: true },
  });

  // Si se pasa a COMPLETED y no tenía fecha, ponemos hoy. Si se cambia a un
  // estado distinto de COMPLETED, limpiamos la fecha.
  const completedDate =
    data.status === "COMPLETED"
      ? existing.completedDate ?? new Date()
      : null;

  const updated = await prisma.maintenance.update({
    where: { id: existing.id },
    data: {
      propertyId: data.propertyId,
      unitId: data.unitId ?? null,
      title: data.title,
      description: data.description ?? null,
      type: data.type,
      responsibility: data.responsibility,
      status: data.status,
      completedDate,
      scheduledDate: data.scheduledDate ?? null,
      vendor: data.vendor ?? null,
      cost: data.cost !== undefined ? new Prisma.Decimal(data.cost) : null,
      notes: data.notes ?? null,
    },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", existing.id, {
    title: data.title,
    type: data.type,
    propertyId: data.propertyId,
    previousStatus: existing.status,
    newStatus: data.status,
  });

  revalidatePath("/mantenimientos");
  revalidateTag(`kpi-${tenantId}`);
  return updated;
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
  revalidateTag(`kpi-${tenantId}`);
  return updated;
}
