"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createLesseeSchema,
  updateLesseeSchema,
  type CreateLesseeInput,
  type UpdateLesseeInput,
} from "@/lib/validators/lessee";
import type { LesseeModel } from "@/generated/prisma/models";
import type { Prisma } from "@/generated/prisma/client";

export interface LesseeSearchResult {
  id: string;
  legalName: string;
  contactName: string | null;
  rfc: string | null;
}

/** Server Action wrapper para autocompletes en formularios client-side. */
export async function actionSearchLessees(
  query: string,
  limit = 10,
): Promise<LesseeSearchResult[]> {
  const { tenantId } = await requireAuth();
  const q = query.trim();
  const where: Prisma.LesseeWhereInput = { tenantId, isActive: true };
  if (q.length > 0) {
    where.OR = [
      { legalName: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { rfc: { contains: q, mode: "insensitive" } },
    ];
  }
  return prisma.lessee.findMany({
    where,
    orderBy: { legalName: "asc" },
    take: limit,
    select: { id: true, legalName: true, contactName: true, rfc: true },
  });
}

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
      entityType: "Lessee",
      entityId,
      ...(changes === null ? {} : { changes }),
    },
  });
}

export async function actionCreateLessee(
  input: CreateLesseeInput,
): Promise<LesseeModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "lessee.create");

  const data = createLesseeSchema.parse(input);

  const lessee = await prisma.lessee.create({
    data: { ...data, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "CREATE", lessee.id, {
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath("/lessees");
  return lessee;
}

export async function actionUpdateLessee(
  id: string,
  input: UpdateLesseeInput,
): Promise<LesseeModel> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "lessee.update");

  const data = updateLesseeSchema.parse(input);

  const result = await prisma.lessee.updateMany({
    where: { id, tenantId },
    data,
  });
  if (result.count === 0) {
    throw new Error("Inquilino no encontrado o fuera de tu tenant.");
  }

  const updated = await prisma.lessee.findFirstOrThrow({
    where: { id, tenantId },
  });

  await logAudit(tenantId, dbUser.id, "UPDATE", id, {
    after: data as unknown as Prisma.InputJsonValue,
  });

  revalidatePath("/lessees");
  revalidatePath(`/lessees/${id}`);
  return updated;
}

export async function actionDeleteLessee(id: string): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "lessee.delete");

  const result = await prisma.lessee.updateMany({
    where: { id, tenantId },
    data: { isActive: false },
  });
  if (result.count === 0) {
    throw new Error("Inquilino no encontrado o fuera de tu tenant.");
  }

  await logAudit(tenantId, dbUser.id, "DELETE", id, { soft: true });

  revalidatePath("/lessees");
  revalidatePath(`/lessees/${id}`);
}
