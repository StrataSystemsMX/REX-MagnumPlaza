"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createPropertySchema,
  updatePropertySchema,
  type CreatePropertyInput,
  type UpdatePropertyInput,
} from "@/lib/validators/property";
import type { PropertyModel } from "@/generated/prisma/models";
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
      entityType: "Property",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

export async function actionCreateProperty(
  input: CreatePropertyInput,
): Promise<PropertyModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.create");

  const data = createPropertySchema.parse(input);

  const property = await prisma.property.create({
    data: { ...data, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", property.id, {
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath("/properties");
  return property;
}

export async function actionUpdateProperty(
  id: string,
  input: UpdatePropertyInput,
): Promise<PropertyModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.update");

  const data = updatePropertySchema.parse(input);

  const result = await prisma.property.updateMany({
    where: { id, tenantId },
    data,
  });
  if (result.count === 0) {
    throw new Error("Inmueble no encontrado o fuera de tu tenant.");
  }

  const updated = await prisma.property.findFirstOrThrow({
    where: { id, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return updated;
}

export async function actionDeleteProperty(id: string): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.delete");

  const result = await prisma.property.updateMany({
    where: { id, tenantId },
    data: { isActive: false },
  });
  if (result.count === 0) {
    throw new Error("Inmueble no encontrado o fuera de tu tenant.");
  }

  await logAudit(tenantId, dbUser.id, "DELETE", id, { soft: true });

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
}
