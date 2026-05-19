import { AlertTriangle, CheckCircle2, Clock, Wrench } from "lucide-react";
import { MaintenancesTable } from "@/components/maintenances/MaintenancesTable";
import { NewMaintenanceDialog } from "@/components/maintenances/NewMaintenanceDialog";
import { MetricCard } from "@/components/shared/metric-card";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getMaintenanceSummary,
  getMaintenances,
  getPropertiesForMaintenanceForm,
} from "@/lib/services/maintenances-queries";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default async function MantenimientosPage() {
  const { dbUser } = await requireAuth();

  const [maintenances, properties, summary, canManage] = await Promise.all([
    getMaintenances(),
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
          value={<span className="tabular-nums">{MXN.format(summary.totalCompletedCost)}</span>}
          subValue="en mantenimientos completados"
          icon={Clock}
        />
      </div>

      <MaintenancesTable
        maintenances={maintenances}
        properties={properties}
        canManage={canManage}
      />
    </div>
  );
}
