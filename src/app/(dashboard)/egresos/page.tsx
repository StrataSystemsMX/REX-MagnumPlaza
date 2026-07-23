import { EgresosYearlyView } from "@/components/egresos/EgresosYearlyView";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  getExpenseCategories,
  getManagedExpenseCategories,
  getPropertiesForExpenseForm,
  getYearlyExpensesMatrix,
} from "@/lib/services/expenses-queries";
import { getLegalEntities } from "@/lib/services/properties-queries";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function EgresosPage({ searchParams }: PageProps) {
  const { tenantId, dbUser } = await requireAuth();
  const params = await searchParams;

  const requestedYear = Number(params.year);
  const year =
    Number.isFinite(requestedYear) && requestedYear > 1900
      ? requestedYear
      : new Date().getUTCFullYear();

  const oldestExpense = await prisma.expense.findFirst({
    where: { tenantId, category: { type: { not: "PAYROLL" } } },
    orderBy: { expenseDate: "asc" },
    select: { expenseDate: true },
  });
  const minYear = oldestExpense
    ? Math.min(oldestExpense.expenseDate.getUTCFullYear(), year - 1)
    : year - 1;
  const currentYear = new Date().getUTCFullYear();
  const maxYear = Math.max(currentYear, year) + 1;
  const availableYears: number[] = [];
  for (let y = maxYear; y >= minYear; y--) availableYears.push(y);

  const [
    data,
    legalEntities,
    categories,
    managedCategories,
    properties,
    canCreate,
    canUpdate,
  ] = await Promise.all([
    getYearlyExpensesMatrix(year),
    getLegalEntities(),
    getExpenseCategories(),
    getManagedExpenseCategories(),
    getPropertiesForExpenseForm(),
    hasPermission(dbUser.id, "expense.create"),
    hasPermission(dbUser.id, "expense.update"),
  ]);

  return (
    <div className="-m-4 space-y-6 bg-gradient-to-b from-red-400/22 to-transparent bg-[length:100%_180px] bg-no-repeat p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8 dark:from-red-800/18">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Egresos</h1>
        <p className="text-sm text-muted-foreground">
          Egresos anuales desglosados por razón social y concepto.
        </p>
      </div>

      <EgresosYearlyView
        data={data}
        availableYears={availableYears}
        legalEntities={legalEntities}
        categories={categories}
        managedCategories={managedCategories}
        properties={properties}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />
    </div>
  );
}
