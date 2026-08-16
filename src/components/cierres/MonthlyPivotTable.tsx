"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/utils";
import { formatMXN } from "@/shared/format-currency";
import { Sparkline } from "./Sparkline";
import type { MatrixRow, Monthly12 } from "@/server/services/cierres-queries";

const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export interface EntityTheme {
  dot: string;
  ring: string;
  badge: string;
  bar: string;
  soft: string;
  cellHover: string;
  /** Color de relleno para sparklines SVG (fill-* de tailwind). */
  spark: string;
}

export const ENTITY_THEME: Record<string, EntityTheme> = {
  CRT: {
    dot: "bg-orange-500",
    ring: "ring-orange-200 dark:ring-orange-900/50",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    bar: "bg-orange-500",
    soft: "bg-orange-50/40 dark:bg-orange-950/20",
    cellHover: "hover:bg-orange-50/40",
    spark: "fill-orange-500",
  },
  TSR: {
    dot: "bg-blue-500",
    ring: "ring-blue-200 dark:ring-blue-900/50",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    bar: "bg-blue-500",
    soft: "bg-blue-50/40 dark:bg-blue-950/20",
    cellHover: "hover:bg-blue-50/40",
    spark: "fill-blue-500",
  },
  QHS: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-200 dark:ring-emerald-900/50",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    bar: "bg-emerald-500",
    soft: "bg-emerald-50/40 dark:bg-emerald-950/20",
    cellHover: "hover:bg-emerald-50/40",
    spark: "fill-emerald-500",
  },
  JCL: {
    dot: "bg-violet-500",
    ring: "ring-violet-200 dark:ring-violet-900/50",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    bar: "bg-violet-500",
    soft: "bg-violet-50/40 dark:bg-violet-950/20",
    cellHover: "hover:bg-violet-50/40",
    spark: "fill-violet-500",
  },
};

export const DEFAULT_THEME: EntityTheme = {
  dot: "bg-slate-500",
  ring: "ring-slate-200 dark:ring-slate-800",
  badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  bar: "bg-slate-500",
  soft: "bg-slate-50/40 dark:bg-slate-950/20",
  cellHover: "hover:bg-slate-50/40",
  spark: "fill-slate-500",
};

export function themeFor(code: string): EntityTheme {
  return ENTITY_THEME[code] ?? DEFAULT_THEME;
}

interface MonthlyPivotTableProps {
  /** Label principal en negrita del header (ej. "CRT", "ESTRATEGIA"). */
  headerCode: string;
  /** "CRT", "TSR", "QHS", o un código libre que define el theme. */
  entityCode?: string;
  /** Theme custom (override) — para bloques sin entidad (Estrategia, Inversiones). */
  theme?: EntityTheme;
  /**
   * Plural del tipo de fila — singular se calcula quitando la 's' final.
   * Ej: "inmuebles", "categorías", "conceptos".
   */
  rowCountLabel: string;
  /** Etiqueta de la primera columna ("Inmueble", "Categoría", etc.). */
  firstColLabel: string;
  rows: MatrixRow[];
  monthlyTotals: Monthly12;
  grandTotal: string;
  /** Mensaje cuando no hay filas. */
  emptyMessage?: string;
  /**
   * Mes (1-12) a resaltar visualmente. Si se pasa, esa columna se pinta
   * con fondo de acento.
   */
  highlightMonth?: number | null;
  /**
   * Callback al hacer clic en una celda mensual. Si se proporciona, la celda
   * es interactiva (button). Si no, es texto plano.
   */
  onMonthClick?: (month: number) => void;
  /** Si true, oculta la fila TOTAL (útil cuando la matriz es una sola fila). */
  hideTotalRow?: boolean;
  /** Si true, viene colapsado (default). Si false, abre por default. */
  defaultCollapsed?: boolean;
}

