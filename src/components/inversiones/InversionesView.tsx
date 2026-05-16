"use client";

import {
  BadgeDollarSign,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  Landmark,
  Percent,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RegisterLoanPaymentDialog,
  type LoanPaymentTarget,
} from "@/components/inversiones/RegisterLoanPaymentDialog";
import { capitalizeFirst, cn } from "@/lib/utils";
import type {
  InversionesKpis,
  InvestmentProjectListItem,
  LoanPaymentStatus,
  LoanYearlyCell,
  LoanYearlyRow,
  LoansYearlyMatrix,
} from "@/lib/services/inversiones-queries";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const MXN_INT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const PERIOD_LONG = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_MED = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const LOAN_TYPE_LABEL: Record<string, string> = {
  VEHICLE: "Vehículo",
  MORTGAGE: "Hipoteca",
  PERSONAL: "Personal",
  CORPORATE: "Corporativo",
  LINE_OF_CREDIT: "L. Crédito",
  OTHER: "Otro",
};

const ENTITY_THEME: Record<string, { dot: string; text: string; badge: string }> = {
  CRT: { dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  TSR: { dot: "bg-blue-500",   text: "text-blue-700 dark:text-blue-300",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"   },
  QHS: { dot: "bg-emerald-500",text: "text-emerald-700",                   badge: "bg-emerald-100 text-emerald-700"                                     },
};
const DEFAULT_THEME = { dot: "bg-slate-500", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" };
function themeFor(code: string) { return ENTITY_THEME[code] ?? DEFAULT_THEME; }

// Cell colors — same palette as egresos
const CELL_BG: Record<LoanPaymentStatus, string> = {
  PAID:      "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-500",
  PENDING:   "bg-amber-400 hover:bg-amber-500 dark:bg-amber-500",
  SCHEDULED: "bg-slate-200 dark:bg-slate-700/60",
  EMPTY:     "bg-muted",
};

function compactMxn(n: number): string {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

interface Props {
  kpis: InversionesKpis;
  matrix: LoansYearlyMatrix;
  availableYears: number[];
  projects: InvestmentProjectListItem[];
}

export function InversionesView({ kpis, matrix, availableYears, projects }: Props) {
  const [payTarget, setPayTarget] = useState<LoanPaymentTarget | null>(null);

  return (
    <div className="space-y-6">
      <KpiCards kpis={kpis} year={matrix.year} />
      <LoanMatrix
        matrix={matrix}
        availableYears={availableYears}
        onCellClick={setPayTarget}
      />
      <ProjectsSection projects={projects} />

      <RegisterLoanPaymentDialog
        target={payTarget}
        onClose={() => setPayTarget(null)}
      />
    </div>
  );
}

// ============================================================================
// KPI CARDS
// ============================================================================

function KpiCards({ kpis, year }: { kpis: InversionesKpis; year: number }) {
  const projectProgress =
    kpis.totalProjectBudget > 0
      ? (kpis.totalProjectExecuted / kpis.totalProjectBudget) * 100
      : 0;
  const projectRemaining = kpis.totalProjectBudget - kpis.totalProjectExecuted;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={<CreditCard className="size-4" />}
        label="Pago mensual"
        value={MXN_INT.format(kpis.totalMonthlyLoanPayment)}
        sub={`${kpis.activeLoans} financiamiento${kpis.activeLoans !== 1 ? "s" : ""} activo${kpis.activeLoans !== 1 ? "s" : ""}`}
      />
      <KpiCard
        icon={<Wallet className="size-4" />}
        label={`Pagado ${year}`}
        value={MXN_INT.format(kpis.paidThisYear)}
        sub="Cuotas liquidadas en el año"
        valueClass="text-green-700 dark:text-green-300"
      />
      <KpiCard
        icon={<Clock className="size-4" />}
        label={`Pendiente ${year}`}
        value={MXN_INT.format(kpis.pendingThisYear)}
        sub="Por pagar hasta diciembre"
        valueClass={kpis.pendingThisYear > 0 ? "text-amber-700 dark:text-amber-300" : undefined}
      />
      <KpiCard
        icon={<Building2 className="size-4" />}
        label="Inversión Quiroga"
        value={`${projectProgress.toFixed(1)}%`}
        sub={`${MXN_INT.format(projectRemaining)} por entregar`}
        progress={projectProgress}
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
// LOAN MATRIX
// ============================================================================

function LoanMatrix({
  matrix,
  availableYears,
  onCellClick,
}: {
  matrix: LoansYearlyMatrix;
  availableYears: number[];
  onCellClick: (target: LoanPaymentTarget) => void;
}) {
  function navigate(delta: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(matrix.year + delta));
    window.location.href = url.toString();
  }
  function selectYear(y: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("year", y);
    window.location.href = url.toString();
  }

  const totalPaid = matrix.rows.reduce((s, r) => s + r.paidTotal, 0);
  const totalYear = matrix.rows.reduce((s, r) => s + r.yearTotal, 0);
  const pct = totalYear > 0 ? Math.round((totalPaid / totalYear) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Préstamos y Financiamientos</h2>
        </div>
        {/* Year nav */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            aria-label="Año anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Select
            value={String(matrix.year)}
            onValueChange={(v) => v && selectYear(v)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(1)}
            aria-label="Año siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryPill
          icon={<Wallet className="size-3.5" />}
          label={`Estimado ${matrix.year}`}
          value={MXN_INT.format(totalYear)}
        />
        <SummaryPill
          icon={<Wallet className="size-3.5 text-green-600" />}
          label="Pagado"
          value={MXN_INT.format(totalPaid)}
          accent="text-green-700 dark:text-green-300"
        />
        <SummaryPill
          icon={<Percent className="size-3.5 text-muted-foreground" />}
          label="% Pagado"
          value={`${pct}%`}
          progress={pct}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {(
          [
            { status: "PAID",      label: "Pagado"     },
            { status: "PENDING",   label: "Pendiente"  },
            { status: "SCHEDULED", label: "Por vencer" },
            { status: "EMPTY",     label: "Sin cargo"  },
          ] as { status: LoanPaymentStatus; label: string }[]
        ).map(({ status, label }) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded border", CELL_BG[status])} />
            {label}
          </div>
        ))}
      </div>

      {matrix.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No hay préstamos registrados para {matrix.year}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-56" />
                <col className="w-20" />
                {MONTHS_SHORT.map((m) => (
                  <col key={m} className="w-20" />
                ))}
                <col className="w-28" />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/10">
                  <th className="sticky left-0 z-10 bg-muted/10 px-3 py-2 text-left font-medium">
                    Préstamo
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    Tipo
                  </th>
                  {MONTHS_SHORT.map((m) => (
                    <th key={m} className="px-1 py-2 text-center font-medium text-muted-foreground">
                      {m}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <LoanMatrixRow
                    key={row.loanId}
                    row={row}
                    onCellClick={onCellClick}
                  />
                ))}
                {/* TOTAL INVERSIONES footer */}
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                    Total Inversiones
                  </td>
                  <td className="px-2 py-2" />
                  {MONTHS_SHORT.map((_, i) => {
                    const t = matrix.monthlyTotals[i]!;
                    return (
                      <td key={i} className="px-1 py-2 text-center text-[10px] tabular-nums text-muted-foreground">
                        {compactMxn(t.expected)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    <div className="text-green-700 dark:text-green-300">
                      {MXN_INT.format(totalPaid)}
                    </div>
                    <div className="text-muted-foreground">
                      de {MXN_INT.format(totalYear)}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly totals bar */}
      <MonthlyTotalsTable totals={matrix.monthlyTotals} />
    </div>
  );
}

function SummaryPill({
  icon,
  label,
  value,
  accent,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={cn("mt-0.5 text-base font-semibold tabular-nums", accent)}>
        {value}
      </p>
      {typeof progress === "number" && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              progress >= 80 ? "bg-green-500" : progress >= 50 ? "bg-amber-500" : "bg-red-500",
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function LoanMatrixRow({
  row,
  onCellClick,
}: {
  row: LoanYearlyRow;
  onCellClick: (target: LoanPaymentTarget) => void;
}) {
  const theme = themeFor(row.entityCode);

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20">
      <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span
            className={cn("size-2 shrink-0 rounded-full", theme.dot)}
          />
          <div>
            <div className="truncate text-sm font-medium leading-tight" title={row.name}>
              {row.name}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {row.lender ?? ""}
            </div>
          </div>
        </div>
      </td>
      <td className="px-2 py-1.5">
        <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", theme.badge)}>
          {row.entityCode}
        </span>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {LOAN_TYPE_LABEL[row.type] ?? row.type}
        </div>
      </td>
      {row.cells.map((cell, i) => (
        <td key={i} className="px-1 py-1.5">
          <MatrixCell
            cell={cell}
            tooltip={`${row.name} — ${capitalizeFirst(PERIOD_LONG.format(cell.period))}`}
            onClick={() => {
              if (cell.status === "EMPTY" || cell.status === "PAID") return;
              onCellClick({
                loanId: row.loanId,
                loanPaymentId: cell.loanPaymentId,
                loanName: row.name,
                entityCode: row.entityCode,
                period: cell.period,
                amount: cell.amount,
              });
            }}
          />
        </td>
      ))}
      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
        <div className="font-medium text-green-700 dark:text-green-300">
          {MXN_INT.format(row.paidTotal)}
        </div>
        <div className="text-muted-foreground">de {MXN_INT.format(row.yearTotal)}</div>
      </td>
    </tr>
  );
}

function MatrixCell({ cell, tooltip, onClick }: {
  cell: LoanYearlyCell;
  tooltip: string;
  onClick: () => void;
}) {
  const clickable = cell.status === "PENDING" || cell.status === "SCHEDULED";
  const label =
    cell.status === "EMPTY"
      ? null
      : (
        <span className={cn(
          "block w-full px-0.5 text-center text-[10px] tabular-nums",
          cell.status === "PAID" ? "font-medium text-white drop-shadow-sm" : "text-foreground/80",
        )}>
          {compactMxn(cell.amount)}
        </span>
      );

  const fullTooltip =
    cell.status === "EMPTY"
      ? `${tooltip} — Sin cuota`
      : cell.status === "PAID"
        ? `${tooltip}\nPagado: ${MXN.format(cell.amount)}`
        : cell.status === "PENDING"
          ? `${tooltip}\nPendiente: ${MXN.format(cell.amount)} — Click para registrar`
          : `${tooltip}\nProgramado: ${MXN.format(cell.amount)}`;

  if (!clickable) {
    return (
      <div
        title={fullTooltip}
        className={cn(
          "mx-auto flex h-6 w-full items-center justify-center rounded",
          CELL_BG[cell.status],
        )}
      >
        {label}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={fullTooltip}
      onClick={onClick}
      className={cn(
        "mx-auto flex h-6 w-full items-center justify-center rounded transition-colors",
        CELL_BG[cell.status],
      )}
    >
      {label}
    </button>
  );
}

function MonthlyTotalsTable({
  totals,
}: {
  totals: LoansYearlyMatrix["monthlyTotals"];
}) {
  const peak = Math.max(...totals.map((t) => t.expected), 1);
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <h3 className="text-sm font-semibold">Totales mensuales</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-green-500" /> Pagado
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-amber-400" /> Pendiente
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[520px] w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/10 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Mes</th>
              <th className="px-3 py-2 text-right font-medium">Estimado</th>
              <th className="px-3 py-2 text-right font-medium">Pagado</th>
              <th className="px-3 py-2 text-right font-medium">Pendiente</th>
              <th className="px-3 py-2 text-left font-medium">% Pagado</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t, i) => {
              const pct = t.expected > 0 ? Math.round((t.paid / t.expected) * 100) : 0;
              const barW = (t.expected / peak) * 100;
              const fillW = t.expected > 0 ? (t.paid / t.expected) * 100 : 0;
              return (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5">
                    {capitalizeFirst(PERIOD_LONG.format(t.period))}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {MXN_INT.format(t.expected)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-green-700 dark:text-green-300">
                    {MXN_INT.format(t.paid)}
                  </td>
                  <td className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    t.pending > 0 && "text-amber-700 dark:text-amber-300",
                  )}>
                    {t.pending > 0 ? MXN_INT.format(t.pending) : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="relative h-2 overflow-hidden rounded-full bg-muted"
                        style={{ width: `${Math.max(16, barW)}%` }}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full",
                            pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : pct > 0 ? "bg-red-500" : "bg-transparent",
                          )}
                          style={{ width: `${Math.min(100, fillW)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
              <div className="font-mono text-sm font-semibold">{MXN_INT.format(project.budgetAmount)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Entregado</div>
              <div className="font-mono text-sm font-semibold text-green-700 dark:text-green-300">
                {MXN_INT.format(project.executedAmount)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Por entregar</div>
              <div className={cn(
                "font-mono text-sm font-semibold",
                remaining < 0 ? "text-destructive" : "text-amber-700 dark:text-amber-300",
              )}>
                {MXN_INT.format(remaining)}
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
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.payments.map((pay) => (
                <TableRow key={pay.id}>
                  <TableCell className="text-sm">{pay.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {DATE_MED.format(new Date(pay.paymentDate))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {MXN.format(pay.amount)}
                  </TableCell>
                  <TableCell>
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
