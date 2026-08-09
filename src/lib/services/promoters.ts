"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { logAudit } from "@/lib/services/audit";
import {
  createPromoterLinkSchema,
  createPromoterSchema,
  type CreatePromoterInput,
  type CreatePromoterLinkInput,
} from "@/lib/validators/promoter";
import { randomBytes } from "crypto";

export async function actionCreatePromoter(input: CreatePromoterInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "promoter.create");

  const data = createPromoterSchema.parse(input);

  const promoter = await prisma.promoter.create({
    data: {
      tenantId,
      fullName: data.fullName,
      phone: data.phone,
      email: data.email || null,
      agency: data.agency || null,
      notes: data.notes || null,
    },
  });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "CREATE",
    entityType: "Promoter",
    entityId: promoter.id,
    changes: { fullName: data.fullName, agency: data.agency || null },
  });

  revalidatePath("/promotores");
  return promoter;
}

export async function actionCreatePromoterLink(input: CreatePromoterLinkInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "promoter.create");

  const data = createPromoterLinkSchema.parse(input);

  await prisma.promoter.findFirstOrThrow({
    where: { id: data.promoterId, tenantId },
    select: { id: true },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

  const publicToken = randomBytes(16).toString("hex");

  const link = await prisma.promoterLink.create({
    data: {
      tenantId,
      promoterId: data.promoterId,
      unitId: data.unitId,
      publicToken,
      expiresAt,
    },
  });

  // Crear una liga pública expone datos del local a internet: se audita.
  // NUNCA se guarda el token en el log.
  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "CREATE",
    entityType: "PromoterLink",
    entityId: link.id,
    changes: {
      promoterId: data.promoterId,
      unitId: data.unitId,
      expiresAt: expiresAt.toISOString(),
    },
  });

  revalidatePath("/promotores");
  return { publicToken };
}

export async function actionDeactivatePromoterLink(linkId: string) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "promoter.update");

  await prisma.promoterLink.updateMany({
    where: { id: linkId, tenantId },
    data: { isActive: false },
  });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "UPDATE",
    entityType: "PromoterLink",
    entityId: linkId,
    changes: { isActive: false },
  });

  revalidatePath("/promotores");
}

export async function actionTogglePromoterActive(promoterId: string, isActive: boolean) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "promoter.update");

  await prisma.promoter.updateMany({
    where: { id: promoterId, tenantId },
    data: { isActive },
  });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "UPDATE",
    entityType: "Promoter",
    entityId: promoterId,
    changes: { isActive },
  });

  revalidatePath("/promotores");
}
