"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import type { LoanStatus } from "@/generated/prisma/enums";

export async function actionCreateLoan(input: {
  name: string;
  legalEntityId: string;
  lender: string | null;
  amount: number;
  date: string;
  status: LoanStatus;
  notes: string | null;
}): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "expense.create");

  if (!input.name.trim()) throw new Error("La descripción es requerida.");
  if (!input.legalEntityId) throw new Error("La razón social es requerida.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Monto inválido.");
  if (!input.date) throw new Error("La fecha es requerida.");

  const le = await prisma.legalEntity.findFirst({
    where: { id: input.legalEntityId, tenantId },
    select: { id: true },
  });
  if (!le) throw new Error("Razón social no encontrada.");

  const amt = new Prisma.Decimal(input.amount.toFixed(2));

  await prisma.loan.create({
    data: {
      tenantId,
      name: input.name.trim(),
      legalEntityId: input.legalEntityId,
      lender: input.lender?.trim() || null,
      type: "OTHER",
      originalAmount: amt,
      currentBalance: amt,
      monthlyPayment: new Prisma.Decimal("0"),
      startDate: new Date(input.date),
      status: input.status,
      notes: input.notes?.trim() || null,
    },
  });

  revalidatePath("/prestamos");
}
