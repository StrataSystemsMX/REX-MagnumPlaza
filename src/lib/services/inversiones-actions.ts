"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

export async function actionMarkLoanPaymentPaid({
  loanId,
  loanPaymentId,
  period,
  amount,
  notes,
}: {
  loanId: string;
  loanPaymentId: string | null;
  period: Date;
  amount: number;
  notes?: string | null;
}) {
  const { tenantId } = await requireAuth();

  const loan = await prisma.loan.findUnique({
    where: { id: loanId, tenantId },
  });
  if (!loan) throw new Error("Préstamo no encontrado.");

  if (loanPaymentId) {
    await prisma.loanPayment.update({
      where: { id: loanPaymentId, tenantId },
      data: {
        isPaid: true,
        paymentDate: new Date(),
        amount: new Prisma.Decimal(amount.toFixed(2)),
        notes: notes ?? null,
      },
    });
  } else {
    await prisma.loanPayment.create({
      data: {
        tenantId,
        loanId,
        period,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        isPaid: true,
        paymentDate: new Date(),
        notes: notes ?? null,
      },
    });
  }

  revalidatePath("/inversiones");
}
