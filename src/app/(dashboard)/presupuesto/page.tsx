import { Target, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { ConsolidatedBudgetView } from "@/components/budgets/ConsolidatedBudgetView";
import { MetricCard } from "@/components/shared/metric-card";
import { getRealConsolidatedBudgetForYear } from "@/lib/services/budgets-queries";
import { formatMXN, formatPercent } from "@/lib/format-currency";

interface SearchParams { year?: string }

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const currentYear = new Date().getUTCFullYear();
  const selectedYear = sp.year ? Number(sp.year) || currentYear : currentYear;
  const years = [currentYear, currentYear - 1, currentYear + 1];

  const consolidated = await getRealConsolidatedBudgetForYear(selectedYear);

  const { totals } = consolidated;
  const currentMonthIdx = new Date().getUTCMonth();
  const monthlyTarget = totals.monthlyIncome[currentMonthIdx] ?? 0;
  const marginPct = totals.annualIncome > 0
    ? totals.annualOperatingProfit / totals.annualIncome
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Presupuesto {selectedYear}
          </h1>
          <p className="text-sm text-muted-foreground">
            Vista consolidada por razón social. Los datos se jalan de Ingresos,
            Egresos, Nóminas y Préstamos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
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
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Ingresos registrados"
          value={<span className="tabular-nums">{formatMXN(totals.annualIncome)}</span>}
          subValue={`${consolidated.entities.length} razón${consolidated.entities.length === 1 ? "" : "es"} social${consolidated.entities.length === 1 ? "" : "es"}`}
          icon={TrendingUp}
          color="success"
        />
        <MetricCard
          label="Egresos registrados"
          value={<span className="tabular-nums">{formatMXN(totals.annualExpense)}</span>}
          subValue="Operativos · sin reparto"
          icon={TrendingDown}
        />
        <MetricCard
          label="Utilidad operativa"
          value={<span className="tabular-nums">{formatMXN(totals.annualOperatingProfit)}</span>}
          subValue={
            totals.annualIncome > 0
              ? `Margen ${formatPercent(marginPct)}`
              : "Sin ingresos"
          }
          icon={BarChart2}
          color={totals.annualOperatingProfit >= 0 ? "success" : "danger"}
        />
        <MetricCard
          label="Ingresos del mes actual"
          value={<span className="tabular-nums">{formatMXN(monthlyTarget)}</span>}
          subValue="en ingresos"
          icon={Target}
        />
      </div>

      <ConsolidatedBudgetView consolidated={consolidated} />
    </div>
  );
}
