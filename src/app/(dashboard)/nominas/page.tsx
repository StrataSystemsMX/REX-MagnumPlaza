import { NominasView } from "@/components/nominas/NominasView";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getPayrollAnnualTotalsByEntity,
  getPayrollYears,
  getPayrolls,
} from "@/lib/services/payroll-queries";
import { getLegalEntities } from "@/lib/services/properties-queries";

interface SearchParams {
  year?: string;
  month?: string;
  entity?: string;
}

export default async function NominasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { dbUser } = await requireAuth();

  const yearsAvailable = await getPayrollYears();
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const fallbackYear = yearsAvailable[0] ?? currentYear;

  const selectedYear = sp.year
    ? Number.parseInt(sp.year, 10) || fallbackYear
    : fallbackYear;

  const monthParam = sp.month ? Number.parseInt(sp.month, 10) : NaN;
  const selectedMonth: number | null =
    monthParam === 0
      ? null
      : Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
        ? monthParam
        : selectedYear === currentYear
          ? currentMonth
          : 12;

  const selectedEntity = sp.entity && sp.entity !== "ALL" ? sp.entity : null;

  const [payrolls, legalEntities, annualTotals, canCreate, canUpdate, canDelete] =
    await Promise.all([
      getPayrolls({
        year: selectedYear,
        month: selectedMonth ?? undefined,
        legalEntityId: selectedEntity ?? undefined,
      }),
      getLegalEntities(),
      getPayrollAnnualTotalsByEntity(selectedYear),
      hasPermission(dbUser.id, "expense.create"),
      hasPermission(dbUser.id, "expense.update"),
      hasPermission(dbUser.id, "expense.delete"),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nóminas</h1>
        <p className="text-sm text-muted-foreground">
          Registro mensual de nómina por razón social. Incluye nómina directa,
          comisiones, bonos, nómina estratégica y facturas de servicios
          administrativos.
        </p>
      </div>

      <NominasView
        payrolls={payrolls}
        legalEntities={legalEntities}
        annualTotals={annualTotals}
        yearsAvailable={
          yearsAvailable.length > 0 ? yearsAvailable : [currentYear]
        }
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        selectedEntityId={selectedEntity}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </div>
  );
}
