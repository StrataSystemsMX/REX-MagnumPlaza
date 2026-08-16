import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";

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

export interface LoanFilters {
  /** Muestra los créditos que siguen ACTIVE (sin importar cuándo arrancaron)
   *  más los que arrancaron o se liquidaron en el año. */
  year?: number;
}

export async function getLoans(filters: LoanFilters = {}): Promise<LoanRow[]> {
  const { tenantId } = await requireAuth();
  const yearStart = filters.year ? new Date(Date.UTC(filters.year, 0, 1)) : null;
  const yearEnd = filters.year ? new Date(Date.UTC(filters.year + 1, 0, 1)) : null;

  const loans = await prisma.loan.findMany({
    where: {
      tenantId,
      ...(yearStart && yearEnd
        ? {
            OR: [
              { status: "ACTIVE" },
              { startDate: { gte: yearStart, lt: yearEnd } },
              { endDate: { gte: yearStart, lt: yearEnd } },
            ],
          }
        : {}),
    },
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
