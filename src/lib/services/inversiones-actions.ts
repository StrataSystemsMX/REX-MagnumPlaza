"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { logAudit } from "@/lib/services/audit";
import {
  createInvestmentProjectSchema,
  registerInvestmentPaymentSchema,
  type CreateInvestmentProjectInput,
  type RegisterInvestmentPaymentInput,
} from "@/lib/validators/investment";

export async function actionCreateInvestmentProject(
  input: CreateInvestmentProjectInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "investment.create");

  const data = createInvestmentProjectSchema.parse(input);

  const le = await prisma.legalEntity.findFirst({
    where: { id: data.legalEntityId, tenantId },
    select: { id: true },
  });
  if (!le) throw new Error("Razón social no encontrada.");

  if (data.propertyId) {
    const prop = await prisma.property.findFirst({
      where: { id: data.propertyId, tenantId },
      select: { id: true },
    });
    if (!prop) throw new Error("Inmueble no encontrado.");
  }

  const project = await prisma.investmentProject.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description || null,
      legalEntityId: data.legalEntityId,
      propertyId: data.propertyId || null,
      budgetAmount: new Prisma.Decimal(data.budgetAmount.toFixed(2)),
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      status: data.status,
      notes: data.notes || null,
    },
  });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "CREATE",
    entityType: "InvestmentProject",
    entityId: project.id,
    changes: {
      name: data.name,
      legalEntityId: data.legalEntityId,
      budgetAmount: data.budgetAmount,
      status: data.status,
    },
  });

  revalidatePath("/inversiones");
}

export async function actionRegisterInvestmentPayment(
  input: RegisterInvestmentPaymentInput,
): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "investment.update");

  const data = registerInvestmentPaymentSchema.parse(input);

  const project = await prisma.investmentProject.findFirst({
    where: { id: data.projectId, tenantId },
    select: { id: true },
  });
  if (!project) throw new Error("Proyecto no encontrado.");

  // Pago + recálculo de executedAmount en una sola transacción: un fallo a
  // medias no debe dejar el avance del proyecto desincronizado.
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.investmentPayment.create({
      data: {
        tenantId,
        projectId: data.projectId,
        description: data.description,
        amount: new Prisma.Decimal(data.amount.toFixed(2)),
        paymentDate: new Date(data.paymentDate),
        isPaid: data.isPaid,
        notes: data.notes || null,
      },
    });

    const paid = await tx.investmentPayment.aggregate({
      where: { tenantId, projectId: data.projectId, isPaid: true },
      _sum: { amount: true },
    });
    await tx.investmentProject.updateMany({
      where: { id: data.projectId, tenantId },
      data: { executedAmount: paid._sum.amount ?? new Prisma.Decimal(0) },
    });

    return created;
  });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "CREATE",
    entityType: "InvestmentPayment",
    entityId: payment.id,
    changes: {
      projectId: data.projectId,
      description: data.description,
      amount: data.amount,
      isPaid: data.isPaid,
    },
  });

  revalidatePath("/inversiones");
}
