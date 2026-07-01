"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Wallet,
  AlertTriangle,
  Percent,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExpenseFormDialog } from "@/components/egresos/ExpenseFormDialog";
import { ManageCategoriesDialog } from "@/components/egresos/ManageCategoriesDialog";
import {
  RegisterExpenseDialog,
  type RegisterExpenseContext,
} from "@/components/egresos/RegisterExpenseDialog";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";
import { formatPeriodLong } from "@/lib/format-date";
import type {
  MonthlyExpenseStatus,
  YearlyExpenseCell,
  YearlyExpenseEntityGroup,
  YearlyExpenseRow,
  YearlyExpenses,
  ExpenseCategoryOption,
  ExpensePropertyOption,
  ManagedExpenseCategory,
} from "@/lib/services/expenses-queries";
import type { LegalEntityOption } from "@/lib/services/properties-queries";

const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const ENTITY_THEME: Record<
  string,
  { dot: string; ring: string; bg: string; text: string }
> = {
  CRT: { dot: "bg-orange-500", ring: "ring-orange-200", bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300" },
  TSR: { dot: "bg-blue-500", ring: "ring-blue-200", bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300" },
  QHS: { dot: "bg-emerald-500", ring: "ring-emerald-200", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300" },
  JCL: { dot: "bg-violet-500", ring: "ring-violet-200", bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300" },
};

const DEFAULT_THEME = {
  dot: "bg-slate-500",
  ring: "ring-slate-200",
  bg: "bg-slate-50 dark:bg-slate-900/30",
  text: "text-slate-700 dark:text-slate-300",
};

function themeFor(code: string) {
  return ENTITY_THEME[code] ?? DEFAULT_THEME;
}

interface EgresosYearlyViewProps {
  data: YearlyExpenses;
  availableYears: ReadonlyArray<number>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  categories: ReadonlyArray<ExpenseCategoryOption>;
  managedCategories: ReadonlyArray<ManagedExpenseCategory>;
  properties: ReadonlyArray<ExpensePropertyOption>;
  canCreate: boolean;
  canUpdate: boolean;
}

export function EgresosYearlyView({
  data,
  availableYears,
  legalEntities,
  categories,
  managedCategories,
  properties,
  canCreate,
  canUpdate,
}: EgresosYearlyViewProps) {
  const [entityFilter, setEntityFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [registerTarget, setRegisterTarget] =
    useState<RegisterExpenseContext | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [collapsedEntities, setCollapsedEntities] = useState<Set<string>>(new Set());

  function toggleEntity(code: string) {
    setCollapsedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const yearItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(availableYears.map((y) => [String(y), String(y)])),
    [availableYears],
  );

  const entityItems = useMemo<Record<string, string>>(
    () => ({
      ALL: "Todas las razones sociales",
      ...Object.fromEntries(data.entities.map((e) => [e.entityCode, e.entityCode])),
    }),
    [data.entities],
  );

  // El filtro se arma con las categorías presentes en la matriz (no solo las
  // activas), para poder filtrar por un concepto archivado que aún tiene egresos
  // históricos visibles. La captura de egresos sí usa solo las activas.
  const categoryItems = useMemo<Record<string, string>>(() => {
    const present = new Map<string, string>();
    for (const e of data.entities) {
      for (const r of e.rows) {
        if (!present.has(r.categoryId)) present.set(r.categoryId, r.categoryName);
      }
    }
    const sorted = [...present.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], "es-MX"),
    );
    return { ALL: "Todas las categorías", ...Object.fromEntries(sorted) };
  }, [data.entities]);

  const visibleEntities = useMemo<YearlyExpenseEntityGroup[]>(() => {
    return data.entities
      .filter((e) => entityFilter === "ALL" || e.entityCode === entityFilter)
      .map((e) => ({
        ...e,
        rows:
          categoryFilter === "ALL"
            ? e.rows
            : e.rows.filter((r) => r.categoryId === categoryFilter),
      }))
      .filter((e) => e.rows.length > 0);
  }, [data.entities, entityFilter, categoryFilter]);

  const filteredTotals = useMemo(() => {
    let expected = 0;
    let paid = 0;
    let concepts = 0;
    for (const e of visibleEntities) {
      expected += e.rows.reduce((acc, r) => acc + r.expectedTotal, 0);
      paid += e.rows.reduce((acc, r) => acc + r.paidTotal, 0);
      concepts += e.rows.length;
    }
    const pct = expected > 0 ? Math.round((paid / expected) * 100) : 0;
    return { expected, paid, balance: expected - paid, pct, concepts };
  }, [visibleEntities]);

  function navigateYear(delta: number) {
    const target = data.year + delta;
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(target));
    window.location.href = url.toString();
  }

  function selectYear(year: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("year", year);
    window.location.href = url.toString();
  }

  function openRegister(
    entity: YearlyExpenseEntityGroup,
    row: YearlyExpenseRow,
    cell: YearlyExpenseCell,
  ) {
    if (!cell.expenseId) return;
    setRegisterTarget({
      id: cell.expenseId,
      amount: cell.amount,
      expenseDate: cell.period,
      description: row.description,
      categoryName: row.categoryName,
      legalEntityCode: entity.entityCode,
      paymentMethod: null,
      isNotRequired: cell.isNotRequired,
    });
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateYear(-1)}
            aria-label="Año anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Select
            value={String(data.year)}
            onValueChange={(v) => v && selectYear(v)}
            items={yearItems}
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
            onClick={() => navigateYear(1)}
            aria-label="Año siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={entityFilter}
            onValueChange={(v) => v && setEntityFilter(v)}
            items={entityItems}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(entityItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(v) => v && setCategoryFilter(v)}
            items={categoryItems}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categoryItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canUpdate ? (
            <ManageCategoriesDialog categories={managedCategories} />
          ) : null}

          {canCreate ? (
            <Button onClick={() => setFormMode("create")} className="w-full sm:w-auto">
              <Plus className="size-4" />
              Registrar egreso
            </Button>
          ) : null}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<TrendingDown className="size-4" />}
          label={`Estimado ${data.year}`}
          value={formatMXN(filteredTotals.expected)}
          accent="text-foreground"
        />
        <KpiCard
          icon={<Wallet className="size-4" />}
          label="Pagado"
          value={formatMXN(filteredTotals.paid)}
          accent="text-green-700 dark:text-green-300"
        />
        <KpiCard
          icon={<AlertTriangle className="size-4" />}
          label="Por pagar"
          value={formatMXN(filteredTotals.balance)}
          accent="text-destructive"
        />
        <KpiCard
          icon={<Percent className="size-4" />}
          label="% Pagado"
          value={`${filteredTotals.pct}%`}
          accent="text-foreground"
          progress={filteredTotals.pct}
        />
      </div>

      {/* Desglose por razón social */}
      <EntityBreakdown
        groups={data.entities}
        totalExpected={data.entities.reduce(
          (acc, g) => acc + g.expectedTotal,
          0,
        )}
      />

      <Legend />

      {/* Matrices por LegalEntity */}
      <div className="space-y-6">
        {visibleEntities.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sin egresos para los filtros aplicados.
          </div>
        ) : (
          visibleEntities.map((g) => (
            <EntitySection
              key={g.entityCode}
              group={g}
              canUpdate={canUpdate}
              onCellClick={openRegister}
              collapsed={collapsedEntities.has(g.entityCode)}
              onToggle={() => toggleEntity(g.entityCode)}
            />
          ))
        )}
      </div>

      <MonthlyTotalsBar totals={data.monthlyTotals} />

      <RegisterExpenseDialog
        target={registerTarget}
        onClose={() => setRegisterTarget(null)}
      />

      <ExpenseFormDialog
        mode={formMode}
        initial={null}
        legalEntities={legalEntities}
        categories={categories}
        properties={properties}
        defaultLegalEntityId={
          entityFilter !== "ALL"
            ? legalEntities.find((e) => e.code === entityFilter)?.id ?? null
            : null
        }
        onClose={() => setFormMode(null)}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// KPI Card
