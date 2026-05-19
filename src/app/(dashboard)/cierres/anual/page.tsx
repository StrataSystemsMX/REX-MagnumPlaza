import { TrendingUp, TrendingDown, BarChart2, Target } from "lucide-react";
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
import { prisma } from "@/lib/prisma/client";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const PCT = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 1,
});

const MONTH_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

interface SearchParams { year?: string }

export default async function CierresAnualPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const now = new Date();
  const year = sp.year ? Number(sp.year) || now.getUTCFullYear() : now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const legalEntityFilter = activeLegalEntityId ? { legalEntityId: activeLegalEntityId } : {};

  const [payments, expenses, payrolls] = await Promise.all([
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
      where: {
        tenantId,
        period: { gte: yearStart, lt: yearEnd },
        ...legalEntityFilter,
      },
      select: { amount: true, period: true },
    }),
  ]);

  // Agregar por mes (0-11)
  const monthData = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    ingresos: 0,
    egresos: 0,
    nomina: 0,
  }));

  for (const p of payments) {
    const m = p.paymentDate.getUTCMonth();
    monthData[m]!.ingresos += p.amount.toNumber();
  }
  for (const e of expenses) {
    const m = e.expenseDate.getUTCMonth();
    monthData[m]!.egresos += e.amount.toNumber();
  }
  for (const n of payrolls) {
    const m = n.period.getUTCMonth();
    monthData[m]!.nomina += n.amount.toNumber();
  }

  const totalIngresos = monthData.reduce((acc, m) => acc + m.ingresos, 0);
  const totalEgresos = monthData.reduce((acc, m) => acc + m.egresos + m.nomina, 0);
  const totalUtilidad = totalIngresos - totalEgresos;
  const margenAnual = totalIngresos > 0 ? totalUtilidad / totalIngresos : 0;

  const withUtilidad = monthData.map((m) => ({ ...m, utilidad: m.ingresos - m.egresos - m.nomina }));
  const bestMonth = withUtilidad.reduce(
    (best, m) => (m.utilidad > best.utilidad ? m : best),
    withUtilidad[0]!,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cierre Anual {year}</h1>
        <p className="text-sm text-muted-foreground">
          Resumen financiero acumulado del año.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Ingresos anuales"
          value={<span className="tabular-nums">{MXN.format(totalIngresos)}</span>}
          subValue={`${payments.length} pagos recibidos`}
          icon={TrendingUp}
          color="success"
        />
        <MetricCard
          label="Egresos anuales"
          value={<span className="tabular-nums">{MXN.format(totalEgresos)}</span>}
          subValue="operación + nómina"
          icon={TrendingDown}
        />
        <MetricCard
          label="Utilidad bruta"
          value={<span className="tabular-nums">{MXN.format(totalUtilidad)}</span>}
          subValue={`Margen ${PCT.format(margenAnual)}`}
          icon={BarChart2}
          color={totalUtilidad >= 0 ? "success" : "danger"}
        />
        <MetricCard
          label="Mejor mes"
          value={MONTH_SHORT[bestMonth.month] ?? "—"}
          subValue={MXN.format(bestMonth.ingresos - bestMonth.egresos - bestMonth.nomina)}
          icon={Target}
          color="success"
        />
      </div>

      {/* Tabla mensual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Detalle mensual {year}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Egresos</TableHead>
                  <TableHead className="text-right">Nómina</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthData.map((m) => {
                  const utilidad = m.ingresos - m.egresos - m.nomina;
                  const margen = m.ingresos > 0 ? utilidad / m.ingresos : null;
                  const isEmpty = m.ingresos === 0 && m.egresos === 0 && m.nomina === 0;
                  return (
                    <TableRow key={m.month} className={isEmpty ? "opacity-40" : ""}>
                      <TableCell className="font-medium">{MONTH_SHORT[m.month]}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">
                        {m.ingresos > 0 ? MXN.format(m.ingresos) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {m.egresos > 0 ? MXN.format(m.egresos) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {m.nomina > 0 ? MXN.format(m.nomina) : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          isEmpty ? "" : utilidad >= 0 ? "text-emerald-700" : "text-destructive"
                        }`}
                      >
                        {isEmpty ? "—" : MXN.format(utilidad)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {margen !== null ? PCT.format(margen) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total {year}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">
                    {MXN.format(totalIngresos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {MXN.format(totalEgresos - monthData.reduce((a, m) => a + m.nomina, 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {MXN.format(monthData.reduce((a, m) => a + m.nomina, 0))}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      totalUtilidad >= 0 ? "text-emerald-700" : "text-destructive"
                    }`}
                  >
                    {MXN.format(totalUtilidad)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {PCT.format(margenAnual)}
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
