import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

export interface LoanRow {
  id: string;
  name: string;
  lender: string | null;
  status: string;
  amount: number;
  date: Date;
  notes: string | null;
  entityCode: string;
  entityId: string;
  entityName: string;
}

export async function getLoans(): Promise<LoanRow[]> {
  const { tenantId } = await requireAuth();

  const loans = await prisma.loan.findMany({
    where: { tenantId },
    orderBy: [{ startDate: "desc" }],
    include: { legalEntity: { select: { id: true, code: true, legalName: true } } },
  });

  return loans.map((l) => ({
    id: l.id,
    name: l.name,
    lender: l.lender,
    status: l.status,
    amount: l.originalAmount.toNumber(),
    date: l.startDate,
    notes: l.notes,
    entityCode: l.legalEntity.code,
    entityId: l.legalEntity.id,
    entityName: l.legalEntity.legalName,
  }));
}