export function MonthlyPivotTable({
  headerCode,
  entityCode,
  theme: themeOverride,
  rowCountLabel,
  firstColLabel,
  rows,
  monthlyTotals,
  grandTotal,
  emptyMessage = "Sin movimientos registrados en este periodo.",
  highlightMonth = null,
  onMonthClick,
  hideTotalRow = false,
  defaultCollapsed = true,
}: MonthlyPivotTableProps) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const theme = themeOverride ?? (entityCode ? themeFor(entityCode) : DEFAULT_THEME);

  const rowCount = rows.length;
  const rowCountSingular = rowCountLabel.endsWith("s")
    ? rowCountLabel.slice(0, -1)
    : rowCountLabel;

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30",
          theme.soft,
        )}
      >
        <span
          className={cn("size-2.5 shrink-0 rounded-full", theme.dot)}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{headerCode}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                theme.badge,
              )}
            >
              {rowCount} {rowCount === 1 ? rowCountSingular : rowCountLabel}
            </span>
          </div>
        </div>
        <Sparkline
          values={monthlyTotals}
          className={cn("hidden sm:block", theme.spark)}
        />
        <div className="hidden text-right sm:block">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total
          </div>
          <div className="font-mono text-sm font-semibold tabular-nums">
            {formatMXN(Number(grandTotal))}
          </div>
        </div>
        <div className="shrink-0 rounded p-1 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <table className="w-full min-w-[900px] text-xs">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium">
                    {firstColLabel}
                  </th>
                  {MONTHS_SHORT.map((m, idx) => {
                    const isHighlight = highlightMonth === idx + 1;
                    return (
                      <th
                        key={m}
                        className={cn(
                          "px-2 py-2 text-right font-medium",
                          isHighlight && "bg-foreground/5 text-foreground",
                        )}
                      >
                        {m}
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-right font-semibold text-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className={cn("border-b last:border-b-0", theme.cellHover)}
                  >
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium text-foreground">
                      <div className="flex items-baseline gap-1.5">
                        <span>{row.label}</span>
                        {row.sublabel ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {row.sublabel}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {row.monthly.map((value, idx) => (
                      <PivotCell
                        key={idx}
                        value={value}
                        month={idx + 1}
                        highlight={highlightMonth === idx + 1}
                        {...(onMonthClick ? { onClick: onMonthClick } : {})}
                      />
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {Number(row.total) === 0 ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        formatMXN(Number(row.total))
                      )}
                    </td>
                  </tr>
                ))}
                {!hideTotalRow && (
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-left">
                      TOTAL
                    </td>
                    {monthlyTotals.map((value, idx) => {
                      const isHighlight = highlightMonth === idx + 1;
                      return (
                        <td
                          key={idx}
                          className={cn(
                            "px-2 py-2 text-right tabular-nums",
                            isHighlight && "bg-foreground/5",
                          )}
                        >
                          {Number(value) === 0 ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : (
                            formatMXN(Number(value))
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMXN(Number(grandTotal))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

interface PivotCellProps {
  value: string;
  month: number;
  highlight?: boolean;
  onClick?: (month: number) => void;
}

function PivotCell({ value, month, highlight, onClick }: PivotCellProps) {
  const num = Number(value);
  const display = num === 0 ? null : formatMXN(num);
  const isNegative = num < 0;

  const cellBg = highlight ? "bg-foreground/5" : "";

  if (onClick) {
    return (
      <td className={cn("p-0 text-right tabular-nums", cellBg)}>
        <button
          type="button"
          onClick={() => onClick(month)}
          className={cn(
            "block w-full rounded px-2 py-2 text-right transition-colors hover:bg-foreground/10 hover:text-foreground",
            isNegative ? "text-rose-600" : "",
          )}
        >
          {display ?? <span className="text-muted-foreground/40">—</span>}
        </button>
      </td>
    );
  }

  return (
    <td
      className={cn(
        "px-2 py-2 text-right tabular-nums",
        cellBg,
        isNegative ? "text-rose-600" : "",
      )}
    >
      {display ?? <span className="text-muted-foreground/40">—</span>}
    </td>
  );
}
