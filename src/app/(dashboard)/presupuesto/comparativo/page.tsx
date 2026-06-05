import { BarChart2, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/shared/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/get-session";
import { getActiveLegalEntityId } from "@/lib/auth/active-legal-entity";
import { getBudgetForYear, MONTH_KEYS } from "@/lib/services/budgets-queries";
import { prisma } from "@/lib/prisma/client";
import { formatMXN, formatPercent } from "@/lib/format-currency";

interface SearchParams { year?: string }

export default async function PresupuestoComparativoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const currentYear = new Date().getUTCFullYear();
  const year = sp.year ? Number(sp.year) || currentYear : currentYear;

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const legalEntityFilter = activeLegalEntityId ? { legalEntityId: activeLegalEntityId } : {};

  const [budget, payments, expenses, payrolls] = await Promise.all([
    getBudgetForYear(year),
    prisma.payment.findMany({
      where: {
        tenantId,
        paymentDate: { gte: yearStart, lt: yearEnd },
        ...(activeLegalEntityId ? { rent: { legalEntityId: activeLegalEntityId } } : {}),
      },
      select: { amount: true, paymentDate: true },
    }),
    prisma.expense.findMany({
      where: {
        tenantId,
        expenseDate: { gte: yearStart, lt: yearEnd },
        category: { type: { not: "PAYROLL" } },
        ...legalEntityFilter,
      },
      select: { amount: true, expenseDate: true },
    }),
    prisma.payroll.findMany({
      where: { tenantId, period: { gte: yearStart, lt: yearEnd }, ...legalEntityFilter },
      select: { amount: true, period: true },
    }),
  ]);

  // Acumular real por mes
  const realByMonth = MONTH_KEYS.map(() => ({
    ingresos: 0,
    egresos: 0,
    nomina: 0,
  }));

  for (const p of payments) {
    const m = p.paymentDate.getUTCMonth();
    realByMonth[m]!.ingresos += p.amount.toNumber();
  }
  for (const e of expenses) {
    const m = e.expenseDate.getUTCMonth();
    realByMonth[m]!.egresos += e.amount.toNumber();
  }
  for (const n of payrolls) {
    const m = n.period.getUTCMonth();
    realByMonth[m]!.nomina += n.amount.toNumber();
  }

  // Presupuesto por mes (ingresos y egresos separados)
  const budgetByMonth = MONTH_KEYS.map(() => ({ ingresos: 0, egresos: 0 }));
  if (budget) {
    for (const line of budget.lines) {
      const isIncome = ["INCOME_RENT","INCOME_BILLBOARD","INCOME_GUARANTEE","INCOME_OTHER"].includes(line.conceptType);
      MONTH_KEYS.forEach((k, i) => {
        if (isIncome) budgetByMonth[i]!.ingresos += line.months[k];
        else budgetByMonth[i]!.egresos += line.months[k];
      });
    }
  }

  const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  // Totales anuales
  const totalRealIngresos = realByMonth.reduce((a, m) => a + m.ingresos, 0);
  const totalRealEgresos = realByMonth.reduce((a, m) => a + m.egresos + m.nomina, 0);
  const totalBudgetIngresos = budgetByMonth.reduce((a, m) => a + m.ingresos, 0);
  const totalBudgetEgresos = budgetByMonth.reduce((a, m) => a + m.egresos, 0);
  const variacionIngresos = totalRealIngresos - totalBudgetIngresos;
  const variacionEgresos = totalRealEgresos - totalBudgetEgresos;
  const utilidadReal = totalRealIngresos - totalRealEgresos;
  const utilidadBudget = totalBudgetIngresos - totalBudgetEgresos;

  const currentMonth = new Date().getUTCMonth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Real vs Presupuesto {year}</h1>
          {!budget && (
            <p className="text-sm text-amber-700">
              No hay presupuesto registrado para {year}. Ve a{" "}
              <Link href="/presupuesto" className="underline">
                Presupuesto
              </Link>{" "}
              para crearlo.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Ingresos reales"
          value={<span className="tabular-nums">{formatMXN(totalRealIngresos)}</span>}
          subValue={
            totalBudgetIngresos > 0
              ? `${variacionIngresos >= 0 ? "+" : ""}${formatMXN(variacionIngresos)} vs presupuesto`
              : "Sin presupuesto"
          }
          icon={TrendingUp}
          color={variacionIngresos >= 0 ? "success" : "danger"}
        />
        <MetricCard
          label="Egresos reales"
          value={<span className="tabular-nums">{formatMXN(totalRealEgresos)}</span>}
          subValue={
            totalBudgetEgresos > 0
              ? `${variacionEgresos >= 0 ? "+" : ""}${formatMXN(variacionEgresos)} vs presupuesto`
              : "Sin presupuesto"
          }
          icon={TrendingDown}
          color={variacionEgresos <= 0 ? "success" : "warning"}
        />
        <MetricCard
          label="Utilidad real"
          value={<span className="tabular-nums">{formatMXN(utilidadReal)}</span>}
          subValue={
            utilidadBudget !== 0
              ? `Meta: ${formatMXN(utilidadBudget)}`
              : "Sin presupuesto de utilidad"
          }
          icon={BarChart2}
          color={utilidadReal >= 0 ? "success" : "danger"}
        />
        <MetricCard
          label="Cumplimiento ingresos"
          value={
            totalBudgetIngresos > 0
              ? formatPercent(totalRealIngresos / totalBudgetIngresos)
              : "—"
          }
          subValue="del presupuesto anual"
          icon={AlertTriangle}
          color={
            totalBudgetIngresos > 0
              ? totalRealIngresos / totalBudgetIngresos >= 0.9
                ? "success"
                : totalRealIngresos / totalBudgetIngresos >= 0.7
                  ? "warning"
                  : "danger"
              : "default"
          }
        />
      </div>

      {/* Tabla comparativa mensual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Ingresos — Real vs Presupuesto</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Presupuestado</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Variación</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MONTH_KEYS.map((k, i) => {
                  const bud = budgetByMonth[i]!.ingresos;
                  const real = realByMonth[i]!.ingresos;
                  const diff = real - bud;
                  const pct = bud > 0 ? real / bud : null;
                  const isFuture = i > currentMonth;
                  return (
                    <TableRow key={k} className={isFuture ? "opacity-40" : ""}>
                      <TableCell className="font-medium">{MONTH_SHORT[i]}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {bud > 0 ? formatMXN(bud) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {real > 0 ? formatMXN(real) : isFuture ? "—" : <span className="text-destructive">{formatMXN(0)}</span>}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums text-sm font-medium ${
                          isFuture || bud === 0
                            ? "text-muted-foreground"
                            : diff >= 0
                              ? "text-emerald-700"
                              : "text-destructive"
                        }`}
                      >
                        {isFuture || bud === 0
                          ? "—"
                          : `${diff >= 0 ? "+" : ""}${formatMXN(diff)}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {pct !== null && !isFuture ? formatPercent(pct) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMXN(totalBudgetIngresos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">
                    {formatMXN(totalRealIngresos)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${variacionIngresos >= 0 ? "text-emerald-700" : "text-destructive"}`}
                  >
                    {variacionIngresos >= 0 ? "+" : ""}
                    {formatMXN(variacionIngresos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totalBudgetIngresos > 0
                      ? formatPercent(totalRealIngresos / totalBudgetIngresos)
                      : "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Egresos comparativo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Egresos — Real vs Presupuesto</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Presupuestado</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Variación</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MONTH_KEYS.map((k, i) => {
                  const bud = budgetByMonth[i]!.egresos;
                  const real = realByMonth[i]!.egresos + realByMonth[i]!.nomina;
                  const diff = real - bud;
                  const pct = bud > 0 ? real / bud : null;
                  const isFuture = i > currentMonth;
                  return (
                    <TableRow key={k} className={isFuture ? "opacity-40" : ""}>
                      <TableCell className="font-medium">{MONTH_SHORT[i]}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {bud > 0 ? formatMXN(bud) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {real > 0 ? formatMXN(real) : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums text-sm font-medium ${
                          isFuture || bud === 0
                            ? "text-muted-foreground"
                            : diff <= 0
                              ? "text-emerald-700"
                              : "text-destructive"
                        }`}
                      >
                        {isFuture || bud === 0
                          ? "—"
                          : `${diff >= 0 ? "+" : ""}${formatMXN(diff)}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {pct !== null && !isFuture ? formatPercent(pct) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMXN(totalBudgetEgresos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMXN(totalRealEgresos)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${variacionEgresos <= 0 ? "text-emerald-700" : "text-destructive"}`}
                  >
                    {variacionEgresos >= 0 ? "+" : ""}
                    {formatMXN(variacionEgresos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totalBudgetEgresos > 0
                      ? formatPercent(totalRealEgresos / totalBudgetEgresos)
                      : "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
