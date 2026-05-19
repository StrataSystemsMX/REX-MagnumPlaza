import { TrendingUp, TrendingDown, BarChart2, AlertCircle } from "lucide-react";
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

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface SearchParams { year?: string; month?: string }

export default async function CierresMensualPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const now = new Date();
  const year = sp.year ? Number(sp.year) || now.getUTCFullYear() : now.getUTCFullYear();
  const month = sp.month ? Number(sp.month) || now.getUTCMonth() + 1 : now.getUTCMonth() + 1;

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  const legalEntityFilter = activeLegalEntityId ? { legalEntityId: activeLegalEntityId } : {};

  const [payments, expenses, payrolls] = await Promise.all([
    // Ingresos: pagos recibidos en el mes
    prisma.payment.findMany({
      where: {
        tenantId,
        paymentDate: { gte: periodStart, lt: periodEnd },
        ...(activeLegalEntityId ? { rent: { legalEntityId: activeLegalEntityId } } : {}),
      },
      select: {
        amount: true,
        rent: {
          select: {
            legalEntityId: true,
            contract: {
              select: {
                unit: { select: { property: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    // Egresos del mes (sin nómina)
    prisma.expense.findMany({
      where: {
        tenantId,
        expenseDate: { gte: periodStart, lt: periodEnd },
        category: { type: { not: "PAYROLL" } },
        ...legalEntityFilter,
      },
      select: {
        amount: true,
        description: true,
        category: { select: { name: true, type: true } },
      },
    }),
    // Nómina del mes
    prisma.payroll.findMany({
      where: {
        tenantId,
        period: periodStart,
        ...legalEntityFilter,
      },
      select: { amount: true },
    }),
  ]);

  const ingresos = payments.reduce((acc, p) => acc + p.amount.toNumber(), 0);
  const egresosOp = expenses.reduce((acc, e) => acc + e.amount.toNumber(), 0);
  const nomina = payrolls.reduce((acc, n) => acc + n.amount.toNumber(), 0);
  const egresos = egresosOp + nomina;
  const utilidad = ingresos - egresos;
  const margen = ingresos > 0 ? utilidad / ingresos : 0;

  // Agrupar egresos por categoría
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category.name;
    byCategory.set(key, (byCategory.get(key) ?? 0) + e.amount.toNumber());
  }
  if (nomina > 0) byCategory.set("Nómina", nomina);
  const categoryRows = [...byCategory.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  // Agrupar ingresos por propiedad
  const byProperty = new Map<string, number>();
  for (const p of payments) {
    const key = p.rent.contract.unit.property.name;
    byProperty.set(key, (byProperty.get(key) ?? 0) + p.amount.toNumber());
  }
  const propertyRows = [...byProperty.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const PCT = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cierre Mensual — {MONTH_NAMES[month - 1]} {year}
        </h1>
        <p className="text-sm text-muted-foreground">
          Resumen financiero del mes cerrado.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Ingresos cobrados"
          value={<span className="tabular-nums">{MXN.format(ingresos)}</span>}
          subValue={`${payments.length} pago${payments.length === 1 ? "" : "s"} recibidos`}
          icon={TrendingUp}
          color="success"
        />
        <MetricCard
          label="Egresos operativos"
          value={<span className="tabular-nums">{MXN.format(egresos)}</span>}
          subValue={`Nómina: ${MXN.format(nomina)}`}
          icon={TrendingDown}
        />
        <MetricCard
          label="Utilidad bruta"
          value={<span className="tabular-nums">{MXN.format(utilidad)}</span>}
          subValue={`Margen: ${PCT.format(margen)}`}
          icon={BarChart2}
          color={utilidad >= 0 ? "success" : "danger"}
        />
        <MetricCard
          label="Movimientos"
          value={payments.length + expenses.length}
          subValue="registros del mes"
          icon={AlertCircle}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ingresos por propiedad */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Ingresos por propiedad</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {propertyRows.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Sin ingresos registrados este mes.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Propiedad</TableHead>
                    <TableHead className="text-right">Cobrado</TableHead>
                    <TableHead className="text-right">% del total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propertyRows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {MXN.format(row.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {ingresos > 0 ? PCT.format(row.total / ingresos) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{MXN.format(ingresos)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Egresos por categoría */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Egresos por categoría</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {categoryRows.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Sin egresos registrados este mes.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">% del total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryRows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {MXN.format(row.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {egresos > 0 ? PCT.format(row.total / egresos) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{MXN.format(egresos)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumen P&L */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Estado de resultados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { label: "Ingresos cobrados", value: ingresos, bold: false },
              { label: "Egresos operativos", value: -egresosOp, bold: false },
              { label: "Nómina", value: -nomina, bold: false },
              { label: "Utilidad operativa", value: utilidad, bold: true },
            ].map((row) => (
              <div
                key={row.label}
                className={`flex items-center justify-between ${row.bold ? "border-t pt-2 font-semibold" : ""}`}
              >
                <span className={row.bold ? "" : "text-muted-foreground"}>{row.label}</span>
                <span
                  className={`tabular-nums ${
                    row.bold
                      ? row.value >= 0
                        ? "text-emerald-700"
                        : "text-destructive"
                      : ""
                  }`}
                >
                  {row.value < 0
                    ? `-${MXN.format(Math.abs(row.value))}`
                    : MXN.format(row.value)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
