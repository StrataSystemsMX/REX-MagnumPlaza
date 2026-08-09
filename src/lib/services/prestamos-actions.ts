"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { logAudit } from "@/lib/services/audit";
import { createLoanSchema, type CreateLoanInput } from "@/lib/validators/loan";

export async function actionCreateLoan(input: CreateLoanInput): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requirePermission(dbUser.id, "loan.create");

  const data = createLoanSchema.parse(input);

  const le = await prisma.legalEntity.findFirst({
    where: { id: data.legalEntityId, tenantId },
    select: { id: true },
  });
  if (!le) throw new Error("Razón social no encontrada.");

  const amt = new Prisma.Decimal(data.amount.toFixed(2));

  const loan = await prisma.loan.create({
    data: {
      tenantId,
      name: data.name,
      legalEntityId: data.legalEntityId,
      lender: data.lender || null,
      type: "OTHER",
      originalAmount: amt,
      currentBalance: amt,
      monthlyPayment: new Prisma.Decimal("0"),
      startDate: new Date(data.date),
      status: data.status,
      notes: data.notes || null,
    },
  });

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "CREATE",
    entityType: "Loan",
    entityId: loan.id,
    changes: {
      name: data.name,
      legalEntityId: data.legalEntityId,
      amount: data.amount,
      status: data.status,
    },
  });

  revalidatePath("/prestamos");
}
