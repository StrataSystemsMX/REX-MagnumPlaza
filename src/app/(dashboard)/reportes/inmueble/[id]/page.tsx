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
import {
  maintenanceStatusLabel,
  maintenanceTypeLabel,
  propertyTypeLabel,
  unitStatusLabel,
} from "@/lib/i18n/enums";
import { getPropertyReport } from "@/lib/services/property-report-queries";
import type {
  MaintenanceStatus,
  MaintenanceType,
  PropertyType,
  UnitStatus,
} from "@/generated/prisma/enums";
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

  // Estado del seguro: días para vencer (negativo = ya vencido). La ventana de
  // 60 días empata con la alerta del dashboard.
  const insuranceDaysLeft = data.insuranceExpiresAt
    ? Math.floor((data.insuranceExpiresAt.getTime() - Date.now()) / 86_400_000)
    : null;

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

      {/* Seguro del inmueble */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Seguro</CardTitle>
              <CardDescription>Póliza y vencimiento del inmueble</CardDescription>
            </div>
            {insuranceDaysLeft === null ? (
              <Badge variant="outline">Sin registrar</Badge>
            ) : insuranceDaysLeft < 0 ? (
              <Badge variant="destructive">Vencido</Badge>
            ) : insuranceDaysLeft <= 60 ? (
              <Badge className="border-amber-300 bg-amber-100 text-amber-900">
                Por vencer · {insuranceDaysLeft}d
              </Badge>
            ) : (
              <Badge variant="secondary">Vigente</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {insuranceDaysLeft === null ? (
            <p className="text-sm text-muted-foreground">
              No se ha registrado el seguro de este inmueble. Agrégalo desde la
              edición del inmueble para recibir avisos de vencimiento.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Aseguradora</p>
                <p className="font-medium">{data.insuranceProvider || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Póliza</p>
                <p className="font-medium">{data.insurancePolicyNumber || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vence</p>
                <p className="font-medium">
                  {data.insuranceExpiresAt
                    ? capitalizeFirst(DATE.format(data.insuranceExpiresAt))
                    : "—"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Predial */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Predial</CardTitle>
          <CardDescription>Pagos prediales registrados de este inmueble</CardDescription>
        </CardHeader>
        <CardContent>
          {data.cadastralPayments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sin prediales registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Año</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Paga</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.cadastralPayments.map((c) => {
                    const overdue = !c.isPaid && c.dueDate.getTime() < Date.now();
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.year}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.totalAmount ? money(c.totalAmount) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.paidAmount ? money(c.paidAmount) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {capitalizeFirst(DATE.format(c.dueDate))}
                        </TableCell>
                        <TableCell>
                          {c.isPaid ? (
                            <Badge variant="secondary">Pagado</Badge>
                          ) : overdue ? (
                            <Badge variant="destructive">Vencido</Badge>
                          ) : (
                            <Badge variant="outline">Pendiente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.payerLabel ?? "Dueño"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mantenimiento */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Mantenimiento</CardTitle>
              <CardDescription>Mantenimientos del inmueble — {data.year}</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Gasto del año</p>
              <p className="text-lg font-semibold tabular-nums">
                {money(data.maintenanceYearCost)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data.maintenances.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sin mantenimientos en {data.year}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead>Proveedor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.maintenances.map((m) => {
                    const date = m.completedDate ?? m.scheduledDate;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {date ? capitalizeFirst(DATE.format(date)) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.unitCode ?? "Inmueble"}
                        </TableCell>
                        <TableCell className="font-medium">{m.title}</TableCell>
                        <TableCell className="text-sm">
                          {maintenanceTypeLabel(m.type as MaintenanceType)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {maintenanceStatusLabel(m.status as MaintenanceStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.cost ? money(m.cost) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.vendor ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
