"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createUnitSchema,
  updateUnitSchema,
  type CreateUnitInput,
  type UpdateUnitInput,
} from "@/lib/validators/unit";
import type { UnitModel } from "@/generated/prisma/models";
import type { Prisma } from "@/generated/prisma/client";

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action,
      entityType: "Unit",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

async function ensurePropertyInTenant(propertyId: string, tenantId: string): Promise<void> {
  const exists = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
  if (!exists) {
    throw new Error("El inmueble no existe en tu tenant.");
  }
}

export async function actionCreateUnit(input: CreateUnitInput): Promise<UnitModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "unit.create");

  const data = createUnitSchema.parse(input);
  await ensurePropertyInTenant(data.propertyId, tenantId);

  const unit = await prisma.unit.create({
    data: { ...data, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", unit.id, {
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath(`/properties/${data.propertyId}`);
  revalidatePath("/plazas");
  revalidatePath("/inmuebles");
  return unit;
}

export async function actionUpdateUnit(
  id: string,
  input: UpdateUnitInput,
): Promise<UnitModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "unit.update");

  const data = updateUnitSchema.parse(input);
  if (data.propertyId) {
    await ensurePropertyInTenant(data.propertyId, tenantId);
  }

  const result = await prisma.unit.updateMany({
    where: { id, tenantId },
    data,
  });
  if (result.count === 0) {
    throw new Error("Unidad no encontrada o fuera de tu tenant.");
  }

  const updated = await prisma.unit.findFirstOrThrow({
    where: { id, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath(`/properties/${updated.propertyId}`);
  revalidatePath("/plazas");
  revalidatePath("/inmuebles");
  return updated;
}

export async function actionDeleteUnit(id: string): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "unit.delete");

  const target = await prisma.unit.findFirst({
    where: { id, tenantId },
    select: { id: true, propertyId: true },
  });
  if (!target) {
    throw new Error("Unidad no encontrada o fuera de tu tenant.");
  }

  await prisma.unit.updateMany({
    where: { id, tenantId },
    data: { isActive: false },
  });

  await logAudit(tenantId, dbUser.id, "DELETE", id, { soft: true });

  revalidatePath(`/properties/${target.propertyId}`);
  revalidatePath("/plazas");
  revalidatePath("/inmuebles");
}
