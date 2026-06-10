import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { propertyTypeLabel, unitStatusLabel } from "@/lib/i18n/enums";
import { getPropertyReport } from "@/lib/services/property-report-queries";
import type { PropertyType, UnitStatus } from "@/generated/prisma/enums";
import { capitalizeFirst } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; from?: string }>;
}

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

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function money(v: string | number): string {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? MXN.format(n) : "—";
}

export default async function PropertyReportPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { year: yearParam, from } = await searchParams;

  const { dbUser } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);
  const canSee =
    roles.includes("MASTER") || roles.includes("ACCOUNTANT") || roles.includes("ADMIN");
  if (!canSee) redirect("/");

  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
  const data = await getPropertyReport(dbUser.tenantId, id, year);
  if (!data) notFound();

  const backHref = from ? `/legal-entity/${from}?year=${data.year}` : "/reportes";

  const occupancyPct =
    data.totalUnits > 0 ? Math.round((data.occupiedUnits / data.totalUnits) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" render={<Link href={backHref} />}>
            <ArrowLeft className="size-4" />
            Volver
          </Button>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{data.propertyName}</h1>
          <p className="text-sm text-muted-foreground">
            {propertyTypeLabel(data.propertyType as PropertyType)}
            {data.ownerCode ? ` · Dueño: ${data.ownerCode}` : ""}
            {data.managerCode ? ` · Administrador: ${data.managerCode}` : ""}
            {" · "}
            <span className="font-medium">{data.year}</span>
          </p>
        </div>
        <a
          href={`/api/reportes/inmueble/${id}/pdf?year=${data.year}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <FileDown className="size-4" />
          Exportar PDF
        </a>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ingresos del año</CardDescription>
            <CardTitle className="text-xl">{money(data.totalIncome)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Locales totales</CardDescription>
            <CardTitle className="text-xl">{data.totalUnits}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ocupados</CardDescription>
            <CardTitle className="text-xl">{data.occupiedUnits}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ocupación</CardDescription>
            <CardTitle className="text-xl">{occupancyPct}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabla mensual */}
      <Card>
        <CardHeader>
          <CardTitle>Ingresos por mes</CardTitle>
          <CardDescription>Pagos recibidos de todos los locales — {data.year}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                {MONTH_NAMES.map((n) => (
                  <TableHead key={n} className="text-right">{n}</TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                {data.monthlyIncome.map((v, i) => (
                  <TableCell key={i} className="text-right tabular-nums">{money(v)}</TableCell>
                ))}
                <TableCell className="text-right font-semibold tabular-nums">{money(data.totalIncome)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Locales */}
      <Card>
        <CardHeader>
          <CardTitle>Locales / Espacios</CardTitle>
          <CardDescription>Estado actual, inquilino activo, ingresos del año y saldo pendiente</CardDescription>
        </CardHeader>
        <CardContent>
          {data.units.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin espacios registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Local</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Inquilino</TableHead>
                  <TableHead className="text-right">Renta mensual</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Ingresos {data.year}</TableHead>
                  <TableHead className="text-right">Adeudo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.units.map((u) => (
                  <TableRow key={u.unitId}>
                    <TableCell>
                      <span className="font-medium">{u.unitName}</span>
                      {u.unitCode !== u.unitName && (
                        <span className="ml-1 text-xs text-muted-foreground">({u.unitCode})</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          u.status === "OCUPADO"
                            ? "default"
                            : u.status === "DISPONIBLE"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {unitStatusLabel(u.status as UnitStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.contractId ? (
                        <Link
                          href={`/contracts/${u.contractId}`}
                          className="hover:underline"
                        >
                          {u.lesseeName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.monthlyAmount ? money(u.monthlyAmount) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {u.contractEndDate
                        ? capitalizeFirst(DATE.format(u.contractEndDate))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(u.ytdIncome)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(u.arBalance) > 0 ? (
                        <span className="font-medium text-rose-600">{money(u.arBalance)}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
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
