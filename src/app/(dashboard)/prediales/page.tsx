import { PredialesTable } from "@/components/prediales/PredialesTable";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getCadastralPayments,
  getCadastralYears,
  getPropertiesForCadastralForm,
} from "@/lib/services/cadastral-queries";
import { getLegalEntities } from "@/lib/services/properties-queries";

interface SearchParams {
  year?: string;
}

export default async function PredialesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { dbUser } = await requireAuth();

  const yearsAvailable = await getCadastralYears();
  const currentYear = new Date().getUTCFullYear();
  const fallbackYear = yearsAvailable[0] ?? currentYear;
  const selectedYear = sp.year
    ? Number.parseInt(sp.year, 10) || fallbackYear
    : fallbackYear;

  const [payments, properties, legalEntities, canCreate, canUpdate, canDelete] =
    await Promise.all([
      getCadastralPayments({ year: selectedYear }),
      getPropertiesForCadastralForm(),
      getLegalEntities(),
      hasPermission(dbUser.id, "expense.create"),
      hasPermission(dbUser.id, "expense.update"),
      hasPermission(dbUser.id, "expense.delete"),
    ]);

  const totals = payments.reduce(
    (acc, p) => {
      const amt = p.totalAmount ?? 0;
      acc.total += amt;
      if (p.isPaid) acc.paid += amt;
      else if (p.paidByThirdPartyName) acc.thirdParty += amt;
      else acc.pending += amt;
      return acc;
    },
    { total: 0, paid: 0, pending: 0, thirdParty: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prediales</h1>
        <p className="text-sm text-muted-foreground">
          Administración del impuesto predial anual por inmueble. Se paga por
          la página del ayuntamiento con la clave catastral y RFC.
        </p>
      </div>

      <PredialesTable
        payments={payments}
        properties={properties}
        legalEntities={legalEntities}
        yearsAvailable={
          yearsAvailable.length > 0 ? yearsAvailable : [currentYear]
        }
        selectedYear={selectedYear}
        totals={totals}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </div>
  );
}
