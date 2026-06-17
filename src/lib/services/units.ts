"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { logAudit as logAuditCore } from "@/lib/services/audit";
import {
  createUnitSchema,
  updateUnitSchema,
  type CreateUnitInput,
  type UpdateUnitInput,
} from "@/lib/validators/unit";
import { serializeDecimals, type Serialized } from "@/lib/utils/serialize-decimals";
import type { UnitModel } from "@/generated/prisma/models";
import type { Prisma } from "@/generated/prisma/client";

async function logAudit(
  tenantId: string,
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityId: string,
  changes: Prisma.InputJsonValue | null = null,
): Promise<void> {
  await logAuditCore({ tenantId, userId, action, entityType: "Unit", entityId, changes });
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

/**
 * Valida las invariantes para agrupar una Unit bajo un padre.
 *
 * - Padre existe en el mismo tenant + mismo propertyId.
 * - Padre no es la misma unit (no self-reference).
 * - Padre no es a su vez hijo (no chains, max 1 nivel).
 * - La unit hija no tiene sus propios children (un hijo no puede tener hijos).
 * - La unit hija no tiene Contract ACTIVE.
 * - La unit hija no tiene PromoterLink vigente.
 *
 * Pasa `childUnitId = undefined` si la unit todavía no existe (caso create);
 * solo se validan las invariantes que aplican al padre.
 */
async function validateParentUnit(
  childUnitId: string | undefined,
  parentUnitId: string,
  tenantId: string,
  expectedPropertyId: string,
): Promise<void> {
  if (childUnitId && parentUnitId === childUnitId) {
    throw new Error("Un local no puede ser padre de sí mismo.");
  }

  const parent = await prisma.unit.findFirst({
    where: { id: parentUnitId, tenantId },
    select: { id: true, propertyId: true, parentUnitId: true },
  });
  if (!parent) {
    throw new Error("El local padre no existe en tu tenant.");
  }
  if (parent.propertyId !== expectedPropertyId) {
    throw new Error("El local padre debe estar en el mismo inmueble.");
  }
  if (parent.parentUnitId != null) {
    throw new Error(
      "No se permiten cadenas: el local padre ya está agrupado bajo otro.",
    );
  }

  if (!childUnitId) return;

  const [childCount, activeContractCount, activeLinkCount] = await Promise.all([
    prisma.unit.count({ where: { tenantId, parentUnitId: childUnitId } }),
    prisma.contract.count({
      where: { tenantId, unitId: childUnitId, status: "ACTIVE" },
    }),
    prisma.promoterLink.count({
      where: {
        tenantId,
        unitId: childUnitId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);
  if (childCount > 0) {
    throw new Error(
      "Este local ya tiene otros agrupados bajo él; no puede ser hijo de otro.",
    );
  }
  if (activeContractCount > 0) {
    throw new Error(
      "El local tiene un contrato activo; rescíndelo antes de agruparlo.",
    );
  }
  if (activeLinkCount > 0) {
    throw new Error(
      "El local tiene un link público activo; desactívalo antes de agruparlo.",
    );
  }
}

export async function actionCreateUnit(
  input: CreateUnitInput,
): Promise<Serialized<UnitModel>> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "unit.create");

  const data = createUnitSchema.parse(input);
  await ensurePropertyInTenant(data.propertyId, tenantId);
  if (data.parentUnitId) {
    await validateParentUnit(undefined, data.parentUnitId, tenantId, data.propertyId);
  }

  const unit = await prisma.unit.create({
    data: { ...data, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", unit.id, {
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath(`/properties/${data.propertyId}`);
  revalidatePath("/plazas");
  revalidatePath("/inmuebles");
  return serializeDecimals(unit);
}

export async function actionUpdateUnit(
  id: string,
  input: UpdateUnitInput,
): Promise<Serialized<UnitModel>> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "unit.update");

  const parsed = updateUnitSchema.parse(input);
  if (parsed.propertyId) {
    await ensurePropertyInTenant(parsed.propertyId, tenantId);
  }

  // Si se pidió cambiar parentUnitId a un valor concreto, validar invariantes.
  // null = desagrupar; pasa sin validación (siempre seguro).
  if (parsed.parentUnitId) {
    const current = await prisma.unit.findFirst({
      where: { id, tenantId },
      select: { propertyId: true },
    });
    if (!current) {
      throw new Error("Unidad no encontrada o fuera de tu tenant.");
    }
    await validateParentUnit(id, parsed.parentUnitId, tenantId, current.propertyId);
  }

  // updateMany no acepta FK scalars (propertyId); mover una Unit entre
  // inmuebles no es soportado por esta acción. Lo descartamos del payload.
  const { propertyId: _ignored, ...data } = parsed;
  void _ignored;

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
  return serializeDecimals(updated);
}

/**
 * Desagrupa una unit: limpia su parentUnitId. Solo aplica a child units;
 * llamarla sobre una unit que no es child es no-op silencioso.
 */
export async function actionUngroupUnit(childUnitId: string): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "unit.update");

  const target = await prisma.unit.findFirst({
    where: { id: childUnitId, tenantId },
    select: { id: true, propertyId: true, parentUnitId: true },
  });
  if (!target) {
    throw new Error("Unidad no encontrada o fuera de tu tenant.");
  }
  if (target.parentUnitId == null) {
    return; // ya está desagrupada
  }

  await prisma.unit.updateMany({
    where: { id: childUnitId, tenantId },
    data: { parentUnitId: null },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", childUnitId, {
    ungroupedFrom: target.parentUnitId,
  });

  revalidatePath(`/properties/${target.propertyId}`);
  revalidatePath("/plazas");
  revalidatePath("/inmuebles");
}

/**
 * Garantiza que un inmueble individual tenga al menos una unidad activa y disponible.
 * Si ya existe, devuelve su ID sin tocar nada.
 * Si no, la crea automáticamente — transparente para el usuario.
 * Solo aplica a propiedades que no son PLAZA_COMERCIAL.
 */
export async function actionEnsureInmuebleUnit(propertyId: string): Promise<string> {
  const { tenantId, dbUser } = await requireAuth();

  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId, isActive: true },
    select: { id: true, type: true, name: true },
  });
  if (!property) throw new Error("Inmueble no encontrado.");
  if (property.type === "PLAZA_COMERCIAL") {
    throw new Error("Esta acción es solo para inmuebles individuales.");
  }

  const existing = await prisma.unit.findFirst({
    where: {
      tenantId,
      propertyId,
      isActive: true,
      status: { in: ["DISPONIBLE", "APARTADA"] },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const unit = await prisma.unit.create({
    data: {
      tenantId,
      propertyId,
      code: "U1",
      name: property.name,
      status: "DISPONIBLE",
      isActive: true,
    },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", unit.id, { auto: true });
  revalidatePath("/plazas");

  return unit.id;
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
