import { GuaranteesTable } from "@/components/guarantees/GuaranteesTable";
import { NewGuaranteeDialog } from "@/components/guarantees/NewGuaranteeDialog";
import { requireAuth } from "@/server/auth/get-session";
import { hasPermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import {
  getContractsWithoutGuarantee,
  getGuarantees,
} from "@/server/services/guarantees-queries";
import { getLegalEntities } from "@/server/services/properties-queries";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function FianzasPage({ searchParams }: PageProps) {
  const { tenantId, dbUser } = await requireAuth();
  const params = await searchParams;

  const requestedYear = Number(params.year);
  const year =
    Number.isFinite(requestedYear) && requestedYear > 1900
      ? requestedYear
      : new Date().getUTCFullYear();

  const oldestGuarantee = await prisma.guarantee.findFirst({
    where: { tenantId },
    orderBy: { receivedDate: "asc" },
    select: { receivedDate: true },
  });
  const minYear = oldestGuarantee
    ? Math.min(oldestGuarantee.receivedDate.getUTCFullYear(), year - 1)
    : year - 1;
  const currentYear = new Date().getUTCFullYear();
  const maxYear = Math.max(currentYear, year) + 1;
  const availableYears: number[] = [];
  for (let y = maxYear; y >= minYear; y--) availableYears.push(y);

  const [guarantees, contracts, legalEntities, canManage] = await Promise.all([
    getGuarantees({ year }),
    getContractsWithoutGuarantee(),
    getLegalEntities(),
    hasPermission(dbUser.id, "expense.create"),
  ]);

  const totals = guarantees.reduce(
    (acc, g) => {
      const amt = g.amount;
      acc.total += amt;
      if (g.status === "HELD" || g.status === "PARTIALLY_RETURNED") {
        acc.held += amt;
        acc.heldCount += 1;
      } else if (g.status === "RETURNED") {
        acc.returned += g.returnedAmount ?? amt;
        acc.returnedCount += 1;
      }
      return acc;
    },
    {
      total: 0,
      held: 0,
      heldCount: 0,
      returned: 0,
      returnedCount: 0,
    },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fianzas</h1>
          <p className="text-sm text-muted-foreground">
            Depósitos en garantía recibidos por contrato, agrupados por la
            razón social dueña del inmueble.
          </p>
        </div>
        {canManage && <NewGuaranteeDialog contracts={contracts} />}
      </div>

      <GuaranteesTable
        guarantees={guarantees}
        legalEntities={legalEntities}
        totals={totals}
        canManage={canManage}
        year={year}
        availableYears={availableYears}
      />
    </div>
  );
}
