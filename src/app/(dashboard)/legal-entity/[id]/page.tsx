import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { LegalEntityYearNav } from "@/components/legal-entity/LegalEntityYearNav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { propertyTypeLabel } from "@/lib/i18n/enums";
import { getLegalEntityMetrics } from "@/lib/services/legal-entity-queries";
import type { PropertyType } from "@/generated/prisma/enums";
import { capitalizeFirst } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}

function money(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "—";
  return MXN.format(n);
}

export default async function LegalEntityPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { year: yearParam } = await searchParams;

  const { dbUser } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);

  // Solo MASTER y ACCOUNTANT pueden ver finanzas por LegalEntity (CLAUDE.md §2).
  const canSee =
    roles.includes("MASTER") || roles.includes("ACCOUNTANT") || roles.includes("ADMIN");
  if (!canSee) redirect("/");

  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
  const data = await getLegalEntityMetrics(dbUser.tenantId, id, year);
  if (!data) notFound();

  const nowYear = new Date().getUTCFullYear();
  const availableYears = Array.from(
    new Set([
      ...Array.from({ length: 6 }, (_, i) => nowYear + 1 - i),
      data.year,
    ]),
  ).sort((a, b) => b - a);

  const occupancyPct =
    data.totalUnits > 0 ? Math.round((data.occupiedUnits / data.totalUnits) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" render={<Link href="/reportes" />}>
            <ArrowLeft className="size-4" />
            Volver a Reportes
          </Button>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {data.code} — {data.legalName}
          </h1>
          {data.rfc ? (
            <p className="text-sm text-muted-foreground">
              RFC {data.rfc}
              {data.address ? ` · ${data.address}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/legal-entity/${data.id}/pdf?year=${data.year}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileDown className="size-4" />
            Exportar PDF
          </a>
          <LegalEntityYearNav year={data.year} availableYears={availableYears} />
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ingresos del año</CardDescription>
            <CardTitle className="text-xl">{MXN.format(Number(data.totalIncome))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Renta esperada / mes</CardDescription>
            <CardTitle className="text-xl">{money(data.expectedMonthlyRent)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Egresos del año</CardDescription>
            <CardTitle className="text-xl">{MXN.format(Number(data.totalExpenses))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Utilidad del año</CardDescription>
            <CardTitle
              className={`text-xl ${
                Number(data.totalProfit) > 0
                  ? "text-emerald-600"
                  : Number(data.totalProfit) < 0
                    ? "text-rose-600"
                    : ""
              }`}
            >
              {MXN.format(Number(data.totalProfit))}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ocupación</CardDescription>
            <CardTitle className="text-xl">
              {occupancyPct}%
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({data.occupiedUnits}/{data.totalUnits})
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Cartera vencida */}
      {data.arRows.length > 0 && (
        <Card className="border-rose-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-rose-700">Cartera vencida</CardTitle>
                <CardDescription>Rentas pendientes de pago ya vencidas</CardDescription>
              </div>
              <Badge variant="destructive" className="text-base px-3 py-1">
                {MXN.format(Number(data.arBalance))}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inquilino</TableHead>
                  <TableHead>Inmueble / Local</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Cargo</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.arRows.map((r) => (
                  <TableRow key={r.rentId}>
                    <TableCell className="font-medium">{r.lesseeName}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{r.propertyName} · </span>
                      {r.unitName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {capitalizeFirst(DATE.format(r.period))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-rose-600">
                      {capitalizeFirst(DATE.format(r.dueDate))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{MXN.format(Number(r.amountDue))}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.amountPaid)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-rose-600">
                      {MXN.format(Number(r.balance))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Contratos próximos a vencer */}
      {data.expiringContracts.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-amber-700">Contratos por vencer</CardTitle>
            <CardDescription>Próximos 90 días</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inquilino</TableHead>
                  <TableHead>Inmueble / Local</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Renta mensual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.expiringContracts.map((c) => (
                  <TableRow key={c.contractId}>
                    <TableCell className="font-medium">
                      <Link href={`/contracts/${c.contractId}`} className="hover:underline">
                        {c.lesseeName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{c.propertyName} · </span>
                      {c.unitName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-medium text-amber-700">
                      {capitalizeFirst(DATE.format(c.endDate))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{MXN.format(Number(c.monthlyAmount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Cierre mensual */}
      <Card>
        <CardHeader>
          <CardTitle>Cierre mensual</CardTitle>
          <CardDescription>Ingresos, egresos y utilidad por mes — {data.year}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                {MONTH_NAMES.map((n) => (
                  <TableHead key={n} className="text-right">{n}</TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Ingresos</TableCell>
                {data.monthlyIncome.map((v, i) => (
                  <TableCell key={i} className="text-right tabular-nums">{money(v)}</TableCell>
                ))}
                <TableCell className="text-right font-semibold tabular-nums">
                  {MXN.format(Number(data.totalIncome))}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Egresos</TableCell>
                {data.monthlyExpenses.map((v, i) => (
                  <TableCell key={i} className="text-right tabular-nums">{money(v)}</TableCell>
                ))}
                <TableCell className="text-right font-semibold tabular-nums">
                  {MXN.format(Number(data.totalExpenses))}
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">Utilidad</TableCell>
                {data.monthlyProfit.map((v, i) => {
                  const n = Number(v);
                  return (
                    <TableCell
                      key={i}
                      className={`text-right tabular-nums ${n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-600" : ""}`}
                    >
                      {money(v)}
                    </TableCell>
                  );
                })}
                <TableCell
                  className={`text-right font-semibold tabular-nums ${
                    Number(data.totalProfit) > 0
                      ? "text-emerald-600"
                      : Number(data.totalProfit) < 0
                        ? "text-rose-600"
                        : ""
                  }`}
                >
                  {MXN.format(Number(data.totalProfit))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Ingresos por inmueble + Egresos por categoría */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingresos por inmueble</CardTitle>
            <CardDescription>Acumulado del año</CardDescription>
          </CardHeader>
          <CardContent>
            {data.incomeByProperty.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin ingresos registrados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inmueble</TableHead>
                    <TableHead className="text-right">Ingreso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.incomeByProperty.map((row) => (
                    <TableRow key={row.propertyId}>
                      <TableCell>
                        <Link
                          href={`/reportes/inmueble/${row.propertyId}?year=${data.year}&from=${data.id}`}
                          className="hover:underline"
                        >
                          {row.propertyName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{MXN.format(Number(row.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Egresos por categoría</CardTitle>
            <CardDescription>Acumulado del año</CardDescription>
          </CardHeader>
          <CardContent>
            {data.expensesByCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin egresos registrados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expensesByCategory.map((row) => (
                    <TableRow key={row.categoryName}>
                      <TableCell>{row.categoryName}</TableCell>
                      <TableCell className="text-right tabular-nums">{MXN.format(Number(row.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inmuebles */}
      <Card>
        <CardHeader>
          <CardTitle>Inmuebles</CardTitle>
          <CardDescription>Propiedades bajo esta razón social — haz clic para ver el reporte por inmueble</CardDescription>
        </CardHeader>
        <CardContent>
          {data.properties.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin inmuebles asociados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inmueble</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">Ocupación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.properties.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/reportes/inmueble/${p.id}?year=${data.year}&from=${data.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {propertyTypeLabel(p.type as PropertyType)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {p.isOwner && <Badge variant="default">Dueño</Badge>}
                        {p.isManager && !p.isOwner && <Badge variant="secondary">Administrador</Badge>}
                        {p.isOwner && p.isManager && <Badge variant="secondary">Administrador</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.totalUnits > 0
                        ? `${p.occupiedUnits}/${p.totalUnits} (${Math.round((p.occupiedUnits / p.totalUnits) * 100)}%)`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Egresos recientes */}
      <Card>
        <CardHeader>
          <CardTitle>Egresos recientes</CardTitle>
          <CardDescription>Últimos 20 movimientos del año</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentExpenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin egresos registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentExpenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{capitalizeFirst(DATE.format(e.expenseDate))}</TableCell>
                    <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.vendor ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{MXN.format(Number(e.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
