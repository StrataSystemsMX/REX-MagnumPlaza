"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/get-session";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { logAudit as logAuditCore } from "@/server/services/audit";
import { serializeFields } from "@/shared/audit/field-types";
import {
  createPropertySchema,
  updatePropertySchema,
  type CreatePropertyInput,
  type UpdatePropertyInput,
} from "@/shared/validators/property";
import type { PropertyModel } from "@/generated/prisma/models";
import type { Prisma } from "@/generated/prisma/client";

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
): Promise<void> {
  await logAuditCore({ tenantId, userId, action, entityType: "Property", entityId, changes });
}

export async function actionCreateProperty(
  input: CreatePropertyInput,
): Promise<PropertyModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.create");

  const data = createPropertySchema.parse(input);

  // Las plazas comerciales agrupan varios locales que se capturan después; sus
  // unidades se crean una por una en el detalle. En cambio, un inmueble
  // individual (oficina, edificio, bodega, espectacular, etc.) ES en sí mismo
  // el espacio rentable, así que le creamos su única unidad de inmediato. Sin
  // esto, el inmueble nunca tendría una Unit y no podría contratarse (un
  // contrato se asocia a una Unit, no a una Property).
  const property = await prisma.$transaction(async (tx) => {
    const created = await tx.property.create({
      data: { ...data, tenantId },
    });

    if (created.type !== "PLAZA_COMERCIAL") {
      // El código "LP" es solo un valor interno requerido por el schema; en la
      // UI un inmueble individual se identifica por su nombre, nunca por este
      // código (ver src/lib/i18n/unit-label.ts → unitLabel/unitWithProperty).
      await tx.unit.create({
        data: {
          tenantId,
          propertyId: created.id,
          code: "LP",
          status: "DISPONIBLE",
        },
      });
    }

    return created;
  });

  await logAudit(tenantId, dbUser.id, "CREATE", property.id, {
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath("/plazas");
  revalidatePath("/inmuebles");
  return property;
}

export async function actionUpdateProperty(
  id: string,
  input: UpdatePropertyInput,
): Promise<PropertyModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "property.update");

  const data = updatePropertySchema.parse(input);

  // Snapshot previo para poder revertir la edición desde el historial.
  const prev = await prisma.property.findFirst({ where: { id, tenantId } });
  if (!prev) {
    throw new Error("Inmueble no encontrado o fuera de tu tenant.");
  }

  await prisma.property.updateMany({
    where: { id, tenantId },
    data,
  });

  const updated = await prisma.property.findFirstOrThrow({
    where: { id, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    before: serializeFields(
      prev as unknown as Record<string, unknown>,
      Object.keys(data),
    ) as Prisma.InputJsonValue,
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath("/plazas");
  revalidatePath("/inmuebles");
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

  revalidatePath("/plazas");
  revalidatePath("/inmuebles");
  revalidatePath(`/properties/${id}`);
}
