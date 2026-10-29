"use server";

import { requireAuth } from "@/server/auth/get-session";
import { hasPermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { getMobilePayableRents, type MobileRent } from "@/server/services/mobile-queries";
import { shortPropertyName } from "@/shared/mobile/format";

export interface MobileCaptureOptions {
  rents: MobileRent[];
  /** Categorías de egreso activas (sin nómina), las más usadas primero. */
  categories: Array<{ id: string; name: string }>;
  legalEntities: Array<{ id: string; code: string }>;
  properties: Array<{ id: string; name: string; managerEntityId: string }>;
  /** Si el tenant ya manda la confirmación de pago solo (Configuración). */
  autoSendPaymentConfirmations: boolean;
}

/**
 * Datos para los sheets de captura del móvil (pago, egreso, mantenimiento).
 * Se piden al abrir el sheet "+" en lugar de en cada render del layout.
 */
export async function actionGetMobileCaptureOptions(): Promise<MobileCaptureOptions> {
  const { tenantId, dbUser } = await requireAuth();

  const [canPay, canExpense] = await Promise.all([
    hasPermission(dbUser.id, "payment.register"),
    hasPermission(dbUser.id, "expense.create"),
  ]);

  const yearAgo = new Date();
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);

  const [rents, categories, usage, legalEntities, properties, tenant] = await Promise.all([
    canPay ? getMobilePayableRents() : Promise.resolve([]),
    canExpense
      ? prisma.expenseCategory.findMany({
          where: { tenantId, isActive: true, type: { not: "PAYROLL" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canExpense
      ? prisma.expense.groupBy({
          by: ["categoryId"],
          where: { tenantId, expenseDate: { gte: yearAgo } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.legalEntity.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true },
    }),
    prisma.property.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, managerEntityId: true },
    }),
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { autoSendPaymentConfirmations: true },
    }),
  ]);

  const usageByCategory = new Map(usage.map((u) => [u.categoryId, u._count._all]));
  const sortedCategories = [...categories].sort(
    (a, b) => (usageByCategory.get(b.id) ?? 0) - (usageByCategory.get(a.id) ?? 0),
  );

  return {
    rents,
    categories: sortedCategories,
    legalEntities,
    properties: properties.map((p) => ({ ...p, name: shortPropertyName(p.name) })),
    autoSendPaymentConfirmations: tenant.autoSendPaymentConfirmations,
  };
}
