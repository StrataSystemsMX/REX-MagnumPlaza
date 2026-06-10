"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import type { InvestmentProjectStatus } from "@/generated/prisma/enums";

export async function actionCreateInvestmentProject(input: {
  name: string;
  description: string | null;
  legalEntityId: string;
  propertyId: string | null;
  budgetAmount: number;
  startDate: string;
  endDate: string | null;
  status: InvestmentProjectStatus;
  notes: string | null;
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  if (!input.name.trim()) throw new Error("El nombre es requerido.");
  if (!input.legalEntityId) throw new Error("La razón social es requerida.");
  if (!Number.isFinite(input.budgetAmount) || input.budgetAmount < 0)
    throw new Error("Presupuesto inválido.");
  if (!input.startDate) throw new Error("La fecha de inicio es requerida.");

  // Validate legalEntity belongs to tenant
  const le = await prisma.legalEntity.findFirst({
    where: { id: input.legalEntityId, tenantId },
    select: { id: true },
  });
  if (!le) throw new Error("Razón social no encontrada.");

  await prisma.investmentProject.create({
    data: {
      tenantId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      legalEntityId: input.legalEntityId,
      propertyId: input.propertyId || null,
      budgetAmount: input.budgetAmount,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      status: input.status,
      notes: input.notes?.trim() || null,
    },
  });

  revalidatePath("/inversiones");
}

export async function actionRegisterInvestmentPayment(input: {
  projectId: string;
  description: string;
  amount: number;
  paymentDate: string;
  isPaid: boolean;
  notes: string | null;
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  if (!input.description.trim()) throw new Error("La descripción es requerida.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Monto inválido.");
  if (!input.paymentDate) throw new Error("La fecha es requerida.");

  const project = await prisma.investmentProject.findFirst({
    where: { id: input.projectId, tenantId },
    select: { id: true },
  });
  if (!project) throw new Error("Proyecto no encontrado.");

  await prisma.investmentPayment.create({
    data: {
      tenantId,
      projectId: input.projectId,
      description: input.description.trim(),
      amount: input.amount,
      paymentDate: new Date(input.paymentDate),
      isPaid: input.isPaid,
      notes: input.notes?.trim() || null,
    },
  });

  // Recalculate executedAmount from all paid payments
  const paid = await prisma.investmentPayment.aggregate({
    where: { tenantId, projectId: input.projectId, isPaid: true },
    _sum: { amount: true },
  });
  await prisma.investmentProject.updateMany({
    where: { id: input.projectId, tenantId },
    data: { executedAmount: paid._sum.amount ?? 0 },
  });

  revalidatePath("/inversiones");
}
