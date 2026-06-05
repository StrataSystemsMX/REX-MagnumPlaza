"use client";

import {
  Building2,
  ChevronDown,
  ChevronUp,
  Landmark,
  Percent,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";
import type {
  InversionesKpis,
  InvestmentProjectListItem,
} from "@/lib/services/inversiones-queries";

const ENTITY_THEME: Record<string, { dot: string; text: string; badge: string }> = {
  CRT: { dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  TSR: { dot: "bg-blue-500",   text: "text-blue-700 dark:text-blue-300",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"   },
  QHS: { dot: "bg-emerald-500",text: "text-emerald-700",                   badge: "bg-emerald-100 text-emerald-700"                                     },
};
const DEFAULT_THEME = { dot: "bg-slate-500", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" };
function themeFor(code: string) { return ENTITY_THEME[code] ?? DEFAULT_THEME; }

interface Props {
  kpis: InversionesKpis;
  projects: InvestmentProjectListItem[];
}

export function InversionesView({ kpis, projects }: Props) {
  return (
    <div className="space-y-6">
      <KpiCards kpis={kpis} />
      <ProjectsSection projects={projects} />
    </div>
  );
}

// ============================================================================
// KPI CARDS
// ============================================================================

function KpiCards({ kpis }: { kpis: InversionesKpis }) {
  const remaining = kpis.totalProjectBudget - kpis.totalProjectExecuted;
  const progress =
    kpis.totalProjectBudget > 0
      ? (kpis.totalProjectExecuted / kpis.totalProjectBudget) * 100
      : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={<Landmark className="size-4" />}
        label="Inversión total"
        value={formatMXN(kpis.totalProjectBudget)}
        sub="Suma contratada"
      />
      <KpiCard
        icon={<Wallet className="size-4" />}
        label="Ejecutado"
        value={formatMXN(kpis.totalProjectExecuted)}
        sub={`${formatMXN(remaining)} por entregar`}
        valueClass="text-green-700 dark:text-green-300"
      />
      <KpiCard
        icon={<Percent className="size-4" />}
        label="Avance global"
        value={`${progress.toFixed(1)}%`}
        sub="Ejecutado / presupuesto"
        progress={progress}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  progress,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  progress?: number;
  valueClass?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">{icon}</span>
          {label}
        </div>
        <p className={cn("text-xl font-semibold tabular-nums leading-none", valueClass)}>{value}</p>
        {typeof progress === "number" ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// PROYECTOS DE INVERSIÓN
// ============================================================================

const PROJECT_STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planeación",
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

const PROJECT_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PLANNING: "secondary",
  ACTIVE: "default",
  PAUSED: "outline",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

function ProjectsSection({ projects }: { projects: InvestmentProjectListItem[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Proyectos de Inversión</h2>
        <Badge variant="secondary" className="ml-auto">
          {projects.length} proyecto{projects.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No hay proyectos de inversión registrados.
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: InvestmentProjectListItem }) {
  const [expanded, setExpanded] = useState(false);
  const remaining = project.budgetAmount - project.executedAmount;
  const progress =
    project.budgetAmount > 0
      ? Math.min(100, (project.executedAmount / project.budgetAmount) * 100)
      : 0;

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-muted"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{project.name}</span>
            <Badge variant={PROJECT_STATUS_VARIANT[project.status] ?? "secondary"} className="text-xs">
              {PROJECT_STATUS_LABEL[project.status] ?? project.status}
            </Badge>
            <span className={cn(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              themeFor(project.legalEntity.code).badge,
            )}>
              {project.legalEntity.code}
            </span>
            {project.property && (
              <span className="text-xs text-muted-foreground">· {project.property.name}</span>
            )}
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
          )}

          {/* TOTAL | ENTREGADO | POR ENTREGAR */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total contratado</div>
              <div className="font-mono text-sm font-semibold">{formatMXN(project.budgetAmount)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Entregado</div>
              <div className="font-mono text-sm font-semibold text-green-700 dark:text-green-300">
                {formatMXN(project.executedAmount)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Por entregar</div>
              <div className={cn(
                "font-mono text-sm font-semibold",
                remaining < 0 ? "text-destructive" : "text-amber-700 dark:text-amber-300",
              )}>
                {formatMXN(remaining)}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Avance — {progress.toFixed(1)}%
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded: payments table */}
      {expanded && (
        <div className="border-t">
          <div className="bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Estimaciones y pagos
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-center">Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.payments.map((pay) => (
                <TableRow key={pay.id}>
                  <TableCell className="text-sm">{pay.description}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {formatDate(pay.paymentDate)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMXN(pay.amount, 2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={pay.isPaid ? "secondary" : "outline"} className="text-xs">
                      {pay.isPaid ? "Entregado" : "Pendiente"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
