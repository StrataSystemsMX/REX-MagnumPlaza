"use client";

import { TrendingDown, Wallet, AlertTriangle, Percent, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import {
  EntityBreakdownCard,
  EntitySectionHeader,
  KpiCard,
  MonthlyTotalsBar,
  YearNavigator,
} from "@/components/shared/yearly-matrix/YearlyMatrixParts";
import { MONTHS_SHORT, compactMxn } from "@/components/shared/yearly-matrix/theme";
import { cn } from "@/shared/utils";
import { formatMXN } from "@/shared/format-currency";
import { formatPeriodLong } from "@/shared/format-date";
import type {
  MonthlyExpenseStatus,
  YearlyExpenseCell,
  YearlyExpenseEntityGroup,
  YearlyExpenseRow,
  YearlyExpenses,
  ExpenseCategoryOption,
  ExpensePropertyOption,
  ManagedExpenseCategory,
} from "@/server/services/expenses-queries";
import type { LegalEntityOption } from "@/server/services/properties-queries";

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

function entityMeta(g: YearlyExpenseEntityGroup): string {
  return `${g.conceptCount} ${g.conceptCount === 1 ? "concepto" : "conceptos"}`;
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
        <YearNavigator year={data.year} availableYears={availableYears} />

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
      <EntityBreakdownCard
        items={data.entities.map((g) => ({
          code: g.entityCode,
          total: g.expectedTotal,
          meta: entityMeta(g),
          paidPct:
            g.expectedTotal > 0
              ? Math.round((g.paidTotal / g.expectedTotal) * 100)
              : 0,
        }))}
        totalExpected={data.entities.reduce((acc, g) => acc + g.expectedTotal, 0)}
        paidWord="pagado"
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

      <MonthlyTotalsBar
        rows={data.monthlyTotals.map((t) => ({
          period: t.period,
          expected: t.expected,
          paid: t.paid,
          paidCount: t.paidCount,
          lastCount: t.pendingCount,
        }))}
        subtitle="12 meses · estimado vs. pagado"
        expectedHeader="Estimado"
        paidHeader="Pagado"
        pctHeader="% Pagado"
        lastHeader="Pendientes"
        lastAccentClass="text-amber-700 dark:text-amber-300"
      />

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
  const paidPct =
    group.expectedTotal > 0
      ? Math.round((group.paidTotal / group.expectedTotal) * 100)
      : 0;

  return (
    <section className="space-y-3">
      <EntitySectionHeader
        code={group.entityCode}
        meta={entityMeta(group)}
        collapsed={collapsed}
        onToggle={onToggle}
        stats={[
          { label: "Estimado", value: formatMXN(group.expectedTotal) },
          {
            label: "Pagado",
            value: (
              <>
                {formatMXN(group.paidTotal)}
                <span className="ml-1 text-muted-foreground">({paidPct}%)</span>
              </>
            ),
            className: "text-green-700 dark:text-green-300",
          },
          {
            label: "Por pagar",
            value: formatMXN(group.expectedTotal - group.paidTotal),
            className: "text-destructive",
          },
        ]}
      />

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
