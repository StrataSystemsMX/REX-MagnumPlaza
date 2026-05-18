import type { MaintenanceResponsibility, MaintenanceStatus, MaintenanceType } from "@/generated/prisma/enums";

const STATUS_CONFIG: Record<MaintenanceStatus, { label: string; className: string }> = {
  PLANNED: { label: "Planeado", className: "bg-blue-100 text-blue-800" },
  IN_PROGRESS: { label: "En curso", className: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "Completado", className: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Cancelado", className: "bg-neutral-100 text-neutral-600" },
  OVERDUE: { label: "Vencido", className: "bg-rose-100 text-rose-800" },
};

const TYPE_CONFIG: Record<MaintenanceType, { label: string }> = {
  PERIODIC: { label: "Periódico" },
  CORRECTIVE: { label: "Correctivo" },
  PREVENTIVE: { label: "Preventivo" },
  EMERGENCY: { label: "Emergencia" },
  REMODELING: { label: "Remodelación" },
};

const RESP_CONFIG: Record<MaintenanceResponsibility, { label: string; className: string }> = {
  OWNER: { label: "Propietario", className: "bg-purple-100 text-purple-800" },
  LESSEE: { label: "Inquilino", className: "bg-sky-100 text-sky-800" },
  SHARED: { label: "Compartido", className: "bg-orange-100 text-orange-800" },
};

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

export function MaintenanceTypeBadge({ type }: { type: MaintenanceType }) {
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
      {TYPE_CONFIG[type].label}
    </span>
  );
}

export function MaintenanceResponsibilityBadge({ responsibility }: { responsibility: MaintenanceResponsibility }) {
  const { label, className } = RESP_CONFIG[responsibility];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