// ----------------------------------------------------------------------------

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  progress?: number;
}

function KpiCard({ icon, label, value, accent, progress }: KpiCardProps) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">{icon}</span>
          {label}
        </div>
        <p
          className={cn(
            "text-xl font-semibold tabular-nums leading-none",
            accent,
          )}
        >
          {value}
        </p>
        {typeof progress === "number" && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progress >= 80
                  ? "bg-green-500"
                  : progress >= 50
                    ? "bg-amber-500"
                    : "bg-red-500",
              )}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Entity breakdown — desglose horizontal por razón social
// ----------------------------------------------------------------------------

function EntityBreakdown({
  groups,
  totalExpected,
}: {
  groups: ReadonlyArray<YearlyExpenseEntityGroup>;
  totalExpected: number;
}) {
  if (groups.length === 0) return null;
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Desglose por razón social
          </p>
          <p className="text-xs text-muted-foreground">
            Total:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMXN(totalExpected)}
            </span>
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => {
            const t = themeFor(g.entityCode);
            const sharePct =
              totalExpected > 0
                ? Math.round((g.expectedTotal / totalExpected) * 100)
                : 0;
            const paidPct =
              g.expectedTotal > 0
                ? Math.round((g.paidTotal / g.expectedTotal) * 100)
                : 0;
            return (
              <div
                key={g.entityCode}
                className={cn("rounded-lg border p-3 ring-1", t.bg, t.ring)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-full", t.dot)} />
                    <span className={cn("font-semibold", t.text)}>
                      {g.entityCode}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {g.conceptCount}{" "}
                    {g.conceptCount === 1 ? "concepto" : "conceptos"}
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {formatMXN(g.expectedTotal)}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{sharePct}% del total</span>
                  <span className="text-green-700 dark:text-green-300">
                    {paidPct}% pagado
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-background/60">
                  <div
                    className={cn("h-full rounded-full", t.dot)}
                    style={{ width: `${Math.min(100, paidPct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Legend
// ----------------------------------------------------------------------------

function Legend() {
  const items: Array<{ status: MonthlyExpenseStatus; label: string }> = [
    { status: "PAID", label: "Pagado" },
    { status: "PENDING", label: "Pendiente" },
    { status: "VACIO", label: "Vacío" },
    { status: "NOT_REQUIRED", label: "Sin egreso" },
    { status: "EMPTY", label: "Sin registro" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {items.map((i) => (
        <div key={i.status} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded border", CELL_BG[i.status])} />
          {i.label}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Entity section
// ----------------------------------------------------------------------------

interface EntitySectionProps {
  group: YearlyExpenseEntityGroup;
  canUpdate: boolean;
  onCellClick: (
    entity: YearlyExpenseEntityGroup,
    row: YearlyExpenseRow,
    cell: YearlyExpenseCell,
  ) => void;
  collapsed: boolean;
  onToggle: () => void;
}

function EntitySection({ group, canUpdate, onCellClick, collapsed, onToggle }: EntitySectionProps) {
  const theme = themeFor(group.entityCode);
  const paidPct =
    group.expectedTotal > 0
      ? Math.round((group.paidTotal / group.expectedTotal) * 100)
      : 0;

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={cn(
          "flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left ring-1 transition-colors hover:brightness-[0.98]",
          theme.bg,
          theme.ring,
        )}
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          <span
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md text-xs font-bold text-white",
              theme.dot,
            )}
          >
            {group.entityCode.slice(0, 1)}
          </span>
          <div>
            <h2
              className={cn("text-sm font-semibold leading-tight", theme.text)}
            >
              {group.entityCode}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {group.conceptCount}{" "}
              {group.conceptCount === 1 ? "concepto" : "conceptos"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Estimado
            </p>
            <p className="font-semibold tabular-nums">
              {formatMXN(group.expectedTotal)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Pagado
            </p>
            <p className="font-semibold tabular-nums text-green-700 dark:text-green-300">
              {formatMXN(group.paidTotal)}
              <span className="ml-1 text-muted-foreground">({paidPct}%)</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Por pagar
            </p>
            <p className="font-semibold tabular-nums text-destructive">
              {formatMXN(group.expectedTotal - group.paidTotal)}
            </p>
          </div>
        </div>
      </button>

      {!collapsed && (
        <ConceptMatrix
          group={group}
          canUpdate={canUpdate}
          onCellClick={onCellClick}
        />
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Concept matrix — filas (concepto) × 12 columnas mensuales
// ----------------------------------------------------------------------------

interface ConceptMatrixProps {
  group: YearlyExpenseEntityGroup;
  canUpdate: boolean;
  onCellClick: (
    entity: YearlyExpenseEntityGroup,
    row: YearlyExpenseRow,
    cell: YearlyExpenseCell,
  ) => void;
}

function ConceptMatrix({ group, canUpdate, onCellClick }: ConceptMatrixProps) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-72" />
            <col className="w-32" />
            {MONTHS_SHORT.map((m) => (
              <col key={m} className="w-20" />
            ))}
            <col className="w-32" />
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/10">
              <th className="sticky left-0 z-20 border-r border-border bg-card px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Concepto
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Categoría
              </th>
              {MONTHS_SHORT.map((m) => (
                <th
                  key={m}
                  className="px-1 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <ConceptRow
                key={row.conceptKey}
                entity={group}
                row={row}
                canUpdate={canUpdate}
                onCellClick={onCellClick}
              />
            ))}
            <tr className="border-t bg-muted/20 font-medium">
              <td className="sticky left-0 z-20 border-r border-border bg-card px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                Subtotal
              </td>
              <td className="px-3 py-2" />
              {MONTHS_SHORT.map((_, i) => {
                // NOT_REQUIRED y EMPTY no entran al subtotal — el usuario
                // los excluyó manualmente o no existen.
                const expected = group.rows.reduce((acc, r) => {
                  const cell = r.cells[i];
                  if (
                    !cell ||
                    cell.status === "EMPTY" ||
                    cell.status === "NOT_REQUIRED"
                  ) {
                    return acc;
                  }
                  return acc + cell.amount;
                }, 0);
                return (
                  <td
                    key={i}
                    className="px-1 py-2 text-center text-[10px] tabular-nums text-muted-foreground"
                  >
                    {expected > 0 ? compactMxn(expected) : "—"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right text-xs tabular-nums">
                <div className="font-semibold text-green-700 dark:text-green-300">
                  {formatMXN(group.paidTotal)}
                </div>
                <div className="text-muted-foreground">
                  de {formatMXN(group.expectedTotal)}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function compactMxn(n: number): string {
  if (n === 0) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

// ----------------------------------------------------------------------------
// Concept row
// ----------------------------------------------------------------------------

interface ConceptRowProps {
  entity: YearlyExpenseEntityGroup;
  row: YearlyExpenseRow;
  canUpdate: boolean;
  onCellClick: (
    entity: YearlyExpenseEntityGroup,
    row: YearlyExpenseRow,
    cell: YearlyExpenseCell,
  ) => void;
}

function ConceptRow({ entity, row, canUpdate, onCellClick }: ConceptRowProps) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20">
      <td className="sticky left-0 z-20 border-r border-border bg-card px-3 py-1.5">
        <div className="truncate text-sm font-medium" title={row.description}>
          {row.description}
        </div>
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {row.categoryName}
          {row.isPayroll && (
            <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              Nómina
            </span>
          )}
        </span>
      </td>
      {row.cells.map((cell, i) => (
        <td key={i} className="px-1 py-1.5">
          <MatrixCell
            cell={cell}
            canUpdate={canUpdate}
            onClick={() => onCellClick(entity, row, cell)}
            tooltipHead={`${row.description} — ${formatPeriodLong(cell.period)}`}
          />
        </td>
      ))}
      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
        <div className="font-medium text-green-700 dark:text-green-300">
          {formatMXN(row.paidTotal)}
        </div>
        <div className="text-muted-foreground">
          de {formatMXN(row.expectedTotal)}
        </div>
      </td>
    </tr>
  );
}

// ----------------------------------------------------------------------------
// Cell
// ----------------------------------------------------------------------------

const CELL_BG: Record<MonthlyExpenseStatus, string> = {
  PAID: "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-500",
  PENDING: "bg-amber-400 hover:bg-amber-500 dark:bg-amber-500",
  VACIO: "bg-slate-200 dark:bg-slate-700/60",
  NOT_REQUIRED: "bg-slate-300 dark:bg-slate-600 border-slate-400 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(0,0,0,0.08)_3px,rgba(0,0,0,0.08)_5px)]",
  EMPTY: "bg-muted",
};

interface MatrixCellProps {
  cell: YearlyExpenseCell;
  canUpdate: boolean;
  onClick: () => void;
  tooltipHead: string;
}

function MatrixCell({ cell, canUpdate, onClick, tooltipHead }: MatrixCellProps) {
  const tooltip = buildTooltip(cell, tooltipHead);
  // Cells sin registro o de meses futuros no se pueden editar.
  const clickable =
    canUpdate &&
    cell.expenseId !== null &&
    cell.status !== "VACIO" &&
    cell.status !== "EMPTY";

  if (cell.status === "EMPTY") {
    return (
      <div
        title={tooltip}
        className={cn("mx-auto h-6 w-full rounded", CELL_BG.EMPTY)}
      />
    );
  }

  const content =
    cell.status === "NOT_REQUIRED" ? (
      <span className="block w-full px-1 text-center text-[10px] font-semibold text-slate-700 dark:text-slate-200">
        —
      </span>
    ) : cell.status === "VACIO" ? (
      <span className="block w-full px-1 text-center text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
        {compactMxn(cell.amount)}
      </span>
    ) : (
      <span className="block w-full px-1 text-center text-[10px] font-medium tabular-nums text-white drop-shadow-sm">
        {compactMxn(cell.amount)}
      </span>
    );

  if (!clickable) {
    return (
      <div
        title={tooltip}
        className={cn(
          "mx-auto flex h-6 w-full items-center justify-center rounded transition-colors",
          CELL_BG[cell.status],
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      className={cn(
        "mx-auto flex h-6 w-full items-center justify-center rounded transition-colors",
        CELL_BG[cell.status],
      )}
    >
      {content}
    </button>
  );
}

function buildTooltip(cell: YearlyExpenseCell, head: string): string {
  if (cell.status === "EMPTY") return `${head} — Sin registro`;
  const monto = formatMXN(cell.amount, 2);
  switch (cell.status) {
    case "PAID":
      return `${head}\nPagado: ${monto}`;
    case "PENDING":
      return `${head}\nPendiente: ${monto} — Click para registrar`;
    case "VACIO":
      return `${head}\nVacío (mes futuro): ${monto} estimado`;
    case "NOT_REQUIRED":
      return `${head}\nSin egreso — Marcado como no aplica este mes`;
    default:
      return head;
  }
}

// ----------------------------------------------------------------------------
// Monthly totals bar (footer)
// ----------------------------------------------------------------------------

function MonthlyTotalsBar({
  totals,
}: {
  totals: YearlyExpenses["monthlyTotals"];
}) {
  const peakExpected = Math.max(...totals.map((t) => t.expected), 1);
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <h3 className="text-sm font-semibold">Totales mensuales</h3>
        <p className="text-xs text-muted-foreground">
          12 meses · estimado vs. pagado
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/10">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Mes</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimado</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagado</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">% Pagado</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagados</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t, i) => {
              const pct =
                t.expected > 0 ? Math.round((t.paid / t.expected) * 100) : 0;
              const barWidth = (t.expected / peakExpected) * 100;
              const fillWidth =
                t.expected > 0 ? (t.paid / t.expected) * 100 : 0;
              return (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5">
                    {formatPeriodLong(t.period)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMXN(t.expected)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-green-700 dark:text-green-300">
                    {formatMXN(t.paid)}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="relative h-2 overflow-hidden rounded-full bg-muted"
                        style={{ width: `${Math.max(20, barWidth)}%` }}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full",
                            pct >= 80
                              ? "bg-green-500"
                              : pct >= 50
                                ? "bg-amber-500"
                                : pct > 0
                                  ? "bg-red-500"
                                  : "bg-transparent",
                          )}
                          style={{ width: `${Math.min(100, fillWidth)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {t.paidCount}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right tabular-nums",
                      t.pendingCount > 0 && "text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {t.pendingCount}
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
