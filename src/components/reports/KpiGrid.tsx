import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  Home,
  RefreshCw,
  Timer,
  TrendingUp,
  Wrench,
} from "lucide-react";
import type { KpiSet, KpiValue } from "@/server/services/kpi-queries";

type KpiKey = keyof KpiSet;

const KPI_CONFIG: {
  key: KpiKey;
  label: string;
  icon: typeof Home;
  description: string;
}[] = [
  {
    key: "occupancyRate",
    label: "Ocupación",
    icon: Home,
    description: "% de locales actualmente rentados",
  },
  {
    key: "mrr",
    label: "Ingreso mensual",
    icon: DollarSign,
    description: "Suma de rentas contractuales activas",
  },
  {
    key: "collectionRate",
    label: "Cobranza",
    icon: CheckCircle2,
    description: "% de rentas vencidas que se cobraron",
  },
  {
    key: "overdueRate",
    label: "Cartera vencida",
    icon: AlertTriangle,
    description: "Monto vencido / total facturado en el año",
  },
  {
    key: "roi",
    label: "Rentabilidad",
    icon: BarChart3,
    description: "Ingresos netos / ingresos esperados según contratos",
  },
  {
    key: "avgVacancyDays",
    label: "Vacancia promedio",
    icon: Clock,
    description: "Días promedio sin inquilino entre contratos",
  },
  {
    key: "tenantTurnover",
    label: "Rotación",
    icon: RefreshCw,
    description: "% de inquilinos que salieron en el año",
  },
  {
    key: "renewalRate",
    label: "Renovaciones",
    icon: TrendingUp,
    description: "% de contratos que se renovaron al vencer",
  },
  {
    key: "maintenanceCostPerSqm",
    label: "Mantenimiento / m²",
    icon: Wrench,
    description: "Costo de mantenimiento completado por m² rentable",
  },
  {
    key: "avgResolutionDays",
    label: "Resolución mantenimiento",
    icon: Timer,
    description: "Días promedio para completar solicitudes de mantenimiento",
  },
];

const STATUS_STYLES: Record<
  NonNullable<KpiValue["status"]>,
  { border: string; icon: string; value: string }
> = {
  good: {
    border: "border-l-emerald-500",
    icon: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  warning: {
    border: "border-l-amber-500",
    icon: "text-amber-600 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-400",
  },
  bad: {
    border: "border-l-red-500",
    icon: "text-red-600 dark:text-red-400",
    value: "text-red-700 dark:text-red-400",
  },
  neutral: {
    border: "border-l-slate-400",
    icon: "text-muted-foreground",
    value: "text-foreground",
  },
};

function KpiCard({
  label,
  description,
  icon: Icon,
  kpi,
}: {
  label: string;
  description: string;
  icon: typeof Home;
  kpi: KpiValue | null;
}) {
  if (!kpi) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-l-4 border-l-slate-200 bg-card p-4 opacity-40 dark:border-l-slate-700">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-muted-foreground/40" strokeWidth={1.75} />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-semibold leading-none text-muted-foreground">—</p>
        <p className="text-xs text-muted-foreground">Sin datos</p>
      </div>
    );
  }

  const s = STATUS_STYLES[kpi.status];

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border border-l-4 ${s.border} bg-card p-4 shadow-sm`}
      title={description}
    >
      <div className="flex items-center gap-2">
        <Icon className={`size-3.5 ${s.icon} shrink-0`} strokeWidth={1.75} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-semibold tabular-nums leading-none ${s.value}`}>
        {kpi.formatted}
      </p>
      {kpi.detail && (
        <p className="truncate text-xs text-muted-foreground">{kpi.detail}</p>
      )}
    </div>
  );
}

export function KpiGrid({ kpiSet }: { kpiSet: KpiSet }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {KPI_CONFIG.map(({ key, label, icon, description }) => (
        <KpiCard
          key={key}
          label={label}
          icon={icon}
          description={description}
          kpi={kpiSet[key] as KpiValue | null}
        />
      ))}
    </div>
  );
}
