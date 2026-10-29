import { AlertTriangle, CheckCircle2, Clock, Wrench } from "lucide-react";
import { MaintenancesTable } from "@/components/maintenances/MaintenancesTable";
import { NewMaintenanceDialog } from "@/components/maintenances/NewMaintenanceDialog";
import { MetricCard } from "@/components/shared/metric-card";
import { MobileMaintenances } from "@/components/mobile/MobileMaintenances";
import { getIsMobileView } from "@/server/mobile/viewport";
import { requireAuth } from "@/server/auth/get-session";
import { hasPermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import {
  getMaintenanceSummary,
  getMaintenances,
  getPropertiesForMaintenanceForm,
} from "@/server/services/maintenances-queries";
import { formatMXN } from "@/shared/format-currency";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function MantenimientosPage({ searchParams }: PageProps) {
  const { tenantId, dbUser } = await requireAuth();
  const params = await searchParams;

  if (await getIsMobileView()) {
    return <MobileMaintenances maintenances={await getMaintenances()} />;
  }

  const requestedYear = Number(params.year);
  const year =
    Number.isFinite(requestedYear) && requestedYear > 1900
      ? requestedYear
      : new Date().getUTCFullYear();

  const oldestMaintenance = await prisma.maintenance.findFirst({
    where: { tenantId },
    orderBy: { scheduledDate: "asc" },
    select: { scheduledDate: true },
  });
  const minYear = oldestMaintenance?.scheduledDate
    ? Math.min(oldestMaintenance.scheduledDate.getUTCFullYear(), year - 1)
    : year - 1;
  const currentYear = new Date().getUTCFullYear();
  const maxYear = Math.max(currentYear, year) + 1;
  const availableYears: number[] = [];
  for (let y = maxYear; y >= minYear; y--) availableYears.push(y);

  const [maintenances, properties, summary, canManage] = await Promise.all([
    getMaintenances({ year }),
    getPropertiesForMaintenanceForm(),
    getMaintenanceSummary(),
    hasPermission(dbUser.id, "expense.create"),
  ]);

  const active = summary.planned + summary.inProgress;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mantenimientos</h1>
        {canManage && <NewMaintenanceDialog properties={properties} />}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Activos"
          value={active}
          subValue={`${summary.planned} planeados · ${summary.inProgress} en curso`}
          icon={Wrench}
          color={active > 0 ? "warning" : "default"}
        />
        <MetricCard
          label="Vencidos"
          value={summary.overdue}
          subValue="requieren atención"
          icon={AlertTriangle}
          color={summary.overdue > 0 ? "danger" : "success"}
        />
        <MetricCard
          label="Completados"
          value={summary.completed}
          subValue="trabajos terminados"
          icon={CheckCircle2}
          color="success"
        />
        <MetricCard
          label="Costo total"
          value={<span className="tabular-nums">{formatMXN(summary.totalCompletedCost, 2)}</span>}
          subValue="en mantenimientos completados"
          icon={Clock}
        />
      </div>

      <MaintenancesTable
        maintenances={maintenances}
        properties={properties}
        canManage={canManage}
        year={year}
        availableYears={availableYears}
      />
    </div>
  );
}
