import {
  AlertTriangle,
  Building2,
  Download,
  HandCoins,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { IncomeChart, OccupancyChart } from "@/components/dashboard/charts";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { MetricCard } from "@/components/shared/metric-card";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  getDashboardMetrics,
  parseMonth,
  type DashboardMetrics,
} from "@/lib/services/dashboard-metrics";

interface DashboardPageProps {
  searchParams: Promise<{ month?: string; legalEntity?: string }>;
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const RELATIVE = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });
const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_LABEL = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthLabel(yyyymm: string): string {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(5, 7));
  return MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, 1)));
}

function relativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const minutes = Math.round(diffMs / (1000 * 60));
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return RELATIVE.format(days, "day");
  const months = Math.round(days / 30);
  return RELATIVE.format(months, "month");
}

function buildMonthOptions(currentMonth: string): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = [];
  const y = Number(currentMonth.slice(0, 4));
  const m = Number(currentMonth.slice(5, 7));
  for (let i = -3; i <= 3; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    opts.push({ value, label: monthLabel(value) });
  }
  return opts;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { dbUser } = await requireAuth();
  const params = await searchParams;
  const roles = await getUserRoleCodes(dbUser.id);

  // Permisos por rol
  const isMaster = roles.includes("MASTER");
  const isAdmin = roles.includes("ADMIN");
  const isAccountant = roles.includes("ACCOUNTANT");
  const isPromoter = roles.includes("PROMOTER");
  const isLessee = roles.includes("LESSEE");

  if (isPromoter || isLessee) {
    // Roles externos no ven dashboard ejecutivo. Redirigimos a sus vistas.
    redirect(isPromoter ? "/promoter" : "/portal");
  }

  // Si no tiene ningún rol todavía (caso fresh user en dev), tratamos como admin.
  const canSeeAll = isMaster || isAccountant || isAdmin || roles.length === 0;
  if (!canSeeAll) redirect("/portal");

  const canSeeLegalEntities = isMaster || isAccountant || roles.length === 0;

  const monthParam = params.month;
  const legalEntityParam = params.legalEntity;
  const { month } = parseMonth(monthParam);

  const metrics = await getDashboardMetrics(dbUser.tenantId, {
    month: monthParam,
    legalEntityId: legalEntityParam,
  });

  const legalEntities = await prisma.legalEntity.findMany({
    where: { tenantId: dbUser.tenantId, isActive: true },
    select: { id: true, code: true, legalName: true },
    orderBy: { code: "asc" },
  });

  const monthOptions = buildMonthOptions(month);

  const expected = Number(metrics.summary.totalMonthlyExpectedIncome);
  const collected = Number(metrics.summary.totalCollectedThisMonth);
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  const occupancyTrendData = metrics.byProperty.map((p) => ({
    propertyName: p.propertyName,
    occupancyRate: p.occupancyRate,
    totalUnits: p.totalUnits,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hola, {dbUser.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Panorama de {monthLabel(month)}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardFilters
            currentMonth={month}
            currentLegalEntity={legalEntityParam ?? "all"}
            monthOptions={monthOptions}
            legalEntities={legalEntities}
            canSeeLegalEntityFilter={canSeeLegalEntities}
          />
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href={`/api/dashboard/export?month=${encodeURIComponent(month)}${
                  legalEntityParam
                    ? `&legalEntity=${encodeURIComponent(legalEntityParam)}`
                    : ""
                }`}
                target="_blank"
              />
            }
          >
            <Download className="size-4" />
            Exportar PDF
          </Button>
        </div>
      </header>

      {metrics.alerts.length > 0 ? <AlertsBanner alerts={metrics.alerts} /> : null}

      {/* Fila 1 — KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Inmuebles"
          value={metrics.summary.totalProperties}
          subValue={`${metrics.summary.totalUnits} unidades · ${Math.round(
            metrics.summary.occupancyRate * 100,
          )}% ocupadas`}
          icon={Building2}
          footer={
            metrics.summary.vacantUnits > 0
              ? `${metrics.summary.vacantUnits} disponibles`
              : "Todas ocupadas"
          }
        />
        <MetricCard
          label="Ingreso esperado del mes"
          value={MXN.format(expected)}
          subValue={`${metrics.summary.activeContracts} contratos activos`}
          icon={TrendingUp}
        />
        <MetricCard
          label="Cobrado este mes"
          value={MXN.format(collected)}
          subValue={`${collectionRate}% del esperado`}
          icon={HandCoins}
          color={collectionRate >= 80 ? "success" : collectionRate >= 50 ? "default" : "warning"}
        />
        <MetricCard
          label="Por cobrar"
          value={MXN.format(Number(metrics.summary.totalOutstanding))}
          icon={Wallet}
          color={
            metrics.summary.overdueByLevel["3M"] > 0
              ? "danger"
              : metrics.summary.overdueByLevel["2M"] > 0
                ? "warning"
                : "default"
          }
          footer={
            <span>
              1M: {metrics.summary.overdueByLevel["1M"]} · 2M:{" "}
              {metrics.summary.overdueByLevel["2M"]} · 3M:{" "}
              {metrics.summary.overdueByLevel["3M"]}
            </span>
          }
        />
      </div>

      {/* Fila 2 — Gráficas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingreso esperado vs cobrado</CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <IncomeChart data={metrics.trends.monthlyIncome} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ocupación por inmueble</CardTitle>
            <CardDescription>Porcentaje de unidades rentadas</CardDescription>
          </CardHeader>
          <CardContent>
            {occupancyTrendData.length === 0 ? (
              <EmptyState message="Aún no hay inmuebles activos." />
            ) : (
              <OccupancyChart data={occupancyTrendData} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fila 3 — Top morosos + contratos por vencer */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopOverdueCard rows={metrics.topOverdue} />
        <ExpiringContractsCard tenantId={dbUser.tenantId} />
      </div>

      {/* Fila 4 — Por LegalEntity */}
      {canSeeLegalEntities && metrics.byLegalEntity.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {metrics.byLegalEntity.map((le) => (
            <LegalEntityCard key={le.legalEntityId} le={le} />
          ))}
        </div>
      ) : null}

      {/* Fila 5 — Actividad reciente */}
      <Card>
        <CardHeader>
          <CardTitle>Actividad reciente</CardTitle>
          <CardDescription>Últimas 20 acciones registradas en el sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.recentActivity.length === 0 ? (
            <EmptyState message="Aún no hay actividad registrada." />
          ) : (
            <ul className="divide-y text-sm">
              {metrics.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between py-2">
                  <span>{entry.description}</span>
                  <span className="shrink-0 pl-3 text-xs text-muted-foreground">
                    {relativeTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertsBanner({ alerts }: { alerts: DashboardMetrics["alerts"] }) {
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const isCritical = a.level === "critical";
        return (
          <div
            key={i}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              isCritical
                ? "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100"
                : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
            }`}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{a.message}</span>
          </div>
        );
      })}
    </div>
  );
}

function TopOverdueCard({ rows }: { rows: DashboardMetrics["topOverdue"] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Top inquilinos morosos</CardTitle>
          <CardDescription>Top 10 por adeudo</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/collections/overdue" />}
        >
          Ver todos
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState message="¡Sin morosos este mes!" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inquilino</TableHead>
                <TableHead className="text-right">Adeudo</TableHead>
                <TableHead className="text-right">Días</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.lesseeId}>
                  <TableCell>
                    <Link
                      href={`/lessees/${r.lesseeId}`}
                      className="font-medium hover:underline"
                    >
                      {r.legalName}
                    </Link>
                    {r.contactName ? (
                      <p className="text-xs text-muted-foreground">{r.contactName}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {MXN.format(Number(r.outstanding))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.oldestDaysOverdue > 60 ? "destructive" : "secondary"}>
                      {r.oldestDaysOverdue}d
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

async function ExpiringContractsCard({ tenantId }: { tenantId: string }) {
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const contracts = await prisma.contract.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      endDate: { gte: now, lte: end },
    },
    orderBy: { endDate: "asc" },
    take: 10,
    select: {
      id: true,
      endDate: true,
      monthlyAmount: true,
      lessee: { select: { id: true, legalName: true } },
      unit: {
        select: {
          code: true,
          property: { select: { id: true, name: true } },
        },
      },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contratos por vencer</CardTitle>
        <CardDescription>Próximos 60 días</CardDescription>
      </CardHeader>
      <CardContent>
        {contracts.length === 0 ? (
          <EmptyState message="Ningún contrato vence en los próximos 60 días." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inquilino</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/lessees/${c.lessee.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.lessee.legalName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {c.unit.property.name} · {c.unit.code}
                    </span>
                  </TableCell>
                  <TableCell>{DATE.format(c.endDate)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/contracts/${c.id}/renew`} />}
                    >
                      Renovar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LegalEntityCard({
  le,
}: {
  le: DashboardMetrics["byLegalEntity"][number];
}) {
  const profit = Number(le.profit);
  const profitColor = profit > 0 ? "text-emerald-600" : profit < 0 ? "text-rose-600" : "";
  return (
    <Link href={`/legal-entity/${le.legalEntityId}`} className="group block">
      <Card className="h-full transition-shadow group-hover:ring-2 group-hover:ring-primary/30">
        <CardHeader>
          <CardTitle className="text-base">{le.code}</CardTitle>
          <CardDescription className="line-clamp-1">{le.legalName}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Ingreso</p>
            <p className="font-medium">{MXN.format(Number(le.income))}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Egreso</p>
            <p className="font-medium">{MXN.format(Number(le.expenses))}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Utilidad</p>
            <p className={`font-semibold ${profitColor}`}>{MXN.format(profit)}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>
  );
}
