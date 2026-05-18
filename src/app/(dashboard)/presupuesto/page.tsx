import { Target, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { BudgetGrid } from "@/components/budgets/BudgetGrid";
import { CreateBudgetForm } from "@/components/budgets/CreateBudgetForm";
import { MetricCard } from "@/components/shared/metric-card";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getBudgetForYear,
  getBudgetYears,
  getLegalEntitiesForBudget,
  MONTH_KEYS,
} from "@/lib/services/budgets-queries";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

interface SearchParams { year?: string }

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { dbUser } = await requireAuth();

  const currentYear = new Date().getUTCFullYear();
  const years = await getBudgetYears();
  const selectedYear = sp.year ? Number(sp.year) || currentYear : (years[0] ?? currentYear);

  const [budget, legalEntities, canManage] = await Promise.all([
    getBudgetForYear(selectedYear),
    getLegalEntitiesForBudget(),
    hasPermission(dbUser.id, "expense.create"),
  ]);

  // KPIs
  const incomeLines = budget?.lines.filter((l) =>
    ["INCOME_RENT", "INCOME_BILLBOARD", "INCOME_GUARANTEE", "INCOME_OTHER"].includes(l.conceptType),
  ) ?? [];
  const expenseLines = budget?.lines.filter((l) =>
    ["EXPENSE", "TAX_STRATEGY", "DEBT_SERVICE"].includes(l.conceptType),
  ) ?? [];

  const totalIncome = incomeLines.reduce((acc, l) => acc + l.annual, 0);
  const totalExpense = expenseLines.reduce((acc, l) => acc + l.annual, 0);
  const netBudget = totalIncome - totalExpense;

  const currentMonthIdx = new Date().getUTCMonth();
  const currentMonthKey = MONTH_KEYS[currentMonthIdx];
  const monthlyTarget = currentMonthKey
    ? incomeLines.reduce((acc, l) => acc + l.months[currentMonthKey], 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Presupuesto {selectedYear}
        </h1>
        {years.length > 1 && (
          <div className="flex gap-2">
            {years.map((y) => (
              <a
                key={y}
                href={`/presupuesto?year=${y}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  y === selectedYear
                    ? "bg-primary text-primary-foreground"
                    : "border hover:bg-muted"
                }`}
              >
                {y}
              </a>
            ))}
          </div>
        )}
      </div>

      {budget ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="Ingresos presupuestados"
              value={<span className="tabular-nums">{MXN.format(totalIncome)}</span>}
              subValue={`${incomeLines.length} concepto${incomeLines.length === 1 ? "" : "s"}`}
              icon={TrendingUp}
              color="success"
            />
            <MetricCard
              label="Egresos presupuestados"
              value={<span className="tabular-nums">{MXN.format(totalExpense)}</span>}
              subValue={`${expenseLines.length} concepto${expenseLines.length === 1 ? "" : "s"}`}
              icon={TrendingDown}
            />
            <MetricCard
              label="Utilidad proyectada"
              value={<span className="tabular-nums">{MXN.format(netBudget)}</span>}
              subValue={
                totalIncome > 0
                  ? `Margen ${new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 }).format(netBudget / totalIncome)}`
                  : "Sin ingresos"
              }
              icon={BarChart2}
              color={netBudget >= 0 ? "success" : "danger"}
            />
            <MetricCard
              label="Meta del mes actual"
              value={<span className="tabular-nums">{MXN.format(monthlyTarget)}</span>}
              subValue="en ingresos por renta"
              icon={Target}
            />
          </div>

          <BudgetGrid budget={budget} canManage={canManage} />
        </>
      ) : (
        <CreateBudgetForm legalEntities={legalEntities} currentYear={selectedYear} />
      )}
    </div>
  );
}
