import { EgresosTable } from "@/components/egresos/EgresosTable";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getExpenseCategories,
  getExpenseYears,
  getExpenses,
  getPropertiesForExpenseForm,
} from "@/lib/services/expenses-queries";
import { getLegalEntities } from "@/lib/services/properties-queries";

interface SearchParams {
  year?: string;
  month?: string;
  legalEntity?: string;
  category?: string;
}

export default async function EgresosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { dbUser } = await requireAuth();

  const yearsAvailable = await getExpenseYears();
  const currentYear = new Date().getUTCFullYear();
  const fallbackYear = yearsAvailable[0] ?? currentYear;
  const selectedYear = sp.year
    ? Number.parseInt(sp.year, 10) || fallbackYear
    : fallbackYear;

  const monthRaw = sp.month ? Number.parseInt(sp.month, 10) : NaN;
  const selectedMonth =
    Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : null;

  const selectedLegalEntityId =
    sp.legalEntity && sp.legalEntity !== "ALL" ? sp.legalEntity : null;
  const selectedCategoryId =
    sp.category && sp.category !== "ALL" ? sp.category : null;

  const [
    expenses,
    legalEntities,
    categories,
    properties,
    canCreate,
    canUpdate,
    canDelete,
  ] = await Promise.all([
    getExpenses({
      year: selectedYear,
      month: selectedMonth ?? undefined,
      legalEntityId: selectedLegalEntityId ?? undefined,
      categoryId: selectedCategoryId ?? undefined,
    }),
    getLegalEntities(),
    getExpenseCategories(),
    getPropertiesForExpenseForm(),
    hasPermission(dbUser.id, "expense.create"),
    hasPermission(dbUser.id, "expense.update"),
    hasPermission(dbUser.id, "expense.delete"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Egresos</h1>
        <p className="text-sm text-muted-foreground">
          Gastos por razón social: nóminas, impuestos, servicios,
          mantenimiento, financiamientos y comisiones.
        </p>
      </div>

      <EgresosTable
        expenses={expenses}
        legalEntities={legalEntities}
        categories={categories}
        properties={properties}
        yearsAvailable={
          yearsAvailable.length > 0 ? yearsAvailable : [currentYear]
        }
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        selectedLegalEntityId={selectedLegalEntityId}
        selectedCategoryId={selectedCategoryId}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </div>
  );
}
