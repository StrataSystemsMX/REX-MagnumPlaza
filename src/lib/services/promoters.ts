"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  createPromoterLinkSchema,
  createPromoterSchema,
  type CreatePromoterInput,
  type CreatePromoterLinkInput,
} from "@/lib/validators/promoter";
import { randomBytes } from "crypto";

export async function actionCreatePromoter(input: CreatePromoterInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

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

  revalidatePath("/promotores");
  return promoter;
}

export async function actionCreatePromoterLink(input: CreatePromoterLinkInput) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  const data = createPromoterLinkSchema.parse(input);

  await prisma.promoter.findFirstOrThrow({
    where: { id: data.promoterId, tenantId },
    select: { id: true },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

  const publicToken = randomBytes(16).toString("hex");

  await prisma.promoterLink.create({
    data: {
      tenantId,
      promoterId: data.promoterId,
      unitId: data.unitId,
      publicToken,
      expiresAt,
    },
  });

  revalidatePath("/promotores");
  return { publicToken };
}

export async function actionDeactivatePromoterLink(linkId: string) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  await prisma.promoterLink.updateMany({
    where: { id: linkId, tenantId },
    data: { isActive: false },
  });

  revalidatePath("/promotores");
}

export async function actionTogglePromoterActive(promoterId: string, isActive: boolean) {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.update");

  await prisma.promoter.updateMany({
    where: { id: promoterId, tenantId },
    data: { isActive },
  });

  revalidatePath("/promotores");
}
