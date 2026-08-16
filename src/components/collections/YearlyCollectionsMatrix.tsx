"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RegisterPaymentDialog,
  type RegisterPaymentDialogContext,
} from "@/components/collections/RegisterPaymentDialog";
import { capitalizeFirst, cn } from "@/shared/utils";
import type {
  MonthlyUnitStatus,
  YearlyCell,
  YearlyCollections,
  YearlyPropertyGroup,
  YearlyUnitRow,
} from "@/server/services/payments-queries";
import { formatMXN } from "@/shared/format-currency";

// Alias local: mismo output que la const Intl que existía aquí (2 decimales).
const mxn = (v: number | string) => formatMXN(v, 2);

const PERIOD_FULL = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Línea divisora gris superpuesta (pseudo-elemento absoluto, no afecta el
// layout de la tabla) en el borde derecho de la columna del mes actual: separa
// el mes en curso de los meses siguientes. Se aplica solo cuando el año
// mostrado es el año en curso. `pointer-events-none` para no bloquear clicks.
const CURRENT_MONTH_DIVIDER =
  "relative after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:bg-slate-300 after:content-[''] dark:after:bg-slate-600";

interface YearlyCollectionsMatrixProps {
  data: YearlyCollections;
  /** Lista de años con datos (o cercanos) para el selector. */
  availableYears: ReadonlyArray<number>;
}

export function YearlyCollectionsMatrix({
  data,
  availableYears,
}: YearlyCollectionsMatrixProps) {
  const [propertyFilter, setPropertyFilter] = useState<string>("ALL");
  const [paymentContext, setPaymentContext] =
    useState<RegisterPaymentDialogContext | null>(null);

  const propertyItems = useMemo<Record<string, string>>(
    () => ({
      ALL: "Todas las plazas",
      ...Object.fromEntries(data.properties.map((p) => [p.propertyId, p.propertyName])),
    }),
    [data.properties],
  );

  const yearItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(availableYears.map((y) => [String(y), String(y)])),
    [availableYears],
  );

  const visibleGroups = useMemo(() => {
    if (propertyFilter === "ALL") return data.properties;
    return data.properties.filter((p) => p.propertyId === propertyFilter);
  }, [data.properties, propertyFilter]);

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

  // Totales del año visible (después de filtros).
  const filteredTotals = useMemo(() => {
    let expected = 0;
    let paid = 0;
    for (const g of visibleGroups) {
      expected += Number(g.expectedTotal);
      paid += Number(g.paidTotal);
    }
    return { expected, paid, balance: expected - paid };
  }, [visibleGroups]);

  // Índice (0-11) de la columna del mes actual para dibujar el divisor; null si
  // el año mostrado no es el año en curso (no hay "mes actual" que marcar).
  const now = new Date();
  const dividerMonthIndex =
    data.year === now.getFullYear() ? now.getMonth() : null;

  return (
    <div className="space-y-5">
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

        <div className="flex flex-1 items-center gap-6 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Esperado</p>
            <p className="font-semibold tabular-nums">
              {formatMXN(filteredTotals.expected)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cobrado</p>
            <p className="font-semibold tabular-nums text-green-700 dark:text-green-300">
              {formatMXN(filteredTotals.paid)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Por cobrar</p>
            <p className="font-semibold tabular-nums text-destructive">
              {formatMXN(filteredTotals.balance)}
            </p>
          </div>
        </div>

        <Select
          value={propertyFilter}
          onValueChange={(v) => v && setPropertyFilter(v)}
          items={propertyItems}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(propertyItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Legend />

      <div className="space-y-4">
        {visibleGroups.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sin inmuebles para los filtros aplicados.
          </div>
        ) : (
          visibleGroups.map((g) => (
            <PropertyMatrix
              key={g.propertyId}
              group={g}
              onCellClick={setPaymentContext}
              dividerMonthIndex={dividerMonthIndex}
            />
          ))
        )}
      </div>

      <MonthlyTotalsBar totals={data.monthlyTotals} />

      <RegisterPaymentDialog
        context={paymentContext}
        open={paymentContext !== null}
        onOpenChange={(o) => !o && setPaymentContext(null)}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Legend
// ----------------------------------------------------------------------------

function Legend() {
  const items: Array<{ status: MonthlyUnitStatus; label: string }> = [
    { status: "PAID", label: "Pagado" },
    { status: "PARTIAL", label: "Parcial" },
    { status: "SIN_PAGO", label: "Sin pago" },
    { status: "FUTURO", label: "No vencido" },
    { status: "VACANT", label: "Vacío" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {items.map((i) => (
        <div key={i.status} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded", CELL_BG[i.status])} />
          {i.label}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Property matrix
// ----------------------------------------------------------------------------

const PROPERTY_DOT_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-orange-500",
];

function dotColorFor(propertyId: string): string {
  let hash = 0;
  for (let i = 0; i < propertyId.length; i++) {
    hash = (hash * 31 + propertyId.charCodeAt(i)) >>> 0;
  }
  return PROPERTY_DOT_COLORS[hash % PROPERTY_DOT_COLORS.length]!;
}

interface PropertyMatrixProps {
  group: YearlyPropertyGroup;
  onCellClick: (ctx: RegisterPaymentDialogContext) => void;
  dividerMonthIndex: number | null;
}

function PropertyMatrix({ group, onCellClick, dividerMonthIndex }: PropertyMatrixProps) {
  const collected =
    Number(group.expectedTotal) > 0
      ? Math.round((Number(group.paidTotal) / Number(group.expectedTotal)) * 100)
      : 0;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", dotColorFor(group.propertyId))} />
          <h3 className="font-semibold">{group.propertyName}</h3>
          <span className="text-xs text-muted-foreground">
            {group.managerEntityCode} · {group.unitCount} locales
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-muted-foreground">Esperado: </span>
            <span className="font-semibold tabular-nums">
              {formatMXN(Number(group.expectedTotal))}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Cobrado: </span>
            <span className="font-semibold tabular-nums text-green-700 dark:text-green-300">
              {formatMXN(Number(group.paidTotal))}
            </span>
            <span className="ml-1 text-muted-foreground">({collected}%)</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b bg-muted/10">
              <th className="sticky left-0 z-10 bg-muted/10 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Local
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Inquilino</th>
              {MONTHS_SHORT.map((m, i) => (
                <th
                  key={m}
                  className={cn(
                    "px-1 py-2 text-center font-medium text-muted-foreground",
                    i === dividerMonthIndex && CURRENT_MONTH_DIVIDER,
                  )}
                >
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {group.units.map((u) => (
              <UnitMatrixRow
                key={u.unitId}
                row={u}
                propertyName={group.propertyName}
                onCellClick={onCellClick}
                dividerMonthIndex={dividerMonthIndex}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Unit row
// ----------------------------------------------------------------------------

interface UnitMatrixRowProps {
  row: YearlyUnitRow;
  propertyName: string;
  onCellClick: (ctx: RegisterPaymentDialogContext) => void;
  dividerMonthIndex: number | null;
}

function UnitMatrixRow({ row, propertyName, onCellClick, dividerMonthIndex }: UnitMatrixRowProps) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20">
      <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-mono text-xs">
        {row.unitCode}
      </td>
      <td className="max-w-[200px] truncate px-3 py-1.5">
        {row.currentLesseeName ? (
          <span className="text-sm">{row.currentLesseeName}</span>
        ) : (
          <span className="text-xs italic text-muted-foreground">Vacío</span>
        )}
      </td>
      {row.cells.map((cell, i) => (
        <td
          key={i}
          className={cn("px-1 py-1.5", i === dividerMonthIndex && CURRENT_MONTH_DIVIDER)}
        >
          <MatrixCell
            cell={cell}
            unitCode={row.unitCode}
            propertyName={propertyName}
            lesseeName={row.currentLesseeName}
            onClick={onCellClick}
          />
        </td>
      ))}
      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
        <div className="font-medium text-green-700 dark:text-green-300">
          {formatMXN(Number(row.paidTotal))}
        </div>
        <div className="text-muted-foreground">
          de {formatMXN(Number(row.expectedTotal))}
        </div>
      </td>
    </tr>
  );
}

// ----------------------------------------------------------------------------
// Cell
// ----------------------------------------------------------------------------

const CELL_BG: Record<MonthlyUnitStatus, string> = {
  PAID: "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-500",
  PARTIAL: "bg-amber-400 hover:bg-amber-500 dark:bg-amber-500",
  SIN_PAGO: "bg-red-500 hover:bg-red-600 dark:bg-red-600",
  FUTURO: "bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600",
  WAIVED: "bg-blue-300 hover:bg-blue-400 dark:bg-blue-400 dark:hover:bg-blue-300",
  VACANT: "bg-muted hover:bg-muted-foreground/20",
};

interface MatrixCellProps {
  cell: YearlyCell;
  unitCode: string;
  propertyName: string;
  lesseeName: string | null;
  onClick: (ctx: RegisterPaymentDialogContext) => void;
}

function MatrixCell({ cell, unitCode, propertyName, lesseeName, onClick }: MatrixCellProps) {
  const tooltip = buildTooltip(cell, lesseeName);
  const clickable = cell.rentId !== null;
  // Mostrar cruz si la renta tiene cualquier monto condonado (parcial o total).
  const hasWaiver = Number(cell.amountWaived) > 0;

  if (!clickable) {
    return (
      <div
        title={tooltip}
        className={cn(
          "relative mx-auto h-6 w-6 rounded transition-colors",
          CELL_BG[cell.status],
          cell.overdueLevel === 3 && "ring-2 ring-red-700",
          hasWaiver && "ring-2 ring-black",
        )}
      >
        {hasWaiver ? (
          <X
            className="absolute inset-0 m-auto size-5 text-black"
            strokeWidth={3.5}
          />
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={tooltip}
      onClick={() =>
        onClick({
          rentId: cell.rentId!,
          amountDue: cell.amountDue,
          amountPaid: cell.amountPaid,
          amountWaived: cell.amountWaived,
          period: cell.period,
          lesseeName: lesseeName ?? "",
          unitLabel: `${propertyName} ${unitCode}`,
        })
      }
      className={cn(
        "relative mx-auto block h-6 w-6 rounded transition-colors",
        CELL_BG[cell.status],
        cell.overdueLevel === 3 && "ring-2 ring-red-700",
        hasWaiver && "ring-2 ring-black",
      )}
    >
      {hasWaiver ? (
        <X
          className="pointer-events-none absolute inset-0 m-auto size-5 text-black"
          strokeWidth={3.5}
        />
      ) : null}
    </button>
  );
}

function buildTooltip(cell: YearlyCell, lesseeName: string | null): string {
  const period = capitalizeFirst(PERIOD_FULL.format(cell.period));
  if (cell.status === "VACANT") {
    return `${period} — Vacío`;
  }
  const head = lesseeName ? `${lesseeName} — ${period}` : period;
  switch (cell.status) {
    case "PAID":
      return `${head}\nPagado ${mxn(Number(cell.amountPaid))}`;
    case "PARTIAL":
      return `${head}\nParcial: ${mxn(Number(cell.amountPaid))} de ${mxn(Number(cell.amountDue))}`;
    case "SIN_PAGO":
      return `${head}\nSin pago — ${mxn(Number(cell.amountDue))}${cell.overdueLevel ? ` · Escalón ${cell.overdueLevel}` : ""}`;
    case "FUTURO":
      return `${head}\nNo vencido — ${mxn(Number(cell.amountDue))}`;
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
  totals: YearlyCollections["monthlyTotals"];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Mes</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Esperado</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobrado</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">% Cobrado</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagados</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Sin pago</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t, i) => {
            const expected = Number(t.expected);
            const paid = Number(t.paid);
            const pct = expected > 0 ? Math.round((paid / expected) * 100) : 0;
            return (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-3 py-1.5">{capitalizeFirst(PERIOD_FULL.format(t.period))}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatMXN(expected)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-green-700 dark:text-green-300">
                  {formatMXN(paid)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pct}%</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{t.paidCount}</td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    t.sinPagoCount > 0 && "text-red-700 dark:text-red-300",
                  )}
                >
                  {t.sinPagoCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
