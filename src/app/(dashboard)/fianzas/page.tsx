import { GuaranteesTable } from "@/components/guarantees/GuaranteesTable";
import { NewGuaranteeDialog } from "@/components/guarantees/NewGuaranteeDialog";
import { requireAuth } from "@/server/auth/get-session";
import { hasPermission } from "@/server/auth/permissions";
import {
  getContractsWithoutGuarantee,
  getGuarantees,
} from "@/server/services/guarantees-queries";
import { getLegalEntities } from "@/server/services/properties-queries";

export default async function FianzasPage() {
  const { dbUser } = await requireAuth();

  const [guarantees, contracts, legalEntities, canManage] = await Promise.all([
    getGuarantees(),
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
      />
    </div>
  );
}
